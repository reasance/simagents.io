// Failed public resume keeps the reviewed dialog/data and translates a safe error code.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildSoakWorld } from './fixtures/soak-world';
import { openSimulationTool, productText, setSmokeLanguage, smokeLanguage } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const pw = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const browser = await pw[browserName].launch({ headless: true });
const context = await browser.newContext();
const directory = `${process.env.SIMAGENTS_EVIDENCE_ROOT ?? '.tmp'}/start-errors`;
await mkdir(directory, { recursive: true });
const name = `${browserName}-${smokeLanguage}`;
const errors: string[] = []; let calls = 0, dialogs = 0, failed = true;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
await context.addInitScript(() => {
  const original = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function(key) {
    if ((window as any).__denyWorldRead && this.name === 'records' && key === 'world:current') throw new Error('Saved world could not be read: sensitive-sentinel');
    return original.call(this, key);
  };
});
await context.route('**/*', (route: any) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
await context.route('https://api.anthropic.com/v1/messages', (route: any) => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  calls++;
  return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ model: 'start-error-fixture', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{"action":"speak","params":{"message":"fixture"}}' }] }) });
});
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', (error: Error) => errors.push(error.message));
page.on('dialog', async (dialog: any) => { dialogs++; await dialog.dismiss(); });
await setSmokeLanguage(page); await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
async function savedWorld() {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('simagents-app-data'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => { const tx = db.transaction(['records', 'accounting']); const world = tx.objectStore('records').get('world:current'), total = tx.objectStore('accounting').get('bytes'); tx.oncomplete = () => resolve({ world: world.result, total: total.result }); tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  });
}
try {
  await page.goto(base);
  await openSimulationTool(page, 'Configuration');
  await page.getByLabel(productText('Claude (Anthropic) API key'), { exact: true }).fill('synthetic-start-error-key');
  await page.getByRole('button', { name: productText('Use Keys for This Session'), exact: true }).click();
  await page.getByText(productText('User Key'), { exact: true }).waitFor();
  await page.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }).click();
  await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const fixture = await buildSoakWorld();
  await openSimulationTool(page, 'Import saved world');
  await page.locator('input[type=file]').setInputFiles({ name: 'start-error-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.file)) });
  const notice = page.getByRole('status').filter({ hasText: productText('World imported. Use Start to resume the saved world.') });
  await notice.waitFor(); await notice.getByRole('button', { name: productText('Close'), exact: true }).click();
  const before = await savedWorld();
  await page.getByRole('button', { name: productText('Start'), exact: true }).first().click();
  const resume = page.getByRole('dialog').getByRole('button', { name: productText('Resume'), exact: true });
  await resume.waitFor();
  await page.evaluate(() => { (window as any).__denyWorldRead = true; });
  await resume.click();
  await page.getByRole('dialog').getByRole('alert').filter({ hasText: productText('Saved world could not be read. Existing data has been preserved.') }).waitFor();
  assert(await resume.isEnabled(), 'Failed startup left the reviewed controls disabled.');
  assert(!(await page.locator('body').innerText()).includes('sensitive-sentinel'), 'Startup exposed the raw failure payload.');
  await page.evaluate(() => { (window as any).__denyWorldRead = false; });
  assert(JSON.stringify(await savedWorld()) === JSON.stringify(before), 'Failed startup overwrote the saved world/accounting.');
  assert(calls === 1 && dialogs === 0 && !errors.length, 'Failed startup inferred, opened a raw alert or caused an unhandled error.');
  await writeFile(`${directory}/${name}.json`, JSON.stringify({ status: 'passed', browser: browserName, language: smokeLanguage, providerCallsSynthetic: calls, failedStartupPreservesWorld: true, safeTranslatedModalError: true, browserAlertCount: dialogs, candidate: await (await context.request.get(new URL('candidate.json', base).href)).json() }, null, 2));
  await page.screenshot({ path: `${directory}/${name}.png` }); failed = false;
  console.log(`PASS ${name}: failed resume preserves world, shows localized modal error, no browser alert or inference.`);
} finally {
  if (failed) await page.screenshot({ path: `${directory}/${name}-failure.png` }).catch(() => {});
  await context.tracing.stop(failed ? { path: `${directory}/${name}-failure-trace.zip` } : {});
  await context.close(); await browser.close();
}
