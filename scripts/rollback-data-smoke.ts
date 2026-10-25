// Same-origin artifact cutover with real browser IndexedDB/crypto and synthetic inference.
// This proves local data-reader compatibility, not a Cloudflare deployment rollback.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { populatedWorld } from './fixtures/populated-world';
import { openSetup, openSimulationTool, productText, saveProviderKey, setSmokeLanguage, setupDialog, setupStep, smokeLanguage, startFromSetup } from './browser-helpers.mjs';

const current = resolve(process.env.SIMAGENTS_ROLLBACK_CURRENT ?? '');
const rollback = resolve(process.env.SIMAGENTS_ROLLBACK_PREVIOUS ?? '');
if (!process.env.SIMAGENTS_ROLLBACK_CURRENT || !process.env.SIMAGENTS_ROLLBACK_PREVIOUS || current === rollback) throw new Error('Two explicitly retained candidate directories are required.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function verify(directory: string) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'spa/candidate.json'), 'utf8'));
  assert(manifest.schemaVersion === 1 && !manifest.identity.dirty && hash(JSON.stringify(manifest.identity)) === manifest.id, 'Candidate identity is not a clean retained artifact.');
  assert(hash(JSON.stringify(manifest.assets)) === manifest.identity.bundle, 'Invalid bundle inventory.');
  for (const [file, expected] of Object.entries(manifest.assets)) {
    const target = resolve(directory, 'spa', file);
    assert(target.startsWith(resolve(directory, 'spa') + sep), 'Invalid asset path.');
    assert(hash(await readFile(target)) === expected, `Retained asset changed: ${file}`);
  }
  for (const kind of ['relay', 'admission']) assert(hash(await readFile(resolve(directory, kind, 'worker.js'))) === manifest.identity[kind], `${kind} bundle changed.`);
  return manifest;
}
const manifests = { current: await verify(current), rollback: await verify(rollback) };
for (const field of ['storageSchema', 'snapshotSchema', 'snapshotDomainSchema', 'catalog', 'connections']) assert(manifests.current.identity[field] === manifests.rollback.identity[field], `Rollback ${field} differs; this harness requires the same reader/domain contract.`);
assert(manifests.current.id !== manifests.rollback.id, 'Rollback candidate identity must differ.');
let active = current;
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const root = resolve(active, 'spa'), pathname = new URL(request.url).pathname;
  const target = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!target.startsWith(root + sep)) return new Response('Denied', { status: 403 });
  const file = Bun.file(target);
  return await file.exists() ? new Response(file, { headers: { 'Cache-Control': 'no-store' } }) : new Response('Missing', { status: 404 });
} });
const base = `http://127.0.0.1:${server.port}/`;
const require = createRequire(import.meta.url);
const pw = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const browser = await pw[browserName].launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const directory = `${process.env.SIMAGENTS_EVIDENCE_ROOT ?? '.tmp/rollback-data'}/${browserName}-${smokeLanguage}`;
await mkdir(directory, { recursive: true });
let calls = 0, cutoverStarted = 0;
const errors: string[] = [];
await context.route('**/*', (route: any) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
await context.route('https://api.anthropic.com/v1/messages', (route: any) => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  calls++;
  return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ model: 'rollback-fixture', usage: { input_tokens: 12, output_tokens: 9 }, content: [{ type: 'text', text: '{"action":"speak","params":{"message":"rollback fixture"},"reasoning":"Retained original synthetic response"}' }] }) });
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', (error: Error) => errors.push(error.message));
await setSmokeLanguage(page);
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
const button = (name: string) => page.getByRole('button', { name: productText(name), exact: true });
async function configure() {
  if (!(await setupDialog(page).isVisible())) await openSetup(page);
  await setupStep(page, 'Provider keys');
  const vault = setupDialog(page).locator('details').filter({ hasText: productText('Save keys on this device (encrypted)') });
  if (!(await vault.evaluate((el: HTMLDetailsElement) => el.open))) await vault.locator('summary').click();
}
async function probe() {
  await setupStep(page, 'Participants');
  await button('Verify model for Agent 1 (1 request)').click();
  await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
}
async function exportWorld() {
  const download = page.waitForEvent('download');
  await openSimulationTool(page, 'Export current world');
  return JSON.parse(await Bun.file(await (await download).path()).text());
}
async function diskState() {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('simagents-app-data');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const names = [...db.objectStoreNames];
      const tx = db.transaction(names, 'readonly');
      const result: Record<string, Array<{ key: unknown; value: any }>> = {};
      await Promise.all(names.map(name => new Promise<void>((resolve, reject) => {
        const rows: Array<{ key: unknown; value: unknown }> = [];
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => { if (request.result) { rows.push({ key: request.result.key, value: request.result.value }); request.result.continue(); } else { result[name] = rows; resolve(); } };
        request.onerror = () => reject(request.error);
      })));
      const total = [...result.records, ...result.items].reduce((sum, row) => sum + new TextEncoder().encode(row.value.json).byteLength, 0);
      const accounted = result.accounting.find(row => row.key === 'bytes')?.value;
      if (total !== accounted) throw new Error('IndexedDB accounting disagrees with record bytes.');
      return { version: db.version, stores: Object.fromEntries(names.sort().map(name => [name, result[name]])), local: { vault: localStorage.getItem('simagents_credential_vault_v1'), locale: localStorage.getItem('simagents_locale_v1') } };
    } finally { db.close(); }
  });
}
async function resumeOneDecision() {
  await startFromSetup(page, { requests: 1, capture: true, choice: 'resume' });
  await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
}
let failed = true;
try {
  await page.goto(base);
  await configure();
  await saveProviderKey(page, 'Claude (Anthropic)', 'rollback-only-synthetic-key');
  await page.getByLabel(productText('Vault passphrase'), { exact: true }).fill('rollback-only-test-passphrase');
  await button('Save session keys encrypted').click();
  await page.waitForFunction(() => !!localStorage.getItem('simagents_credential_vault_v1'));
  await probe();
  await startFromSetup(page, { requests: 1, capture: true });
  await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
  assert(calls === 2, 'Initial probe/decision count changed.');
  const initial = await exportWorld();
  const snapshot = await populatedWorld(initial.snapshot);
  await openSimulationTool(page, 'Import saved world');
  await page.locator('input[type=file]').setInputFiles({ name: 'rollback-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ snapshot, events: initial.events })) });
  const imported = page.getByRole('status').filter({ hasText: productText('World imported. Use Start to resume the saved world.') });
  await imported.waitFor(); await imported.getByRole('button', { name: productText('Close'), exact: true }).click();
  const before = await diskState();
  assert(before.version === 2 && before.stores.items.length > 0 && before.local.vault, 'Fixture did not populate v2 archives and vault.');
  const saved = JSON.parse(before.stores.records.find((row: any) => row.key === 'world:current')!.value.json);
  assert(saved.snapshot.metrics && saved.snapshot.store.puzzleGames.length === 2, 'World lacks cumulative metrics/puzzles.');
  cutoverStarted = performance.now(); active = rollback;
  await page.reload();
  assert((await (await context.request.get(new URL('candidate.json', base).href)).json()).id === manifests.rollback.id, 'Rollback was not served.');
  await configure(); await page.getByText(productText('Encrypted vault locked.'), { exact: true }).waitFor();
  assert(calls === 2, 'Rollback reload automatically inferred.');
  const restored = await diskState();
  assert(JSON.stringify(restored) === JSON.stringify(before), 'Rollback load changed world/RNG/metrics, archive records, accounting, vault or locale.');
  await page.getByLabel(productText('Vault passphrase'), { exact: true }).fill('rollback-only-test-passphrase');
  await button('Unlock vault').click();
  await page.getByText(productText('Encrypted vault unlocked for this tab.'), { exact: true }).waitFor();
  await probe(); await resumeOneDecision();
  assert(calls === 4, 'Rollback needed extra calls or hidden retry.');
  const resumed = await exportWorld();
  assert(resumed.snapshot.worldSeed === saved.snapshot.worldSeed && resumed.snapshot.store.agents.map((a: any) => a.id).join() === saved.snapshot.store.agents.map((a: any) => a.id).join(), 'Rollback replaced the saved world/agents.');
  await openSimulationTool(page, 'Replay');
  await page.getByRole('note').filter({ hasText: productText('Saved replay:') }).waitFor();
  await page.getByLabel(productText('Inspect replay agent'), { exact: true }).selectOption(saved.snapshot.store.agents[0].id);
  await button('Exit Replay').click();
  await openSimulationTool(page, 'Prompts');
  await page.getByLabel(productText('Select Agent'), { exact: true }).selectOption(saved.snapshot.store.agents[0].id);
  await page.getByRole('button').filter({ hasText: productText('Captured request') }).first().click();
  await button('Raw Response').click();
  await page.getByText('Retained original synthetic response', { exact: false }).first().waitFor();
  await button('Back to City').click();
  const afterRead = await diskState();
  assert(afterRead.stores.items.length >= before.stores.items.length, 'Rollback silently removed archived rows.');
  const retainedRows = new Map(afterRead.stores.items.map((row: any) => [JSON.stringify(row.key), JSON.stringify(row.value)]));
  let currentTickFrameUpdates = 0;
  for (const row of before.stores.items) {
    if (retainedRows.get(JSON.stringify(row.key)) === JSON.stringify(row.value)) continue;
    // Replay deliberately stores the latest snapshot per world/tick. Explicit
    // resume updates that current-tick frame; reload alone was byte-exact above.
    // Every other archived row, including request bodies, must remain immutable.
    const next = afterRead.stores.items.find((other: any) => JSON.stringify(other.key) === JSON.stringify(row.key))?.value;
    assert(row.value.collection === 'simagents_replay_frames_v1' && row.value.world === saved.snapshot.worldSeed && row.value.tick === saved.snapshot.store.worldState.currentTick && next, 'Rollback lost or changed an unrelated archived row.');
    const oldFrame = JSON.parse(row.value.json), nextFrame = JSON.parse(next.json);
    const retainedEvents = new Set(nextFrame.snapshot.events.map((event: any) => JSON.stringify(event)));
    assert(nextFrame.capturedAt >= oldFrame.capturedAt && nextFrame.tick === oldFrame.tick && oldFrame.snapshot.events.every((event: any) => retainedEvents.has(JSON.stringify(event))), 'Explicit resume discarded existing current-tick events.');
    currentTickFrameUpdates++;
  }
  assert(afterRead.local.vault === before.local.vault, 'Rollback changed encrypted vault bytes.');
  assert(calls === 4 && !errors.length, 'Reader triggered inference or unhandled errors.');
  active = current; await page.reload();
  await configure(); await page.getByText(productText('Encrypted vault locked.'), { exact: true }).waitFor();
  assert(JSON.stringify(await diskState()) === JSON.stringify(afterRead), 'Returning to current candidate changed saved data.');
  const elapsedMs = performance.now() - cutoverStarted;
  assert(elapsedMs < 15 * 60 * 1000, 'Local drill exceeded 15 minutes.');
  const sameCompiledBundles = manifests.current.identity.bundle === manifests.rollback.identity.bundle && manifests.current.identity.relay === manifests.rollback.identity.relay && manifests.current.identity.admission === manifests.rollback.identity.admission;
  await writeFile(`${directory}/report.json`, JSON.stringify({ status: 'passed-local-data-compatibility-only', browser: browserName, language: smokeLanguage, elapsedMs, providerCallsSynthetic: calls, manifests, sameCompiledBundles, beforeHash: hash(JSON.stringify(before)), afterReadHash: hash(JSON.stringify(afterRead)), archiveRowsBefore: before.stores.items.length, archiveRowsAfter: afterRead.stores.items.length, zeroAutomaticInference: true, reloadDataBytePreservation: true, originalTraceRowsBytePreserved: true, currentTickFrameUpdatesAfterExplicitResume: currentTickFrameUpdates, currentTickOriginalEventsPreserved: true, encryptedVaultBytePreservation: true, accountingVerified: true, errors, limitations: ['No Cloudflare deployment/configuration cutover was performed.', 'Only the retained candidates with identical data contracts were tested.', ...(sameCompiledBundles ? ['These commits contain identical compiled application bundles; this does not exercise a different application implementation.'] : [])] }, null, 2));
  await page.screenshot({ path: `${directory}/restored.png` }); failed = false;
  console.log(`PASS local ${browserName}/${smokeLanguage} rollback in ${Math.round(elapsedMs)} ms; archived rows, RNG/metrics/world and encrypted vault preserved; four synthetic calls only.`);
} finally {
  if (failed) await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  await context.tracing.stop(failed ? { path: `${directory}/failure-trace.zip` } : {});
  await context.close(); await browser.close(); server.stop(true);
}
