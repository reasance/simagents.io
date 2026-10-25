import { expect, test } from 'bun:test';
import { createAdmission, ACCESS_TTL_SECONDS, TURNSTILE_ACTION, type AdmissionEnv } from '../worker';
import { quotaNamespace } from '../../../relay/src/__tests__/quota-fixture';
import { metricsOperation } from '../../../relay/src/quota';
import { verifyRelayToken } from '../../../relay/src/access';
const origin='https://app.example.test',secret='synthetic-signing-secret-not-for-deployment';
const clock=()=>Math.floor(Date.now()/1000);
function env():AdmissionEnv{return{AUTH_SECRET:secret,TURNSTILE_SECRET:'synthetic-turnstile-secret',ALLOWED_ORIGINS:origin,TURNSTILE_HOSTNAMES:'app.example.test',SUBJECT_QUOTAS:quotaNamespace().namespace,ADMISSION_LIMITER:{limit:async()=>({success:true})}};}
const request=(body:unknown={proof:'proof'},extra:Record<string,string>={})=>new Request('https://admission.example.test/v1/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...extra},body:JSON.stringify(body)});
const result=(extra={})=>({success:true,hostname:'app.example.test',action:TURNSTILE_ACTION,challenge_ts:new Date().toISOString(),...extra});
test('server-side admission issues a memory-use token for 15 minutes without forwarding provider data',async()=>{
 let calls=0;const handler=createAdmission((async(url: RequestInfo | URL,init?: RequestInit)=>{calls++;expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');const body=JSON.parse(String(init?.body));expect(body).toEqual({secret:'synthetic-turnstile-secret',response:'proof'});return Response.json(result());}) as unknown as typeof fetch);
 const response=await handler(request(),env());expect(response.status).toBe(200);const body=await response.json() as{token:string;expiresAt:number;renewAt:number};const claims=await verifyRelayToken(body.token,secret,origin);expect(claims.exp-claims.iat).toBe(ACCESS_TTL_SECONDS);expect(body.renewAt).toBe(body.expiresAt-120);expect(calls).toBe(1);expect(JSON.stringify(body)).not.toContain('192.0.2.1');
});
test.each([{success:false},{hostname:'evil.test'},{action:'other'},{challenge_ts:new Date(Date.now()-301000).toISOString()}])('invalid proof binding %j never issues access',async extra=>{
 const handler=createAdmission((async()=>Response.json(result(extra)))as unknown as typeof fetch);expect((await handler(request(),env())).status).toBe(403);
});
test('a reused proof is rejected by the siteverify protocol; no retry occurs',async()=>{
 let count=0;const handler=createAdmission((async()=>Response.json(count++?{success:false,'error-codes':['timeout-or-duplicate']}:result()))as unknown as typeof fetch);const settings=env();expect((await handler(request(),settings)).status).toBe(200);expect((await handler(request(),settings)).status).toBe(403);expect(count).toBe(2);
});
test('renewal authenticates and retains the original subject and origin',async()=>{
 const handler=createAdmission((async()=>Response.json(result()))as unknown as typeof fetch),settings=env();const first=await(await handler(request(),settings)).json() as{token:string};const second=await(await handler(request({proof:'next-proof',previousToken:first.token}),settings)).json() as{token:string};expect((await verifyRelayToken(first.token,secret,origin)).sub).toBe((await verifyRelayToken(second.token,secret,origin)).sub);
 expect((await handler(request({proof:'another',previousToken:'invalid-token'}),settings)).status).toBe(401);
});
test('hostile origin and missing configuration fail before siteverify',async()=>{
 let calls=0;const handler=createAdmission((async()=>{calls++;return Response.json(result());})as unknown as typeof fetch);expect((await handler(request({}, {Origin:'https://evil.test'}),env())).status).toBe(403);expect((await handler(request(),{...env(),TURNSTILE_SECRET:''})).status).toBe(503);expect(calls).toBe(0);
});
test('token issuance has coordinated IP-fingerprint limits and stores no raw IP or proof',async()=>{
 const quotas=quotaNamespace(),settings={...env(),SUBJECT_QUOTAS:quotas.namespace};const handler=createAdmission((async()=>Response.json(result()))as unknown as typeof fetch);for(let i=0;i<4;i++)expect((await handler(request({proof:`proof-${i}`}),settings)).status).toBe(200);expect((await handler(request(),settings)).status).toBe(429);const saved=JSON.stringify([...quotas.entries.keys()]);expect([...quotas.entries.keys()]).toEqual(['simagents-quota-coordinator-v2']);expect(saved).not.toContain('192.0.2.1');expect(saved).not.toContain('proof-');expect(saved).not.toContain('synthetic-turnstile-secret');
});
test('CORS preflight permits only POST and Content-Type', async () => {
  let calls = 0;
  const handler = createAdmission((async () => { calls++; return Response.json(result()); }) as unknown as typeof fetch);
  const preflight = (method: string, requestedHeaders: string) => new Request('https://admission.example.test/v1/session', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': requestedHeaders },
  });
  const allowed = await handler(preflight('POST', 'content-type'), env());
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get('Access-Control-Max-Age')).toBe('7200');
  expect((await handler(preflight('GET', 'content-type'), env())).status).toBe(405);
  expect((await handler(preflight('POST', 'x-provider-key'), env())).status).toBe(400);
  expect(calls).toBe(0);
});
test('invalid and oversized client bodies are distinguished without verifying proofs', async () => {
  let calls = 0;
  const handler = createAdmission((async () => { calls++; return Response.json(result()); }) as unknown as typeof fetch);
  expect((await handler(request({ proof: 'proof', providerKey: 'do-not-accept' }), env())).status).toBe(400);
  expect((await handler(request({ proof: 'x'.repeat(9000) }), env())).status).toBe(413);
  expect(calls).toBe(0);
});
test('network failure and malformed verification are unavailable, with no retries or payload leak', async () => {
  for (const transport of [async () => { throw new Error('secret-provider-payload'); }, async () => new Response('invalid-json')]) {
    let calls = 0;
    const handler = createAdmission((async () => { calls++; return transport(); }) as unknown as typeof fetch);
    const response = await handler(request(), env());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":{"code":"verification-unavailable"}}');
    expect(calls).toBe(1);
  }
});
test('a stalled client body is cancelled by the whole-request deadline', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
  const input = new Request('https://admission.example.test/v1/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: stream });
  const handler = createAdmission((async () => { throw new Error('must-not-verify'); }) as unknown as typeof fetch, clock, 30);
  expect((await handler(input, env())).status).toBe(504);
  expect(cancelled).toBe(true);
});
test('stalled coordinators and siteverify cannot hold an admission request indefinitely', async () => {
  const never = () => new Promise<Response>(() => {});
  const handler = createAdmission(never as unknown as typeof fetch, clock, 30);
  expect((await handler(request(), env())).status).toBe(504);
  const settings = env();
  settings.ADMISSION_LIMITER = { limit: () => new Promise(() => {}) };
  expect((await handler(request(), settings)).status).toBe(504);
});
test('cold readiness rejects issuance before consuming a proof; status does not disclose a subject', async () => {
  const { SubjectQuota } = await import('../../../relay/src/quota');
  let now=0,calls=0;const coordinator=new SubjectQuota({},undefined,()=>now);
  const namespace={idFromName:(name:string)=>name,get:(_id:unknown)=>({fetch:(r:Request)=>coordinator.fetch(r)})};
  const settings={...env(),SUBJECT_QUOTAS:namespace};
  const handler=createAdmission((async()=>{calls++;return Response.json(result());}) as unknown as typeof fetch);
  const status=await handler(new Request('https://admission.example.test/v1/status',{headers:{Origin:origin}}),settings);
  expect(status.status).toBe(503);expect(await status.json()).toEqual({ready:false,retryAfter:90});
  expect((await handler(request(),settings)).status).toBe(503);expect(calls).toBe(0);
  now=90000;expect((await handler(new Request('https://admission.example.test/v1/status',{headers:{Origin:origin}}),settings)).status).toBe(200);
  expect((await handler(request(),settings)).status).toBe(200);expect(calls).toBe(1);
});

test('initial admission and renewal publish only aggregate outcomes; monitor reads never verify a proof',async()=>{
 const quotas=quotaNamespace(),settings={...env(),SUBJECT_QUOTAS:quotas.namespace,METRICS_SECRET:'dedicated-monitor-secret-not-a-signing-key'};
 let siteverifyCalls=0;
 const handler=createAdmission((async()=>{siteverifyCalls++;return Response.json(result());})as unknown as typeof fetch);
 const first=await(await handler(request(),settings)).json() as {token:string};
 expect((await handler(request({proof:'new-proof',previousToken:first.token}),settings)).status).toBe(200);
 const snapshot=await(await metricsOperation(quotas.namespace)).json() as {operations:Record<string,number>;requests:number};
 expect(snapshot.requests).toBe(2);expect(snapshot.operations['admission-initial']).toBe(1);expect(snapshot.operations['admission-renewal']).toBe(1);
 const monitor=(key:string)=>new Request('https://admission.example.test/v1/metrics',{headers:{Origin:origin,Authorization:`Bearer ${key}`}});
 expect((await handler(monitor(secret),settings)).status).toBe(401);
 const response=await handler(monitor(settings.METRICS_SECRET),settings);expect(response.status).toBe(200);
 const text=await response.text();for(const value of [secret,settings.TURNSTILE_SECRET,settings.METRICS_SECRET,first.token,'192.0.2.1','new-proof'])expect(text).not.toContain(value);
 expect(siteverifyCalls).toBe(2);expect((await(await metricsOperation(quotas.namespace)).json() as {requests:number}).requests).toBe(2);
});
