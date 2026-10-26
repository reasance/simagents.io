#!/usr/bin/env node
// Public production flows only. All provider traffic is simulated; no development engine bridge.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { en, it } from '../apps/web/src/i18n/catalog.ts';
import { nativeZoomContext } from './native-zoom.mjs';
import { openSimulationTool, productText, setSmokeLanguage, smokeLanguage, activateControl, saveProviderKey, setupDialog, setupStep } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const width = Number(process.env.SIMAGENTS_SMOKE_WIDTH ?? 1440), height = width === 768 ? 1024 : width === 390 ? 844 : 900;
const zoom = Number(process.env.SIMAGENTS_SMOKE_NATIVE_ZOOM ?? 1);
if (zoom !== 1 && (zoom !== 2 || !['chromium', 'firefox', 'webkit'].includes(browserName))) throw new Error('Native zoom is supported for Chromium, Firefox and WebKit');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const native = zoom === 2 ? await nativeZoomContext(playwright, { width, height }, browserName, base) : undefined;
const browser = native ? undefined : await playwright[browserName].launch({ headless: true });
const context = native?.context ?? await browser.newContext({ acceptDownloads: true, viewport: { width, height } });
let calls = 0;
const result = { browser: browserName, language: smokeLanguage, viewport: { width, height }, zoom, surfaces: [], failures: [], pageErrors: [] };
const keyboardOnly = zoom === 2 && browserName === 'firefox';
const activate = locator => activateControl(locator, keyboardOnly);
const openTool = (page, name) => openSimulationTool(page, name, keyboardOnly);
const assert = (value, message) => { if (!value) throw new Error(message); };
await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
await context.route('https://api.anthropic.com/v1/messages', route => {
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  calls++;
  const action = calls === 2 ? { action: 'sleep', params: { duration: 1 }, reasoning: 'Original model response' } : { action: 'speak', params: { message: 'fixture' }, reasoning: 'Original model response' };
  return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ model: 'fixture-reported-model', usage: { input_tokens: 12, output_tokens: 9 }, content: [{ type: 'text', text: JSON.stringify(action) }] }) });
});
await context.addInitScript(() => {
  window.__drawnProductText = [];
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(...args) {
    window.__drawnProductText.push(String(args[0])); window.__drawnProductText = window.__drawnProductText.slice(-400);
    return original.apply(this, args);
  };
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', error => result.pageErrors.push(error.message));
await setSmokeLanguage(page);
const evidenceRoot = process.env.SIMAGENTS_EVIDENCE_ROOT ?? '.tmp';
const prefix = `${evidenceRoot}/public-ui/${browserName}-${width}-${smokeLanguage}-${zoom}x`;
await mkdir(`${evidenceRoot}/public-ui`, { recursive: true });
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
async function audit(surface) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.scrollWidth > dimensions.width) result.failures.push(`${surface}: page horizontal overflow (${dimensions.scrollWidth}/${dimensions.width})`);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const violations = report.violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  await writeFile(`${prefix}-${surface}-axe.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${prefix}-${surface}.png` });
  result.surfaces.push({ surface, dimensions, violations });
  if (violations.length) result.failures.push(`${surface}: ${violations.map(item => item.id).join(', ')}`);
}
async function back() { await openTool(page, 'World'); }
async function exported() {
  const pending = page.waitForEvent('download'); await openTool(page, 'Export current world');
  return JSON.parse(await (await pending).createReadStream().then(async stream => { let raw = ''; for await (const chunk of stream) raw += chunk; return raw; }));
}
async function committedWorld() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('simagents-app-data');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => reject(new Error('Existing world database is unavailable'));
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(['records', 'accounting'], 'readonly');
      const world = tx.objectStore('records').get('world:current');
      const keys = tx.objectStore('accounting').getAllKeys(), usage = tx.objectStore('accounting').getAll();
      tx.oncomplete = () => { db.close(); resolve(JSON.stringify({ world: world.result, accounting: { keys: keys.result, usage: usage.result } })); };
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error('World/accounting read failed')); };
    };
  }));
}
try {
  await page.goto(base);
  const candidateResponse = await context.request.get(new URL('candidate.json', base).href);
  assert(candidateResponse.ok(), 'Served candidate manifest is missing');
  result.candidate = await candidateResponse.json();
  assert(typeof result.candidate.id === 'string', 'Served candidate manifest is invalid');
  assert(await page.evaluate(() => window.__simagentsEngineClient === undefined), 'Public build has a development bridge');
  if (native) result.nativeZoom = await native.zoom(page, zoom);
  await audit('ready');
  await activate(page.getByRole('button', { name: productText('Set up a simulation'), exact: true }));
  const dialog = setupDialog(page);
  await dialog.waitFor(); await audit('onboarding-keys');
  await saveProviderKey(page, 'Claude (Anthropic)', 'synthetic-public-ui-key');
  await setupStep(page, 'Participants', keyboardOnly);
  const skyLabel = productText('Use {color} for {agent}', { color: productText('Sky'), agent: 'Agent 1' });
  const sky = dialog.getByRole('button', { name: skyLabel, exact: true });
  await sky.press('Space');
  assert(await sky.getAttribute('aria-pressed') === 'true', 'Keyboard color selection state is not exposed');
  assert((await sky.textContent()).includes('✓'), 'Color selection has no visible non-color indicator');
  const colorBox = await sky.boundingBox();
  assert(colorBox.width >= 44 && colorBox.height >= 44, 'Color target is smaller than 44 CSS pixels');
  result.setupKeyboardControls = { visibleSelectionMark: true, colorTarget: colorBox };
  await activate(dialog.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }));
  await dialog.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
  const closeControl = dialog.getByRole('button', { name: productText('Close simulation setup'), exact: true });
  const closeGeometry = await closeControl.evaluate(element => ({ rect: element.getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight } }));
  assert(closeGeometry.rect.left >= 0 && closeGeometry.rect.right <= closeGeometry.viewport.width &&
    closeGeometry.rect.top >= 0 && closeGeometry.rect.bottom <= closeGeometry.viewport.height &&
    closeGeometry.rect.width >= 44 && closeGeometry.rect.height >= 44, `Setup close control is clipped or smaller than 44 CSS pixels: ${JSON.stringify(closeGeometry)}`);
  result.setupCloseGeometry = closeGeometry;
  await audit('setup-participants');
  await setupStep(page, 'Limits and start', keyboardOnly);
  await dialog.getByLabel(productText('Requests'), { exact: true }).fill('2');
  const capture = dialog.getByRole('checkbox', { name: productText('Capture actual requests for this session'), exact: true });
  // Let the scroll that brought the filled field into view finish; Firefox can drop a focus scroll issued during it.
  const nextFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await nextFrames();
  await capture.focus();
  await nextFrames();
  const captureGeometry = await capture.evaluate(el => { const r = el.getBoundingClientRect(); return { rect: r.toJSON(), viewport: { width: innerWidth, height: innerHeight }, visible: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
  assert(captureGeometry.visible, `Focused request-capture consent is outside the viewport: ${JSON.stringify(captureGeometry)}`);
  const startActions = await dialog.locator('.setup-footer button').evaluateAll(buttons => buttons.map(el => ({ label: el.textContent.trim(), rect: el.getBoundingClientRect().toJSON(), viewportWidth: innerWidth, viewportHeight: innerHeight })));
  assert(startActions.length >= 2 && startActions.every(({ rect: r, viewportWidth: w, viewportHeight: h }) => r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= w && r.top >= 0 && r.bottom <= h), `Start actions are clipped or smaller than 44 pixels: ${JSON.stringify(startActions)}`);
  result.startReviewGeometry = { capture: captureGeometry, actions: startActions };
  if (keyboardOnly) { if (!(await capture.isChecked())) await capture.press('Space'); assert(await capture.isChecked(), 'Keyboard capture consent failed'); } else await capture.check();
  await audit('start-review');
  await activate(dialog.getByRole('button', { name: productText('Start world'), exact: true }));
  await page.getByRole('button', { name: productText('Pause'), exact: true }).first().waitFor();
  await activate(page.getByRole('button', { name: productText('Pause'), exact: true }).first());
  await page.getByRole('button', { name: productText('Resume'), exact: true }).first().waitFor();
  await audit('paused');
  const beforeLanguage = await exported();
  const changedLanguage = smokeLanguage === 'en' ? 'it' : 'en';
  const engraved = value => value.toUpperCase();
  const expected = engraved((changedLanguage === 'it' ? it : en).Forest);
  await activate(page.locator('.simulation-tools:visible > summary'));
  await page.evaluate(() => { window.__drawnProductText = []; });
  const languageSelect = page.locator('.simulation-tools:visible .menu-row select');
  await languageSelect.selectOption(changedLanguage);
  await page.waitForFunction(label => window.__drawnProductText.includes(label), expected);
  assert(await page.evaluate(() => document.documentElement.lang) === changedLanguage, 'Interface language did not update document language');
  await languageSelect.selectOption(smokeLanguage); await page.keyboard.press('Escape');
  const afterLanguage = await exported();
  assert(JSON.stringify(beforeLanguage.snapshot) === JSON.stringify(afterLanguage.snapshot), 'Changing language modified the world, RNG or experiment settings');
  result.canvasLanguageRedraw = true;

  const cssWidth = await page.evaluate(() => innerWidth);
  if (cssWidth >= 1024) {
    const rail = page.locator('#desktop-observation-panel');
    const row = rail.locator('.participant-row').first();
    await row.focus(); await page.keyboard.press('Enter');
    await rail.getByRole('button', { name: new RegExp(productText('All participants')) }).waitFor();
    await audit('agent-detail');
    await activate(rail.getByRole('button', { name: new RegExp(productText('All participants')) }));
    await activate(rail.getByRole('button', { name: productText('All events'), exact: true })); await audit('feed-all-events');
    await activate(rail.getByRole('button', { name: productText('Said and done'), exact: true }));
  } else {
    const nav = page.getByRole('navigation', { name: productText('World views') });
    await activate(nav.getByRole('button', { name: new RegExp(productText('Participants')) })); await audit('participants');
    await activate(page.locator('.participant-row').first()); await audit('agent-profile');
    await activate(nav.getByRole('button', { name: productText('Map'), exact: true }));
    const inspect = page.getByRole('combobox', { name: productText('Inspect agent or resource') });
    await inspect.selectOption(await inspect.locator('option[value^="resource:"]').first().getAttribute('value')); await audit('resource-profile');
    await activate(nav.getByRole('button', { name: new RegExp(productText('Feed')) })); await audit('feed');
    await activate(nav.getByRole('button', { name: productText('Map'), exact: true }));
  }
  const canvas = page.getByRole('img', { name: productText('Interactive world map') }).first();
  await activate(page.getByRole('button', { name: productText('Move map view'), exact: true }).filter({ visible: true }).first());
  const cameraBefore = Number(await canvas.getAttribute('data-camera-x'));
  const panGroup = page.getByRole('group', { name: productText('Move map view'), exact: true });
  await activate(panGroup.getByRole('button', { name: productText('Move right'), exact: true }));
  assert(Number(await canvas.getAttribute('data-camera-x')) < cameraBefore, 'Map cannot pan without dragging');
  await audit('map-pan-controls');
  await activate(panGroup.getByRole('button', { name: productText('Close'), exact: true }));
  await activate(page.getByRole('button', { name: productText('Resume'), exact: true }).first());
  await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
  assert(calls === 3, `Expected one probe and two decisions, saw ${calls}`); await audit('budget-error');
  const beforeGraph = await exported();
  const graphReports = [];
  for (const reopening of [false, true]) {
    await openTool(page, 'Social Graph');
    const graph = page.getByRole('dialog', { name: productText('Social Graph'), exact: true });
    await graph.waitFor();
    const graphSvg = graph.getByRole('img', { name: productText('Social Graph'), exact: true });
    const graphNode = graphSvg.locator('g.nodes > g').first();
    await graphNode.waitFor();
    assert(await graphSvg.locator('g.nodes > g').count() === beforeGraph.snapshot.store.agents.filter(agent => agent.state !== 'dead').length, 'Social graph lost nodes on open/reopen');
    assert(await graph.locator('.session-controls').count() === 1, 'Graph hides essential session controls');
    const close = graph.getByRole('button', { name: productText('Close social graph'), exact: true });
    const closeRect = await close.evaluate(el => ({ ...el.getBoundingClientRect().toJSON(), widthLimit: innerWidth, heightLimit: innerHeight, css: { minHeight: getComputedStyle(el).minHeight, height: getComputedStyle(el).height, boxSizing: getComputedStyle(el).boxSizing, transform: getComputedStyle(el).transform, zoom: getComputedStyle(el).zoom }, className: el.className }));
    assert(closeRect.width >= 44 && closeRect.height >= 44 && closeRect.left >= 0 && closeRect.right <= closeRect.widthLimit && closeRect.bottom <= closeRect.heightLimit, `Graph close control is clipped or too small: ${JSON.stringify(closeRect)}`);
    if (!reopening) {
      const filter = graph.getByRole('button', { name: productText('Speech'), exact: true });
      assert(await filter.getAttribute('aria-pressed') === 'true' && (await filter.textContent()).includes('✓'), 'Graph filter has no exposed/non-color selection');
      await activate(filter); assert(await filter.getAttribute('aria-pressed') === 'false', 'Graph filter keyboard/pointer toggle failed');
      await activate(filter);
      const originalZoom = Number(await graphSvg.getAttribute('data-zoom'));
      await activate(graph.getByRole('button', { name: productText('Zoom in'), exact: true }));
      assert(Number(await graphSvg.getAttribute('data-zoom')) > originalZoom, 'Graph zoom command did not change view');
      await activate(graph.getByRole('button', { name: productText('Reset camera'), exact: true }));
      await activate(graph.getByRole('button', { name: productText('Move map view'), exact: true }));
      const pan = graph.getByRole('group', { name: productText('Move map view'), exact: true });
      await activate(pan.getByRole('button', { name: productText('Move right'), exact: true }));
      assert(Number(await graphSvg.getAttribute('data-pan-x')) > 0, 'Graph cannot pan without dragging');
      await activate(pan.getByRole('button', { name: productText('Reset camera'), exact: true }));
      await page.keyboard.press('Escape');
      assert(await graph.isVisible() && !(await pan.isVisible()), 'Escape did not close only the graph pan controls');
      await graph.getByLabel(productText('Select agent'), { exact: true }).selectOption(beforeGraph.snapshot.store.agents[0].id);
      await activate(graph.getByRole('button', { name: productText('Move selected graph agent'), exact: true }));
      const movement = graph.getByRole('group', { name: productText('Move selected graph agent'), exact: true });
      const nodeBefore = await graphNode.getAttribute('transform');
      await activate(movement.getByRole('button', { name: productText('Move right'), exact: true }));
      await page.waitForFunction(before => document.querySelector('[aria-labelledby="social-graph-title"] g.nodes > g')?.getAttribute('transform') !== before, nodeBefore);
      await activate(movement.getByRole('button', { name: productText('Release agent position'), exact: true }));
      await activate(movement.getByRole('button', { name: productText('Close'), exact: true }));
    }
    const plot = await graphSvg.boundingBox();
    const graphViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert(plot && plot.width >= 100 && plot.height >= 30 && plot.x >= 0 && plot.y >= 0 && plot.x + plot.width <= graphViewport.width + 1 && plot.y + plot.height <= graphViewport.height + 1, `Graph plot has no usable visible area: ${JSON.stringify({ plot, viewport: graphViewport })}`);
    graphReports.push({ reopened: reopening, nodes: await graphSvg.locator('g.nodes > g').count(), closeRect, plot });
    await audit(reopening ? 'social-graph-reopened' : 'social-graph');
    if (reopening) {
      await activate(graph.locator('.simulation-tools:visible > summary'));
      await page.keyboard.press('Escape');
      assert(await graph.isVisible(), 'Escape from graph tools closed the whole graph');
      await openTool(graph, 'Advanced settings');
      await page.getByRole('button', { name: productText('Close configuration panel'), exact: true }).waitFor();
      assert(await graph.count() === 0, 'Graph blocks navigation to configuration');
      await activate(page.getByRole('button', { name: productText('Close configuration panel'), exact: true }));
    } else await activate(close);
  }
  assert(JSON.stringify((await exported()).snapshot) === JSON.stringify(beforeGraph.snapshot), 'Graph controls changed the experiment, RNG or world');
  result.socialGraphControls = { views: graphReports, worldPreserved: true, nodeMovementWithoutDrag: true, pressedAndVisibleFilterState: true, sessionControlsPresent: true };
  const saved = await exported();
  const unchanged = JSON.stringify(saved.snapshot);
  const committedBeforeInvalid = await committedWorld();
  await openTool(page, 'Import saved world');
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"invalid":true}') });
  const afterInvalid = await exported(); assert(JSON.stringify(afterInvalid.snapshot) === unchanged, 'Invalid import changed the world');
  assert(await committedWorld() === committedBeforeInvalid, 'Invalid envelope import changed the committed world or byte accounting');
  // Review and dismiss the persistent import notification before inspecting
  // other pages, just as the public recovery flow requires.
  const importAlert = page.getByRole('alert').filter({ has: page.getByRole('button', { name: productText('Close'), exact: true }) });
  await activate(importAlert.getByRole('button', { name: productText('Close'), exact: true }));
  const invalidAwards = structuredClone(saved), winner = saved.snapshot.store.agents[0].id;
  invalidAwards.snapshot.store.puzzleGames.push({ id: 'invalid-import-awards', tenantId: null, gameType: 'password',
    status: 'completed', solution: 'fixture', solutionHash: null, prizePool: 1, entryStake: 0,
    maxParticipants: 1, minParticipants: 1, fragmentCount: 0, createdAtTick: 0, startsAtTick: 0,
    endsAtTick: saved.snapshot.store.worldState.currentTick, winnerId: winner, createdAt: null,
    prizeDistribution: [{ agentId: winner, amount: 2, type: 'solo_winner' }] });
  await openTool(page, 'Import saved world');
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid-awards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidAwards)) });
  await importAlert.waitFor({ state: 'visible' });
  assert(JSON.stringify((await exported()).snapshot) === unchanged, 'Invalid puzzle awards import changed the live world');
  assert(await committedWorld() === committedBeforeInvalid, 'Invalid puzzle awards import changed the committed world or byte accounting');
  await activate(importAlert.getByRole('button', { name: productText('Close'), exact: true }));
  result.invalidImportCases = ['invalid-envelope', 'puzzle-awards-exceed-pool'];
  for (const tool of ['Relations', 'Prompts']) {
    await openTool(page, tool);
    await page.getByRole('heading', { name: productText(tool), exact: true }).first().waitFor(); await audit(tool.toLowerCase());
    await back();
  }
  await openTool(page, 'Replay');
  await page.getByRole('note').filter({ hasText: productText('Saved replay:') }).waitFor(); await audit('replay');
  await activate(page.getByRole('button', { name: productText('Exit Replay'), exact: true }));
  assert(calls === 3, 'Reading public surfaces or importing invalid data issued inference');
  result.providerCalls = calls; result.status = result.failures.length || result.pageErrors.length ? 'failed' : 'passed';
} catch (error) { result.failures.push(error.message); result.status = 'failed'; await page.screenshot({ path: `${prefix}-failure.png` }); }
finally {
  await context.tracing.stop(result.status === 'failed' ? { path: `${prefix}-failure-trace.zip` } : {});
  await writeFile(`${prefix}-report.json`, JSON.stringify(result, null, 2));
  if (native) await native.close(); else { await context.close(); await browser.close(); }
}
console.log(JSON.stringify({ status: result.status, browserName, width, zoom, language: smokeLanguage, surfaces: result.surfaces.length, failures: result.failures, pageErrors: result.pageErrors }, null, 2));
if (result.status !== 'passed') process.exitCode = 1;
