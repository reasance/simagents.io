// Real wall time, public BYOK bundle, 20 controlled agents, simulated provider only.
import { createRequire } from 'node:module';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { buildSoakWorld } from './fixtures/soak-world';
import { validateWorldSnapshotV1 } from '../packages/engine/src/engine/persistence';
import { openSetup, openSimulationTool, productText, setupDialog, setupStep } from './browser-helpers.mjs';
import { elapsedContinuous, openSoakClock, type ClockReading } from './soak-clock';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const pilotArg = process.argv.find(value => value.startsWith('--pilot-seconds='));
const durationSeconds = pilotArg ? Number(pilotArg.split('=')[1]) : 3600;
if (!Number.isInteger(durationSeconds) || (pilotArg && (durationSeconds < 60 || durationSeconds > 600))) throw new Error('Pilot duration must be 60–600 real seconds; the full soak is fixed at 3600.');
const pilot = !!pilotArg;
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const runId = new Date().toISOString().replace(/[:.]/g, '-') + (pilot ? '-pilot' : '-60m');
const directory = `.tmp/soak/${runId}`; await mkdir(directory, { recursive: true });
const fixture = await buildSoakWorld();
const fixtureJson = JSON.stringify(fixture.file), fixtureHash = createHash('sha256').update(fixtureJson).digest('hex');
await writeFile(`${directory}/fixture.json`, fixtureJson);
const nativeClock = openSoakClock();
const protocol = { version: 2, pilot, durationSeconds, agents: 20, speed: 1, provider: 'synthetic HTTP transport', preconditioning: fixture.preconditioning,
  clock: { source: nativeClock.kind, maximumSuspendDriftMs: 1000, maximumSampleGapMs: 30000, maximumCalibrationMs: 1000,
    note: 'Native continuous time includes system suspend; browser active time is recorded separately. Interrupted runs cannot pass.' },
  limits: { maxRequests: 4000, maxDurationSeconds: 3600, maxOutputTokens: 128, maxConcurrentPerConnection: 2, requestsPerMinutePerConnection: 30 },
  sampleEverySeconds: 10, snapshotEverySeconds: 60, latencyEverySeconds: 30,
  gates: { minimumWallSeconds: pilot ? null : 3600, uiP95MsBelow: 200, speedRatioTolerance: 0.02, budgetStopBoundaryToleranceMs: 2000,
    memory: 'All owned browser processes RSS. Compare 5-minute medians after minute 35; no sustained positive trend > 1 MiB/min or net rise > 32 MiB. Missing native measurements never pass.' },
  machine: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, ramBytes: os.totalmem() },
  fixtureHash, note: 'Synthetic preconditioning is excluded from measured time/counter deltas. No page clock or speed acceleration is used.' };
await writeFile(`${directory}/protocol.json`, JSON.stringify(protocol, null, 2));
const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const cdp = await browser.newBrowserCDPSession();
let calls = 0, inFlight = 0, maxInFlight = 0;
const callTimes: number[] = [], errors: string[] = [], snapshots: any[] = [], samples: any[] = [], latencies: number[] = [];
const summary: any = { schemaVersion: 1, status: 'running', runId, protocol, browser: browser.version(), directory, errors };
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
await context.route('**/*', (route: any) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
await context.route('https://api.anthropic.com/v1/messages', async (route: any) => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const body = route.request().postDataJSON();
  assert(body.model === 'soak-fixture' && body.max_tokens === 128, 'Transport changed model or token cap');
  calls++; callTimes.push(nativeClock.read().continuousMs); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  try {
    await new Promise(resolve => setTimeout(resolve, 75));
    const action = calls === 1 ? { action: 'speak', params: { message: 'explicit probe' } } : { action: 'sleep', params: { duration: 1 } };
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ model: 'soak-fixture', usage: { input_tokens: 12, output_tokens: 9 }, content: [{ type: 'text', text: JSON.stringify(action) }] }) });
  } finally { inFlight--; }
});
await context.addInitScript(({ roster, profile, overrides, limits }: any) => {
  if (!localStorage.getItem('soak_fixture_initialized')) {
    localStorage.setItem('soak_fixture_initialized', 'true'); localStorage.setItem('simagents_agent_roster', JSON.stringify(roster));
    localStorage.setItem('simagents_connections_v1', JSON.stringify([profile])); localStorage.setItem('simagents_config_overrides', JSON.stringify(overrides));
    localStorage.setItem('simagents_session_limits_v1', JSON.stringify(limits));
  }
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    postMessage(data: any, ...rest: any[]) {
      if (data.cmd === 'start') (window as any).__soakStart = { monotonic: performance.now(), wall: Date.now() };
      return super.postMessage(data, ...rest);
    }
  } as typeof Worker;
}, { roster: fixture.roster, profile: fixture.profile, overrides: fixture.file.snapshot.configuration!.overrides, limits: protocol.limits });
const page = await context.newPage(); page.setDefaultTimeout(30000);
page.on('pageerror', (error: Error) => errors.push(error.message));
async function checkpoint() { await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2)); }
async function exportSnapshot(label: string) {
  const pending = page.waitForEvent('download'); await openSimulationTool(page, 'Export current world');
  const download = await pending, path = await download.path(); assert(path, 'Export did not produce a file');
  const raw = await Bun.file(path!).text(); assert(!raw.includes('synthetic-soak-key'), 'Credential appeared in export');
  const file = JSON.parse(raw); validateWorldSnapshotV1(file.snapshot);
  const snapshot = file.snapshot;
  assert(snapshot.speed === 1 && snapshot.store.agents.length === 20 && snapshot.store.agents.every((agent: any) => agent.state !== 'dead' && [agent.hunger, agent.energy, agent.health].every((value: number) => Number.isFinite(value) && value >= 0 && value <= 100)), 'Population, speed or vital invariants changed');
  assert(snapshot.store.events.length <= 10000 && snapshot.metrics.recentTicks.length <= 120, 'Resident event/metric limits exceeded');
  const counts = new Map<string, number>(); for (const memory of snapshot.store.memories) counts.set(memory.agentId, (counts.get(memory.agentId) ?? 0) + 1);
  assert([...counts.values()].every(count => count <= 100), 'Resident agent memory limit exceeded');
  const record = { label, capturedAt: Date.now(), simTimeMs: snapshot.savedAtSimTimeMs, tick: snapshot.store.worldState.currentTick, actions: snapshot.metrics.totalActions, events: snapshot.metrics.totalEvents, memories: snapshot.store.memories.length, agentsWithDecisions: snapshot.metrics.agents.filter((agent: any) => agent.actionsCount > 0).length };
  snapshots.push(record); await appendFile(`${directory}/snapshots.jsonl`, JSON.stringify(record) + '\n');
  return file;
}
async function memorySample() {
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const ids = processInfo.map((process: any) => Number(process.id)); assert(ids.length >= 3 && ids.every(Number.isSafeInteger), 'Owned process inventory unavailable');
  const raw = execFileSync('ps', ['-p', ids.join(','), '-o', 'pid=,rss='], { encoding: 'utf8' });
  const processes = raw.trim().split('\n').map(line => { const [pid, kib] = line.trim().split(/\s+/).map(Number); return { pid, rssBytes: kib * 1024, type: processInfo.find((item: any) => item.id === pid)?.type }; });
  assert(processes.length === ids.length && processes.every(process => Number.isFinite(process.rssBytes) && process.rssBytes > 0), 'Native RSS measurements unavailable');
  return { rssBytes: processes.reduce((sum, process) => sum + process.rssBytes, 0), processes };
}
async function measureLatency() {
  const target = page.locator('.simulation-tools:visible > summary');
  await page.evaluate(() => { (window as any).__soakInteraction = undefined; document.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('.simulation-tools > summary')) requestAnimationFrame(() => requestAnimationFrame(() => { (window as any).__soakInteraction = performance.now() - event.timeStamp; }));
  }, { once: true, capture: true }); });
  await target.click(); await page.waitForFunction(() => Number.isFinite((window as any).__soakInteraction));
  const latency = await page.evaluate(() => (window as any).__soakInteraction); latencies.push(latency);
  await page.keyboard.press('Escape'); return latency;
}
let began: { monotonic: number; wall: number } | undefined;
let nativeStart: ClockReading, previousClock: ClockReading;
try {
  await page.goto(base);
  summary.candidate = await (await context.request.get(new URL('candidate.json', base).href)).json();
  assert(summary.candidate.id, 'Candidate identity is missing'); await checkpoint();
  assert(createHash('sha256').update(JSON.stringify(summary.candidate.identity)).digest('hex') === summary.candidate.id, 'Candidate identity hash is invalid');
  if (!pilot) {
    assert(!summary.candidate.identity.dirty && summary.candidate.identity.commit === execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'A full soak requires the exact clean source commit');
    assert(!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), 'A full soak cannot certify a dirty checkout');
  }
  await openSetup(page); await setupStep(page, 'Provider keys');
  await setupDialog(page).locator('summary', { hasText: 'Custom endpoints and relays' }).click(); await page.getByRole('button', { name: 'Edit Simulated soak transport', exact: true }).click();
  await page.getByLabel('Connection API key', { exact: true }).fill('synthetic-soak-key'); await page.getByRole('button', { name: 'Save connection', exact: true }).click();
  await setupStep(page, 'Participants'); await page.getByRole('button', { name: 'Verify model for Soak agent 1 (1 request)', exact: true }).click();
  await page.getByText('Verified in this tab', { exact: true }).first().waitFor(); assert(calls === 1, 'Explicit probe did not make exactly one request');
  await page.keyboard.press('Escape'); await openSimulationTool(page, 'Import saved world');
  await page.locator('input[type=file]').setInputFiles({ name: 'controlled-soak.json', mimeType: 'application/json', buffer: Buffer.from(fixtureJson) });
  await page.getByRole('status').filter({ hasText: 'World imported. Use Start to resume the saved world.' }).waitFor();
  await page.locator('.app-header:visible').getByRole('button', { name: 'Start', exact: true }).click(); await setupStep(page, 'Limits and start');
  await page.getByRole('button', { name: /Resume saved world/ }).click();
  await page.getByRole('checkbox', { name: 'Capture actual requests for this session', exact: true }).check();
  await setupDialog(page).getByRole('button', { name: 'Resume world', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).first().waitFor();
  assert(await page.getByLabel('Simulation speed', { exact: true }).filter({ visible: true }).first().inputValue() === '1', 'World did not start at real-time speed');
  began = await page.evaluate(() => (window as any).__soakStart);
  assert(began, 'Real-time start marker was not observed'); summary.startedAt = began!.wall; summary.started = true;
  const beforeCalibration = nativeClock.read();
  const browserNow = await page.evaluate(() => performance.now());
  const afterCalibration = nativeClock.read();
  const calibrationMs = elapsedContinuous(beforeCalibration, afterCalibration);
  assert(calibrationMs <= 1000, 'Native/browser clock calibration was interrupted');
  const sinceStart = browserNow - began!.monotonic;
  nativeStart = { continuousMs: (beforeCalibration.continuousMs + afterCalibration.continuousMs) / 2 - sinceStart,
    uptimeMs: (beforeCalibration.uptimeMs + afterCalibration.uptimeMs) / 2 - sinceStart, wallMs: began!.wall };
  previousClock = afterCalibration;
  summary.clockCalibrationMs = calibrationMs;
  let lastSnapshot = -60000, lastLatency = -30000, finalFile: any;
  for (;;) {
    const timing = await page.evaluate(() => ({ monotonic: performance.now(), visible: !document.hidden }));
    const currentClock = nativeClock.read();
    const elapsedMs = elapsedContinuous(nativeStart, currentClock, previousClock);
    previousClock = currentClock;
    const browserElapsedMs = timing.monotonic - began!.monotonic;
    assert(Math.abs(elapsedMs - browserElapsedMs) <= 1000, 'Browser active time diverged from native continuous time');
    assert(timing.visible, 'Page became hidden; protocol cannot continue unchanged');
    if (elapsedMs - lastLatency >= 30000) { await measureLatency(); lastLatency = elapsedMs; }
    if (elapsedMs - lastSnapshot >= 60000) { finalFile = await exportSnapshot(`sample-${Math.floor(elapsedMs / 1000)}`); lastSnapshot = elapsedMs; }
    const memory = await memorySample(); const sample = { elapsedMs, browserElapsedMs, calendarElapsedMs: currentClock.wallMs - began!.wall, ...memory, calls, inFlight };
    samples.push(sample); await appendFile(`${directory}/measurements.jsonl`, JSON.stringify(sample) + '\n');
    summary.elapsedMs = elapsedMs; summary.calls = calls; summary.memorySamples = samples.length; summary.latencySamples = latencies.length; await checkpoint();
    if (errors.length) throw new Error('Unhandled browser error during soak');
    if (await page.getByRole('alert').filter({ hasText: /session duration limit|request budget/ }).count()) assert(!pilot && elapsedMs >= durationSeconds * 1000 - 2000, 'Session stopped before the protocol boundary');
    if (elapsedMs >= durationSeconds * 1000) break;
    if (samples.length % 6 === 0) console.log(`Checkpoint ${Math.floor(elapsedMs / 1000)}s: calls=${calls}, native RSS=${Math.round(memory.rssBytes / 1048576)} MiB, population=20.`);
    await new Promise(resolve => setTimeout(resolve, Math.min(10000, durationSeconds * 1000 - elapsedMs)));
  }
  if (await page.getByRole('button', { name: 'Pause', exact: true }).first().isVisible()) await page.getByRole('button', { name: 'Pause', exact: true }).first().click();
  finalFile = await exportSnapshot('final'); await writeFile(`${directory}/final-world.json`, JSON.stringify(finalFile));
  const activeBrowserMs = (await page.evaluate(() => performance.now())) - began!.monotonic;
  const endedClock = nativeClock.read();
  const actualWallMs = elapsedContinuous(nativeStart, endedClock, previousClock);
  previousClock = endedClock;
  assert(Math.abs(actualWallMs - activeBrowserMs) <= 1000, 'Final browser/native time diverged');
  const simElapsedMs = finalFile.snapshot.savedAtSimTimeMs - fixture.preconditioning.savedAtSimTimeMs;
  let firstCall = 0, maximumRollingMinuteCalls = 0;
  for (let index = 0; index < callTimes.length; index++) {
    while (callTimes[firstCall] <= callTimes[index] - 60000) firstCall++;
    maximumRollingMinuteCalls = Math.max(maximumRollingMinuteCalls, index - firstCall + 1);
  }
  assert(maxInFlight <= protocol.limits.maxConcurrentPerConnection && maximumRollingMinuteCalls <= protocol.limits.requestsPerMinutePerConnection, 'Synthetic traffic exceeded the controlled provider limits');
  assert(Math.abs(simElapsedMs / actualWallMs - 1) <= 0.02, 'Simulation did not stay at real-time speed');
  assert(finalFile.snapshot.metrics.agents.filter((agent: any) => agent.actionsCount > 0).length === 20, 'Not every simulated agent remained active');
  const sorted = [...latencies].sort((a, b) => a - b), p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  assert(Number.isFinite(p95) && p95 < 200, `UI p95 exceeded 200 ms: ${p95}`);
  let memoryPlateau: any = { status: 'not-measured-in-pilot' };
  if (!pilot) {
    assert(actualWallMs >= 3600000, 'Full soak elapsed less than 60 real minutes');
    const windows = [35, 40, 45, 50, 55].map(minute => {
      const values = samples.filter(sample => sample.elapsedMs >= minute * 60000 && sample.elapsedMs < (minute + 5) * 60000).map(sample => sample.rssBytes).sort((a, b) => a - b);
      assert(values.length >= 20, 'Insufficient native memory coverage after resident bounds'); return { minute, median: values[Math.floor(values.length / 2)] };
    });
    const mx = windows.reduce((sum, point) => sum + point.minute, 0) / windows.length, my = windows.reduce((sum, point) => sum + point.median, 0) / windows.length;
    const slope = windows.reduce((sum, point) => sum + (point.minute - mx) * (point.median - my), 0) / windows.reduce((sum, point) => sum + (point.minute - mx) ** 2, 0);
    const net = windows.at(-1)!.median - windows[0].median;
    memoryPlateau = { windows, slopeBytesPerMinute: slope, netRiseBytes: net, status: slope <= 1048576 && net <= 32 * 1048576 ? 'passed' : 'failed' };
    assert(memoryPlateau.status === 'passed', 'Sustained browser memory growth after resident bounds');
  }
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('simagents-app-data'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<any>((resolve, reject) => { const request = db.transaction('records').objectStore('records').get('world:current'); request.onsuccess = () => resolve(JSON.parse(request.result.json)); request.onerror = () => reject(request.error); }); } finally { db.close(); }
  });
  assert(JSON.stringify(persisted.snapshot.metrics) === JSON.stringify(finalFile.snapshot.metrics), 'Committed counters differ from final world');
  await page.reload();
  const reloaded = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('simagents-app-data'); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise<any>(resolve => { const request = db.transaction('records').objectStore('records').get('world:current'); request.onsuccess = () => resolve(JSON.parse(request.result.json)); }); } finally { db.close(); }
  });
  assert(JSON.stringify(reloaded.snapshot.metrics) === JSON.stringify(persisted.snapshot.metrics), 'Reload changed cumulative counters');
  summary.status = pilot ? 'pilot-complete-not-a-soak' : 'local-soak-complete-not-a-release-gate';
  elapsedContinuous(nativeStart, nativeClock.read(), previousClock);
  Object.assign(summary, { actualWallMs, activeBrowserMs, calendarElapsedMs: endedClock.wallMs - began!.wall,
    measuredWindowEndedAt: endedClock.wallMs, clockContinuityVerified: true, simElapsedMs, calls, maxInFlight, maximumRollingMinuteCalls, uiP95Ms: p95, memoryPlateau, snapshots, restoredCounters: true, completedAt: Date.now(), releaseGate: 'pending clean exact candidate and remaining exit criteria' });
  await page.screenshot({ path: `${directory}/after-reload.png` });
} catch (error) { summary.status = 'failed'; summary.failure = error instanceof Error ? error.message : 'Unknown soak failure'; await page.screenshot({ path: `${directory}/failure.png` }).catch(() => {}); }
finally { await checkpoint(); await context.close(); await browser.close(); nativeClock.dispose(); }
console.log(JSON.stringify({ status: summary.status, directory, elapsedMs: summary.elapsedMs, failure: summary.failure, uiP95Ms: summary.uiP95Ms }));
if (summary.status === 'failed') process.exitCode = 1;
