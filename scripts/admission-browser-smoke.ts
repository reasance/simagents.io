// Actual admission/relay handlers, synthetic widget/provider, simulated admission clock only.
import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { createAdmission, type AdmissionEnv } from '../apps/admission/src/worker';
import { createRelay, type RelayEnv } from '../apps/relay/src/worker';
import { quotaNamespace } from '../apps/relay/src/__tests__/quota-fixture';
import { verifyRelayToken } from '../apps/relay/src/access';
import { openSimulationTool, productText, setSmokeLanguage, smokeLanguage } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const dist = resolve(process.env.SIMAGENTS_ADMISSION_TEST_DIST ?? '.tmp/admission-web');
const compiledBuild = JSON.parse(await Bun.file(resolve(dist, 'build-source.json')).text());
const appOrigin = process.env.SIMAGENTS_ADMISSION_TEST_APP_ORIGIN ?? 'https://app.fixture.test';
const relayOrigin = new URL(compiledBuild.publicConfiguration.VITE_OFFICIAL_RELAY_URL).origin;
const admissionOrigin = new URL(compiledBuild.publicConfiguration.VITE_ADMISSION_URL).origin;
const secret = 'synthetic-admission-signing-secret-not-for-deployment';
const initialTime = Math.floor(Date.now() / 1000) * 1000;
let now = initialTime / 1000;
const quotas = quotaNamespace(() => now * 1000).namespace;
const admissionEnv: AdmissionEnv = { AUTH_SECRET: secret, TURNSTILE_SECRET: 'synthetic-turnstile-secret', TURNSTILE_HOSTNAMES: new URL(appOrigin).hostname, ALLOWED_ORIGINS: appOrigin, SUBJECT_QUOTAS: quotas, ADMISSION_LIMITER: { limit: async () => ({ success: true }) } };
const relayEnv: RelayEnv = { AUTH_SECRET: secret, ALLOWED_ORIGINS: appOrigin, SUBJECT_QUOTAS: quotas, REQUEST_LIMITER: { limit: async () => ({ success: true }) }, EDGE_LIMITER: { limit: async () => ({ success: true }) } };
const consumed = new Set<string>(), tokens: string[] = [], subjects: string[] = [], forwardedTokens: string[] = [];
let admissions = 0, inference = 0, failNextAdmission = false;
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const admission = createAdmission((async (_url, init) => {
  const body = JSON.parse(String(init?.body)); assert(body.secret === admissionEnv.TURNSTILE_SECRET, 'Wrong Siteverify secret');
  const fresh = !consumed.has(body.response); consumed.add(body.response);
  return Response.json({ success: fresh, hostname: new URL(appOrigin).hostname, action: 'simagents-session', challenge_ts: new Date(now * 1000).toISOString() });
}) as typeof fetch, () => now);
const relay = createRelay((async (url, init) => {
  assert(url === 'https://api.openai.com/v1/responses', 'Unexpected provider destination');
  assert(new Headers(init?.headers).get('authorization') === 'Bearer synthetic-provider-key', 'Relay forwarded authorization as provider key');
  inference++;
  return Response.json({ model: 'fixture-model', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"action":"speak","params":{"message":"fixture"}}' }] }] });
}) as typeof fetch, 60000, () => now);
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const browser = await playwright[browserName].launch({ headless: true });
const width = Number(process.env.SIMAGENTS_SMOKE_WIDTH ?? 390);
const context = await browser.newContext({ acceptDownloads: true, viewport: { width, height: width === 390 ? 844 : 900 } });
const evidenceRoot = process.env.SIMAGENTS_EVIDENCE_ROOT ?? '.tmp';
await mkdir(`${evidenceRoot}/admission-browser`, { recursive: true });
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
let failed = false;
await context.route('**/*', async (route: any) => {
  const req = route.request(), url = new URL(req.url());
  if (url.origin === appOrigin) {
    const path = resolve(dist, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (!path.startsWith(dist + sep)) return route.abort();
    const file = Bun.file(path); if (!await file.exists()) return route.fulfill({ status: 404 });
    return route.fulfill({ body: Buffer.from(await file.arrayBuffer()), contentType: file.type });
  }
  if (url.href === 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit') return route.fulfill({ contentType: 'application/javascript', body: `
    let sequence = 0;
    window.turnstile = {
      render(container, options) {
        const id = 'synthetic-' + (++sequence);
        if (options.retry !== 'never' || options['refresh-expired'] !== 'never' || options['response-field'] !== false || options.action !== 'simagents-session') throw new Error('Wrong widget configuration');
        if (window.__syntheticInteractive) {
          options['before-interactive-callback']();
          const button = document.createElement('button'); button.textContent = 'Solve synthetic security check';
          button.onclick = () => options.callback('proof-' + id); container.append(button);
        } else setTimeout(() => options.callback('proof-' + id), 0);
        return id;
      },
      remove() { document.querySelector('.relay-access-dialog > div:not(.flex)')?.replaceChildren(); }
    };
  ` });
  if ([admissionOrigin, relayOrigin].includes(url.origin)) {
    const input = new Request(req.url(), { method: req.method(), headers: await req.allHeaders(), body: req.postDataBuffer() ?? undefined });
    let response: Response;
    if (url.origin === admissionOrigin) {
      if (req.method() === 'POST') admissions++;
      if (failNextAdmission && req.method() === 'POST') { failNextAdmission = false; response = Response.json({ error: { code: 'verification-unavailable' } }, { status: 503, headers: { 'Access-Control-Allow-Origin': appOrigin } }); }
      else response = await admission(input, admissionEnv);
      if (req.method() === 'POST' && response.ok) {
        const body = await response.clone().json() as { token: string }; tokens.push(body.token);
        subjects.push((await verifyRelayToken(body.token, secret, appOrigin, now)).sub);
      }
    } else {
      if (req.method() === 'POST') forwardedTokens.push(req.headers().authorization?.slice(7));
      response = await relay(input, relayEnv);
    }
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  }
  return route.abort();
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error: Error) => errors.push(error.message));
await setSmokeLanguage(page);
await page.clock.install({ time: new Date(initialTime) });
page.setDefaultTimeout(15000);
async function exportSnapshot() {
  const downloaded = page.waitForEvent('download'); await openSimulationTool(page, 'Export current world');
  return JSON.parse(await Bun.file(await (await downloaded).path()).text());
}
try {
  await page.goto(appOrigin);
  assert(await page.evaluate(() => window.__simagentsEngineClient === undefined), 'Development bridge in public build');
  await openSimulationTool(page, 'Configuration');
  await page.getByRole('button', { name: productText('Connections'), exact: true }).click();
  await page.getByRole('button', { name: productText('Add connection'), exact: true }).click();
  await page.getByLabel(productText('Connection name'), { exact: true }).fill('Autonomous fixture');
  await page.getByLabel(productText('Connection transport'), { exact: true }).selectOption('official-relay');
  assert(await page.getByLabel(productText('Relay access token'), { exact: true }).count() === 0, 'Autonomous build asks for an invitation token');
  await page.getByRole('button', { name: productText('Get relay access'), exact: true }).click();
  await page.getByText(productText('Relay access is ready in this tab.'), { exact: true }).waitFor();
  assert(admissions === 1 && inference === 0, 'Admission inferred or retried');
  await page.getByLabel(productText('Connection API key'), { exact: true }).fill('synthetic-provider-key');
  await page.getByRole('button', { name: productText('Save connection'), exact: true }).click();
  await page.getByLabel(productText('Connection for Agent 1'), { exact: true }).selectOption({ label: 'Autonomous fixture' });
  await page.getByLabel(productText('Model for Agent 1'), { exact: true }).selectOption('__custom__');
  await page.getByLabel(productText('Custom model ID for Agent 1'), { exact: true }).fill('fixture-model');
  await page.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }).click();
  await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: productText('Start'), exact: true }).first().click();
  await page.getByLabel(productText('Duration (seconds)'), { exact: true }).fill('3600');
  await page.getByRole('button', { name: productText('Start'), exact: true }).last().click();
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().waitFor();
  // Pause the world before the simulated authorization clock; this is never a soak test.
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().click();
  await page.getByRole('button', { name: productText('Resume'), exact: true }).first().waitFor();
  const before = await exportSnapshot();
  const callsBeforeRenewal = inference;
  now += 780; await page.clock.fastForward(780000);
  await page.waitForFunction(() => document.querySelector('.relay-access-backdrop') === null);
  await page.locator('[data-relay-status=ready]:visible').waitFor();
  assert(admissions === 2 && subjects[0] === subjects[1], 'Background renewal changed subject or did not happen');
  assert(inference === callsBeforeRenewal, 'Renewal issued inference');
  const after = await exportSnapshot();
  assert(JSON.stringify(before.snapshot) === JSON.stringify(after.snapshot), 'Renewal changed the paused world');
  await openSimulationTool(page, 'Configuration');
  await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  // Require an interaction during the next automatic renewal of a running world.
  await page.getByRole('button', { name: productText('Resume'), exact: true }).first().click();
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().waitFor();
  await page.evaluate(() => { (window as any).__syntheticInteractive = true; });
  now += 780; await page.clock.fastForward(780000);
  await page.getByRole('dialog', { name: productText('Public relay access') }).waitFor();
  assert(await page.locator('#root').evaluate((el: HTMLElement) => el.inert), 'Challenge did not contain background focus');
  const interactionAccessibility = await new AxeBuilder({ page }).include('.relay-access-dialog').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  await writeFile(`${evidenceRoot}/admission-browser/${browserName}-${width}-${smokeLanguage}-interaction-axe.json`, JSON.stringify(interactionAccessibility, null, 2));
  assert(interactionAccessibility.violations.length === 0, 'Interactive admission dialog has A/AA violations');
  await page.keyboard.press('Tab');
  assert(await page.getByRole('dialog', { name: productText('Public relay access') }).evaluate((el: HTMLElement) => el.contains(document.activeElement)), 'Challenge lost keyboard focus');
  const callsAtInteraction = inference;
  await page.getByRole('button', { name: 'Solve synthetic security check', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.relay-access-backdrop') === null);
  assert(admissions === 3 && subjects.every(subject => subject === subjects[0]), 'Interactive renewal lost subject');
  await page.getByRole('button', { name: productText('Resume'), exact: true }).first().waitFor();
  assert(inference === callsAtInteraction, 'Interactive renewal automatically resumed inference');
  await page.getByRole('button', { name: productText('Resume'), exact: true }).first().click();
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().waitFor();
  for (let n = 0; n < 30 && inference === callsAtInteraction; n++) await new Promise(resolve => setTimeout(resolve, 100));
  assert(inference > callsAtInteraction && forwardedTokens.at(-1) === tokens.at(-1), 'Explicit resume did not use renewed Worker authorization');
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().click();
  const saved = await exportSnapshot();
  const raw = JSON.stringify(saved), stored = await page.evaluate(() => JSON.stringify(localStorage));
  for (const secretValue of [...tokens, 'synthetic-provider-key', secret, admissionEnv.TURNSTILE_SECRET]) assert(!raw.includes(secretValue) && !stored.includes(secretValue), 'Authorization leaked to export/storage');
  // The failed renewal is one attempt; no delayed automatic retry or inference fallback.
  await page.evaluate(() => { (window as any).__syntheticInteractive = false; });
  failNextAdmission = true; const beforeFailure = inference;
  now += 780; await page.clock.fastForward(780000);
  await page.getByRole('dialog', { name: productText('Public relay access') }).getByText(productText('Relay access could not be verified. No inference was retried.'), { exact: true }).waitFor();
  assert(admissions === 4 && inference === beforeFailure, 'Failed renewal retried inference');
  const errorAccessibility = await new AxeBuilder({ page }).include('.relay-access-dialog').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  await writeFile(`${evidenceRoot}/admission-browser/${browserName}-${width}-${smokeLanguage}-error-axe.json`, JSON.stringify(errorAccessibility, null, 2));
  assert(errorAccessibility.violations.length === 0, 'Admission error dialog has A/AA violations');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admission dialog overflows the page');
  await page.screenshot({ path: `${evidenceRoot}/admission-browser/${browserName}-${width}-${smokeLanguage}.png` });
  await page.getByRole('dialog', { name: productText('Public relay access') }).getByRole('button', { name: productText('Close'), exact: true }).click();
  assert(await page.getByRole('button', { name: productText('Resume'), exact: true }).first().isDisabled(), 'Dismissal bypasses the relay authorization gate');
  assert(await page.evaluate(() => document.activeElement !== document.body && !(document.activeElement as HTMLElement).closest('[inert]')), 'Dialog did not restore reachable keyboard focus');
  await openSimulationTool(page, 'Get relay access');
  await page.waitForFunction(() => document.querySelector('.relay-access-backdrop') === null);
  await page.locator('[data-relay-status=ready]:visible').waitFor();
  assert(admissions === 5 && inference === beforeFailure, `Expected five admission attempts and no inference recovery; admissions=${admissions}, inference=${inference}, before=${beforeFailure}`);
  assert(!(await page.getByRole('button', { name: productText('Resume'), exact: true }).first().isDisabled()), 'Ready authorization did not permit explicit resume');
  assert(errors.length === 0, `Unhandled browser error: ${errors.join(', ')}`);
  await writeFile(`${evidenceRoot}/admission-browser/${browserName}-${width}-${smokeLanguage}-summary.json`, JSON.stringify({status:'passed-synthetic-only',browser:browserName,width,language:smokeLanguage,admissions,inference,configuredBuild:compiledBuild,candidateId:await Bun.file(resolve(dist,'candidate.json')).exists()?JSON.parse(await Bun.file(resolve(dist,'candidate.json')).text()).id:null,scope:'Synthetic Turnstile/provider/authorization timers; no deployed runtime or live provider certification'},null,2));
  console.log(`PASS ${browserName} ${width}px ${smokeLanguage}: autonomous access, silent/interactive renewal, Worker token update, unchanged world/model verification, no retry/storage leak. Authorization timers were simulated.`);
} catch (error) { failed = true; await page.screenshot({ path: `${evidenceRoot}/admission-browser/${browserName}-${width}-${smokeLanguage}-failure.png` }); console.error((await page.locator('body').innerText()).slice(-2500)); throw error; }
finally { await context.tracing.stop(failed ? { path: `${evidenceRoot}/admission-browser/${browserName}-${width}-${smokeLanguage}-failure-trace.zip` } : {}); await context.close(); await browser.close(); }
