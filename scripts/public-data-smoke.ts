// Real public UI/Worker/storage paths with synthetic provider and explicitly imported QA puzzles.
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { populatedWorld } from './fixtures/populated-world';
import { openSimulationTool,productText,setSmokeLanguage,smokeLanguage } from './browser-helpers.mjs';
const require=createRequire(import.meta.url),pw=process.env.PLAYWRIGHT_MODULE_DIR?createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright'):require('playwright');
const browserName=process.env.SIMAGENTS_SMOKE_BROWSER??'chromium',width=Number(process.env.SIMAGENTS_SMOKE_WIDTH??390),base=process.env.SIMAGENTS_SMOKE_URL??'http://127.0.0.1:5185/';
const browser=await pw[browserName].launch({headless:true}),context=await browser.newContext({viewport:{width,height:width===390?844:900},acceptDownloads:true});
let calls=0;const errors:string[]=[];const assert=(value:unknown,message:string)=>{if(!value)throw new Error(message)};
const evidenceRoot=process.env.SIMAGENTS_EVIDENCE_ROOT??'.tmp';
await mkdir(`${evidenceRoot}/public-data`,{recursive:true});
await context.tracing.start({screenshots:true,snapshots:true,sources:false});
let failed=false;
let holdResumedRequest=false;
let releaseResumedRequest!:()=>void;
const resumedRequestGate=new Promise<void>(resolve=>{releaseResumedRequest=resolve});
await context.route('**/*',(r:any)=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
await context.route('https://api.anthropic.com/v1/messages',async(r:any)=>{
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST, OPTIONS'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});calls++;
 if(holdResumedRequest){await resumedRequestGate;return r.abort('aborted');}
 return r.fulfill({headers,contentType:'application/json',body:JSON.stringify({model:'synthetic-reported-model',usage:{input_tokens:12,output_tokens:9},content:[{type:'text',text:'{"action":"speak","params":{"message":"public data fixture"},"reasoning":"Original unmodified model text"}'}]})});
});
const page=await context.newPage();await setSmokeLanguage(page);page.setDefaultTimeout(15000);page.on('pageerror',(e:Error)=>errors.push(e.message));
async function exported(){const wait=page.waitForEvent('download');await openSimulationTool(page,'Export current world');return JSON.parse(await Bun.file(await(await wait).path()).text());}
async function itemCounts(){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('simagents-app-data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{return await new Promise<number>((resolve,reject)=>{const r=db.transaction('items').objectStore('items').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});}finally{db.close()}})}
async function audit(surface:string){const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();await writeFile(`${evidenceRoot}/public-data/${browserName}-${width}-${smokeLanguage}-${surface}.json`,JSON.stringify(report,null,2));assert(!report.violations.length,`${surface}: ${report.violations.map(i=>i.id).join(',')}`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${surface}: page overflow`);}
try{
 await page.goto(base);await openSimulationTool(page,'Configuration');await page.getByLabel(productText('Claude (Anthropic) API key'),{exact:true}).fill('synthetic-public-data-key');await page.getByRole('button',{name:productText('Use Keys for This Session'),exact:true}).click();await page.getByText(productText('User Key'),{exact:true}).waitFor();
 await page.getByRole('button',{name:productText('Verify model for Agent 1 (1 request)'),exact:true}).click();await page.getByText(productText('Verified in this tab'),{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:productText('Start'),exact:true}).first().click();await page.getByLabel(productText('Requests'),{exact:true}).fill('1');await page.getByRole('checkbox',{name:productText('Capture actual requests for this session'),exact:true}).check();await page.getByRole('dialog').getByRole('button',{name:productText('Start'),exact:true}).click();
 await page.getByRole('alert').filter({hasText:productText('The request budget is exhausted. Start a new session explicitly to make more requests.')}).waitFor();assert(calls===2,'Probe/decision were retried');
 const saved=await exported(), before=await itemCounts();assert(before>0,'No history was archived');
 await openSimulationTool(page,'Prompt Gallery');await page.getByRole('button',{name:productText('Live Inspector'),exact:true}).click();await page.getByLabel(productText('Select Agent'),{exact:true}).selectOption(saved.snapshot.store.agents[0].id);
 if(width<1024){await page.getByRole('button',{name:productText('Back to decision history'),exact:true}).waitFor();await page.getByRole('button',{name:productText('Back to decision history'),exact:true}).click();}
 await page.getByRole('button').filter({hasText:productText('Captured request')}).first().click();await page.getByRole('button',{name:productText('Request body'),exact:true}).waitFor();const bodyBounds=await page.getByLabel(productText('Prompt content'),{exact:true}).boundingBox();assert(bodyBounds && bodyBounds.height>=80,'Captured body has no usable reading area');await audit('captured-inspector');await page.getByRole('button',{name:productText('Raw Response'),exact:true}).click();await page.getByText('Original unmodified model text',{exact:false}).first().waitFor();await page.getByRole('button',{name:productText('Back to City'),exact:true}).click();
 const snapshot=await populatedWorld(saved.snapshot);const file=JSON.stringify({snapshot,events:saved.events});
 await openSimulationTool(page,'Import saved world');await page.locator('input[type=file]').setInputFiles({name:'qa-puzzles.json',mimeType:'application/json',buffer:Buffer.from(file)});await page.getByRole('status').filter({hasText:productText('World imported. Use Start to resume the saved world.')}).waitFor();
 assert(await itemCounts()>=before,'Valid import silently deleted replay/trace archives');assert(calls===2,'Import issued inference');
 await page.getByRole('status').filter({hasText:productText('World imported. Use Start to resume the saved world.')}).getByRole('button',{name:productText('Close'),exact:true}).click();
 await page.getByRole('button',{name:productText('Start'),exact:true}).first().click();
 // Keep the imported world's first synthetic inference pending until Pause.
 // An immediate one-request response can exhaust the session before WebKit
 // observes the transient running controls; that is valid product behavior.
 holdResumedRequest=true;
 const resumedRequestObserved=page.waitForRequest(request=>request.url()==='https://api.anthropic.com/v1/messages'&&request.method()==='POST');
 await page.getByRole('dialog').getByRole('button',{name:productText('Resume'),exact:true}).click();
 await resumedRequestObserved;
 await page.getByRole('button',{name:productText('Pause'),exact:true}).first().waitFor();await page.getByRole('button',{name:productText('Pause'),exact:true}).first().click();
 await page.getByRole('button',{name:productText('Resume'),exact:true}).first().waitFor();releaseResumedRequest();
 const callsAfterExplicitResume=calls;
 assert(callsAfterExplicitResume===3,'Expected one probe, one initial decision and one cancelled resumed request');
 await openSimulationTool(page,'Puzzle Games');await page.getByRole('button').filter({hasText:productText('Password')}).first().click();await page.getByRole('heading').filter({hasText:productText('Participants (')}).waitFor();assert(await page.getByText('Synthetic fragment 1',{exact:false}).count()===0,'Open puzzle revealed protected fragment content');await audit('puzzle-details');
 if(width<1024)await page.getByRole('button',{name:productText('Back to puzzle list'),exact:true}).click();
 await page.getByRole('button',{name:productText('History'),exact:true}).click();await page.getByRole('button').filter({hasText:productText('Password')}).filter({hasText:productText('Completed')}).first().click();await page.getByText('Synthetic fragment 1',{exact:false}).first().waitFor();await audit('puzzle-history');await page.getByRole('button',{name:productText('Back to City'),exact:true}).click();
 await openSimulationTool(page,'Replay');await page.getByRole('note').filter({hasText:productText('Saved replay:')}).waitFor();await page.getByLabel(productText('Inspect replay agent'),{exact:true}).selectOption(saved.snapshot.store.agents[0].id);await audit('replay-agent');await page.getByRole('button',{name:productText('Exit Replay'),exact:true}).click();
 assert(calls===callsAfterExplicitResume,'Public data readers made provider requests');assert(!errors.length,`Unhandled errors: ${errors.join(',')}`);
 await writeFile(`${evidenceRoot}/public-data/${browserName}-${width}-${smokeLanguage}-summary.json`,JSON.stringify({status:'passed',browser:browserName,width,language:smokeLanguage,providerCalls:calls,archiveRetention:true,openPuzzleContentsProtected:true,completedFragmentsVisible:true,candidate:await(await context.request.get(new URL('candidate.json',base).href)).json()},null,2));assert(calls===callsAfterExplicitResume,'Public data readers made provider requests');assert(!errors.length,`Unhandled errors: ${errors.join(',')}`);await page.screenshot({path:`${evidenceRoot}/public-data/${browserName}-${width}-${smokeLanguage}.png`});console.log(`PASS ${browserName} ${width}px ${smokeLanguage}: captured bodies, valid import history retention, populated puzzles/history, replay native agent selection; no paid traffic.`);
}catch(error){failed=true;await page.screenshot({path:`${evidenceRoot}/public-data/${browserName}-${width}-${smokeLanguage}-failure.png`});throw error;}finally{releaseResumedRequest();await context.tracing.stop(failed?{path:`${evidenceRoot}/public-data/${browserName}-${width}-${smokeLanguage}-failure-trace.zip`}:{});await context.close();await browser.close();}
