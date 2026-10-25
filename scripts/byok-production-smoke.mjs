#!/usr/bin/env node
import { openSetup, openSimulationTool, productText, saveProviderKey, setSmokeLanguage, setupDialog, setupStep } from './browser-helpers.mjs';
// Exercise the production bundle, without development bridges or real inference.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR
  ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const baseUrl = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const browser = await playwright[process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium'].launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
let calls = 0;
let tokenLimit;
let lastRequestBody;
let workerUrl;
await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
await context.route('https://api.anthropic.com/v1/messages', async (route) => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
  calls++;
  lastRequestBody = route.request().postData();
  tokenLimit = route.request().postDataJSON().max_tokens;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'text', text: '{"action":"speak","params":{"message":"fixture"}}' }] }) });
});
await context.addInitScript(() => {
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', ({ data }) => console.debug('[workertrace]', 'received', data.type, data.requestId ?? ''));
    }
    postMessage(data, ...rest) {
      console.debug('[workertrace]', 'sent', data.cmd, data.requestId, data.sessionId);
      return super.postMessage(data, ...rest);
    }
  };
});
const page = await context.newPage();
await setSmokeLanguage(page);
const workerTrace = [];
page.on('console', (message) => { if (message.text().startsWith('[workertrace]')) workerTrace.push(message.text()); });
page.setDefaultTimeout(10000);
page.on('request', (request) => { if (/\/assets\/worker-[^/]+\.js$/.test(request.url())) workerUrl = request.url(); });
function assert(condition, message) { if (!condition) throw new Error(message); }
try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert(await page.evaluate(() => window.__simagentsEngineClient === undefined), 'Development bridge present in production');
  const headerStart = () => page.locator('.app-header:visible').getByRole('button', { name: productText('Start'), exact: true });
  const dialog = setupDialog(page);
  await headerStart().click();
  assert(await dialog.getByRole('button', { name: productText('Continue'), exact: true }).isDisabled(), 'Setup without a key could continue');
  assert(await dialog.getByRole('navigation', { name: productText('Setup progress') }).getByRole('button', { name: new RegExp(productText('Limits and start')) }).isDisabled(), 'Start step reachable without a key');
  await saveProviderKey(page, 'Claude (Anthropic)', 'synthetic-production-smoke-key');
  await setupStep(page, 'Participants');
  assert(await dialog.locator('option[value^="baseline:"]').count() === 0, 'Public setup exposed baseline providers');
  await dialog.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }).click();
  await dialog.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  assert(calls === 1, 'Probe must make exactly one request');
  await setupStep(page, 'Limits and start');
  const startWorld = () => dialog.getByRole('button', { name: productText('Start world'), exact: true });
  assert(!(await dialog.getByRole('checkbox', { name: productText('Capture actual requests for this session') }).isChecked()), 'Capture enabled by default');
  await dialog.getByLabel(productText('Requests'), { exact: true }).fill('');
  assert(await startWorld().isDisabled(), 'Invalid limits did not block start');
  await dialog.getByLabel(productText('Requests'), { exact: true }).pressSequentially('1');
  await dialog.getByLabel(productText('Tokens per response'), { exact: true }).fill('128');
  assert(await startWorld().isDisabled(), 'Changed output limit bypassed mandatory verification');
  await dialog.getByRole('button', { name: productText('Return to model verification'), exact: true }).click();
  await dialog.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }).click();
  await dialog.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  assert(calls === 2 && tokenLimit === 128, 'Re-verification must make exactly one request at the new limit');
  await setupStep(page, 'Limits and start');
  await dialog.getByRole('checkbox', { name: productText('Capture actual requests for this session') }).check();
  await startWorld().click();
  await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
  assert(calls === 3, `Expected two probes plus one simulation request; saw ${calls}`);
  assert(tokenLimit === 128, `Output limit changed to ${tokenLimit}`);
  assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('synthetic-production-smoke-key'), 'Key persisted in plaintext');
  await openSimulationTool(page, 'Social Graph');
  await page.getByRole('dialog', { name: productText('Social Graph'), exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await openSetup(page);
  await setupStep(page, 'Provider keys');
  await dialog.locator('summary', { hasText: productText('Save keys on this device (encrypted)') }).click();
  await dialog.getByRole('button', { name: productText('Lock and clear session keys'), exact: true }).click();
  const keyStatus = dialog.getByText(productText('Key in this tab ({masked})', { masked: '••••-key' }), { exact: true });
  await keyStatus.waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await page.getByText(productText('Ready'), { exact: true }).first().waitFor();
  assert(calls === 3, 'Locking or errors triggered a retry');
  const captured = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('simagents-app-data'); r.onsuccess = () => resolve(r.result); });
    try {
      return await new Promise(resolve => { const r = db.transaction('items').objectStore('items').index('collection').getAll('simagents_prompt_logs_v1'); r.onsuccess = () => resolve(r.result.map(row => JSON.parse(row.json)).filter(log => log.source === 'captured')); });
    } finally { db.close(); }
  });
  assert(captured.length === 1, 'Expected only one captured simulation request, excluding probes');
  assert(captured[0].fullPrompt === lastRequestBody, 'Captured request differs from transmitted body');
  assert(captured[0].requestTrace.outcome === 'success', 'Wrong request outcome');
  assert(!JSON.stringify(captured).includes('synthetic-production-smoke-key'), 'Credential leaked into captured trace');

  // Round-trip the durable world through the legacy migration, without inference.
  const saved = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('simagents-app-data');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const row = await new Promise((resolve, reject) => {
        const request = db.transaction('records').objectStore('records').get('world:current');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (!row) throw new Error('Paused world was not persisted');
      const world = JSON.parse(row.json);
      localStorage.setItem('simagents_world_snapshot', JSON.stringify(world.snapshot));
      localStorage.setItem('simagents_event_ring', JSON.stringify(world.events));
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').delete('world:current');
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      return world;
    } finally { db.close(); }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await headerStart().click();
  await page.waitForFunction(() => localStorage.getItem('simagents_world_snapshot') === null);
  const migrated = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('simagents-app-data'); r.onsuccess = () => resolve(r.result); });
    try { return await new Promise(resolve => { const r = db.transaction('records').objectStore('records').get('world:current'); r.onsuccess = () => resolve(JSON.parse(r.result.json)); }); }
    finally { db.close(); }
  });
  assert(JSON.stringify(saved) === JSON.stringify(migrated), 'Migration changed the saved world or events');
  assert(calls === 3, 'Migration or reload triggered inference');
  await page.keyboard.press('Escape');
  await openSimulationTool(page, 'Prompts');
  await page.getByLabel(productText('Select Agent'), { exact: true }).selectOption(captured[0].agentId);
  await page.getByRole('button').filter({ hasText: productText('Captured request') }).first().click();
  await page.getByRole('note').filter({ hasText: productText('Captured request') }).waitFor();
  await page.getByRole('button', { name: productText('Request body'), exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await headerStart().click();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await openSimulationTool(page, 'Replay');
  await page.getByRole('note').filter({ hasText: productText('Saved replay:') }).waitFor();
  assert((await page.locator('body').innerText()).includes(productText('Events at Tick')), 'Replay did not restore after reload');
  assert(calls === 3, 'Reading persisted replay triggered inference');

  await page.evaluate(async () => {
    localStorage.setItem('simagents_world_snapshot', '{broken');
    const db = await new Promise(resolve => { const r = indexedDB.open('simagents-app-data'); r.onsuccess = () => resolve(r.result); });
    try { await new Promise((resolve, reject) => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').delete('world:current'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await headerStart().click();
  await page.getByRole('alert').filter({ hasText: productText('Saved world could not be read. Existing data has been preserved.') }).waitFor();
  assert(await page.evaluate(() => localStorage.getItem('simagents_world_snapshot')) === '{broken', 'Corrupt legacy data was deleted');
  assert(calls === 3, 'Failed migration triggered inference');

  assert(workerUrl, 'Production worker was not observed');
  const rejection = await page.evaluate(async (url) => {
    const worker = new Worker(url, { type: 'module' });
    try {
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worker did not acknowledge invalid roster')), 3000);
        worker.onmessage = ({ data }) => { if (data.type === 'error') { clearTimeout(timeout); resolve(data.issue?.code ?? data.message); } };
        worker.postMessage({ cmd: 'init', requestId: 'fixture', sessionId: 'fixture', payload: { roster: [{ name: 'Baseline', provider: 'baseline_rule', modelId: 'baseline_rule', color: '#888888' }], keys: {}, speed: 1 } });
      });
    } finally { worker.terminate(); }
  }, workerUrl);
  assert(String(rejection) === 'BYOK_INTERNAL', 'Production worker accepted baseline bypass');
  console.log('PASS: production BYOK gate, internal-baseline rejection, exact token limit, one-request budget, visible pause, credential lock, IndexedDB migration, durable replay, opt-in request capture and corrupt-data preservation; no live inference.');
} catch (error) { console.error(workerTrace.slice(-40)); console.error((await page.locator('body').innerText()).slice(-10000)); throw error; } finally { await context.close(); await browser.close(); }
