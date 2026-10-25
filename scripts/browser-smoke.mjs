#!/usr/bin/env node
import { openSetup, openSimulationTool, setupDialog, setupStep, startFromSetup } from './browser-helpers.mjs';

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const browserType = loadPlaywright()[process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium'];

const baseUrl = process.env.SIMAGENTS_SMOKE_URL ?? 'http://localhost:5175/';

const baselineRoster = [
  { name: 'Random-1', provider: 'baseline_random', modelId: 'baseline_random', color: '#9ca3af' },
  { name: 'Rule-1', provider: 'baseline_rule', modelId: 'baseline_rule', color: '#6b7280' },
  { name: 'Sugar-1', provider: 'baseline_sugarscape', modelId: 'baseline_sugarscape', color: '#4b5563' },
];

const codexRoster = [
  { name: 'Codex-1', provider: 'codex', modelId: 'gpt-5.4-mini', color: '#3b82f6' },
];

const claudeRoster = [
  { name: 'Claude-1', provider: 'claude', modelId: 'claude-sonnet-5', color: '#e07a5f' },
];

const results = [];
const failures = [];

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '600',
};

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    if (!process.env.PLAYWRIGHT_MODULE_DIR) {
      throw error;
    }
    return createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR.replace(/\/+$/, '')}/package.json`)('playwright');
  }
}

function browserInitPayload({ roster = baselineRoster, keys = {}, proxyUrl = '', config = {} } = {}) {
  return { roster, keys, proxyUrl, config };
}

function installLocalState({ roster, keys, proxyUrl, config }) {
  const preserve = new Set([
    'simagents_sound_enabled',
    'simagents_sound_volume',
    'simagents_world_snapshot',
    'simagents_event_ring',
  ]);
  for (const key of Object.keys(localStorage)) {
    if (!preserve.has(key)) localStorage.removeItem(key);
  }
  localStorage.setItem('simagents_agent_roster', JSON.stringify(roster));
  if (Object.keys(keys).length > 0) {
    localStorage.setItem('simagents_api_keys', JSON.stringify(keys));
  }
  if (proxyUrl) {
    localStorage.setItem('simagents_proxy_url', proxyUrl);
  }
  if (Object.keys(config).length > 0) {
    localStorage.setItem('simagents_config_overrides', JSON.stringify(config));
  }
}

function actionText(provider) {
  return JSON.stringify({
    action: 'speak',
    params: { message: `${provider} smoke` },
    reasoning: `${provider} mocked browser request`,
  });
}

function corsHeadersFor(request) {
  return {
    ...CORS_HEADERS,
    'access-control-allow-headers':
      request.headers()['access-control-request-headers'] ??
      'authorization,content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access',
  };
}

async function fulfillCorsPreflight(route) {
  await route.fulfill({
    status: 204,
    headers: corsHeadersFor(route.request()),
    body: '',
  });
}

function assertSmoke(condition, message, details = {}) {
  if (condition) return;
  failures.push({ message, ...details });
}

async function createContext(browser, payload, options = {}) {
  const context = await browser.newContext({ acceptDownloads: true, ...options });
  context.setDefaultTimeout(20000); context.setDefaultNavigationTimeout(30000);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(baseUrl).origin ? route.continue() : route.abort();
  });
  await context.addInitScript(installLocalState, payload);
  return context;
}

async function openPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (await page.evaluate(() => localStorage.getItem('simagents_api_keys') !== null)) {
    await openSetup(page);
    await setupStep(page, 'Provider keys');
    await setupDialog(page).locator('summary', { hasText: 'Save keys on this device (encrypted)' }).click();
    await page.getByRole('button', { name: 'Move old keys to this session', exact: true }).click();
    await page.waitForFunction(() => localStorage.getItem('simagents_api_keys') === null);
    await page.keyboard.press('Escape');
  }
  return page;
}

async function clickStart(page, choice = 'new') {
  await startFromSetup(page, { choice });
  await page.getByRole('button', { name: /Pause/ }).waitFor();
}

async function clickPause(page) {
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.waitForFunction(() => document.body.textContent.includes('Paused'));
  await waitForSavedWorld(page);
}

async function clickResume(page) {
  await page.getByRole('button', { name: /Resume/ }).click();
  await page.getByRole('button', { name: /Pause/ }).waitFor();
}

async function readData(page, key) {
  return page.evaluate(async key => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('simagents-app-data'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => { const r = db.transaction('records').objectStore('records').get(key); r.onsuccess = () => resolve(r.result ? JSON.parse(r.result.json) : undefined); r.onerror = () => reject(r.error); }); }
    finally { db.close(); }
  }, key);
}

async function readSavedSnapshot() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('simagents-app-data');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains('records')) return null;
    return await new Promise((resolve, reject) => {
      const request = db.transaction('records').objectStore('records').get('world:current');
      request.onsuccess = () => resolve(request.result ? JSON.parse(request.result.json).snapshot : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function waitForSavedWorld(page) { await page.waitForFunction(readSavedSnapshot); }

async function snapshot(page) {
  return page.evaluate(readSavedSnapshot);
}

async function verifyLocalAnalytics(page) {
  await openSimulationTool(page, 'Relations');
  await page.waitForFunction(() => document.body.innerText.includes('Relations Metrics'));
  const visible = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      relations: text.includes('Relations Metrics'),
      survival: text.includes('Survival Metrics'),
      behavior: text.includes('Behavior Metrics'),
      temporal: text.includes('Temporal Metrics'),
      noEconomy: !text.includes('Economy Metrics') && !text.includes('Gini'),
    };
  });
  results.push({ step: 'local-analytics', ...visible });
  assertSmoke(Object.values(visible).every(Boolean), 'relations page did not render the expected sections', visible);

  await page.getByRole('button', { name: 'Export agents CSV' }).waitFor();
  const relations = await page.evaluate((names) => {
    const section = [...document.querySelectorAll('section')].find((node) => node.getAttribute('aria-label') === 'Relations Metrics');
    const rows = [...(section?.querySelectorAll('tbody tr') ?? [])].map((row) => row.textContent ?? '');
    return { section: !!section, rows: rows.length, everyAgent: names.every((name) => rows.some((row) => row.includes(name))) };
  }, baselineRoster.map((entry) => entry.name));
  results.push({ step: 'local-relations', ...relations });
  assertSmoke(relations.section && relations.rows === baselineRoster.length && relations.everyAgent, 'relations panel did not list every agent', relations);

  await openSimulationTool(page, 'World');
  await page.waitForFunction(() => document.body.textContent.includes('Paused'));
}

async function verifyLocalReplay(page) {
  await openSimulationTool(page, 'Replay');
  await page.waitForFunction(() => document.body.innerText.includes('Step through saved frames'));
  const visible = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      replay: text.includes('Step through saved frames'),
      events: text.includes('Events at Tick') || text.includes('No events at this tick'),
      frameStored: true,
    };
  });
  visible.frameStored = !!await readData(page, 'simagents_replay_frames_v1');
  results.push({ step: 'local-replay', ...visible });
  assertSmoke(visible.replay && visible.events, 'local replay page or saved events did not render');
  assertSmoke(visible.frameStored, 'local replay frames were not persisted');
  await page.getByRole('button', { name: /Exit Replay/i }).click();
  await page.waitForFunction(() => document.body.textContent.includes('Paused'));
}

async function verifyPromptEditorAndInspector(page) {
  await openSimulationTool(page, 'Advanced settings');
  await page.waitForFunction(() => document.body.innerText.includes('Agent System Prompt'));
  const prompt = page.locator('textarea[placeholder="Enter your custom system prompt..."]').first();
  await prompt.fill('You are a local smoke-test agent. Return only valid action JSON.');
  await page.getByRole('button', { name: /Apply Changes/ }).click();
  await page.waitForFunction(() => (
    localStorage.getItem('simagents_custom_prompt')?.includes('smoke-test') ?? false
  ));
  const customPromptStored = await page.evaluate(() => (
    localStorage.getItem('simagents_custom_prompt')?.includes('smoke-test') ?? false
  ));
  await page.getByRole('button', { name: 'Close configuration panel', exact: true }).click();

  await openSimulationTool(page, 'Prompts');
  await page.waitForFunction(() => (
    document.body.innerText.includes('Live Inspector Active') ||
    document.body.innerText.includes('No Prompt Logs Yet')
  ));
  const inspector = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      active: text.includes('Live Inspector Active'),
      noData: text.includes('No Prompt Logs Yet'),
      promptLogsStored: true,
    };
  });
  inspector.promptLogsStored = !!await readData(page, 'simagents_prompt_logs_v1');
  results.push({ step: 'local-prompts', customPromptStored, ...inspector });
  assertSmoke(customPromptStored, 'custom prompt was not persisted locally');
  assertSmoke(inspector.active || inspector.noData, 'local prompt inspector did not render');
  await openSimulationTool(page, 'World');
  await page.waitForFunction(() => document.body.textContent.includes('Paused'));
}

async function verifyBrowserExperiment(page) {
  const experiment = await page.evaluate(async () => {
    const client = window.__simagentsEngineClient;
    if (!client) return { hasClient: false };
    const run = await client.runExperiment({
      id: 'smoke',
      name: 'Smoke experiment',
      ticks: 1,
      wallStepMs: 6000,
      captureEveryTicks: 1,
    });
    const exported = await client.exportExperiment(run.id);
    return {
      hasClient: true,
      status: run.status,
      ticksCompleted: run.ticksCompleted,
      snapshots: run.snapshots.length,
      stored: true,
      csvHeader: exported.csv.startsWith('runId,tick,simTimeMs'),
      jsonHasRun: exported.json.includes(run.id),
    };
  });
  experiment.stored = !!await readData(page, 'simagents_experiment_runs_v1');
  results.push({ step: 'browser-experiment', ...experiment });
  assertSmoke(experiment.hasClient, 'dev engine client bridge is unavailable');
  assertSmoke(experiment.status === 'completed', 'browser experiment did not complete', experiment);
  assertSmoke(experiment.stored && experiment.csvHeader && experiment.jsonHasRun, 'browser experiment export/storage failed', experiment);
  await page.waitForFunction(() => document.body.textContent.includes('Paused'));
}

async function runBaselinePersistence(browser) {
  const context = await createContext(browser, browserInitPayload({ roster: baselineRoster }));
  const page = await openPage(context);

  await clickStart(page, 'new');
  await page.waitForTimeout(2_200);
  if (!(await page.getByRole('button', { name: /Pause/ }).count())) console.error('Baseline state before Pause:', await page.locator('body').innerText());
  await clickPause(page);
  const afterPause = await snapshot(page);
  results.push({
    step: 'baseline-start-pause',
    agents: afterPause.store.agents.length,
    tick: afterPause.store.worldState.currentTick,
    events: afterPause.store.events.length,
  });
  assertSmoke(afterPause.store.agents.length === baselineRoster.length, 'baseline start spawned wrong agent count', {
    expected: baselineRoster.length,
    actual: afterPause.store.agents.length,
  });
  assertSmoke(afterPause.store.events.length > 0, 'baseline start produced no events');
  assertSmoke(afterPause.random?.complete && afterPause.random.agents.length === baselineRoster.length, 'random streams missing from snapshot');
  assertSmoke(afterPause.metrics?.complete && afterPause.metrics.totalEvents >= afterPause.store.events.length, 'cumulative counters missing');
  await verifyLocalAnalytics(page);
  await verifyLocalReplay(page);
  await verifyPromptEditorAndInspector(page);
  await verifyBrowserExperiment(page);

  await clickResume(page);
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await clickStart(page, 'resume');
  await page.waitForTimeout(600);
  await clickPause(page);
  const afterReloadResume = await snapshot(page);
  assertSmoke(afterReloadResume.metrics.totalEvents >= afterPause.metrics.totalEvents && afterReloadResume.metrics.totalActions >= afterPause.metrics.totalActions, 'reload lost cumulative counters');
  results.push({
    step: 'reload-resume',
    agents: afterReloadResume.store.agents.length,
    tick: afterReloadResume.store.worldState.currentTick,
  });
  assertSmoke(afterReloadResume.store.agents.length === baselineRoster.length, 'reload resume lost agents', {
    expected: baselineRoster.length,
    actual: afterReloadResume.store.agents.length,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openSimulationTool(page, 'Export current world'),
  ]);
  const exportPath = await download.path();
  const exportJson = await readFile(exportPath, 'utf8');
  const exported = JSON.parse(exportJson);
  results.push({
    step: 'export',
    bytes: Buffer.byteLength(exportJson),
    exportedAgents: exported.snapshot.store.agents.length,
    exportedEvents: exported.events.length,
  });
  assertSmoke(Buffer.byteLength(exportJson) > 0, 'export produced an empty payload');
  assertSmoke(exported.snapshot.store.agents.length === baselineRoster.length, 'exported world has wrong agent count', {
    expected: baselineRoster.length,
    actual: exported.snapshot.store.agents.length,
  });
  assertSmoke(exported.events.length > 0, 'exported world has no event ring');

  page.once('dialog', (dialog) => dialog.accept());
  await openSimulationTool(page, 'Reset');
  await page.waitForFunction(() => document.body.textContent.includes('Ready'));

  await page.locator('input[type="file"]').setInputFiles({
    name: 'simagents-world-smoke.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportJson),
  });
  await page.getByRole('status').filter({ hasText: 'World imported. Use Start to resume the saved world.' }).waitFor();
  results.push({ step: 'import-notice', structured: true });
  await page.getByRole('status').filter({ hasText: 'World imported. Use Start to resume the saved world.' }).getByRole('button', { name: 'Close', exact: true }).click();
  await waitForSavedWorld(page);
  await clickStart(page, 'resume');
  await page.waitForTimeout(500);
  await clickPause(page);
  const afterImportResume = await snapshot(page);
  results.push({
    step: 'import-resume',
    agents: afterImportResume.store.agents.length,
    tick: afterImportResume.store.worldState.currentTick,
  });
  assertSmoke(afterImportResume.store.agents.length === baselineRoster.length, 'import resume has wrong agent count', {
    expected: baselineRoster.length,
    actual: afterImportResume.store.agents.length,
  });

  await context.close();
}

async function runLocalAgentOverrides(browser) {
  const context = await createContext(
    browser,
    browserInitPayload({
      roster: [baselineRoster[0]],
      config: {
        agent: {
          startingBalance: 997,
          startingHealth: 88,
        },
        economy: {
          currencyDecayRate: 1,
          currencyDecayInterval: 1,
        },
      },
    })
  );
  const page = await openPage(context);

  await clickStart(page, 'new');
  await clickPause(page);
  const [agent] = (await snapshot(page)).store.agents;
  results.push({
    step: 'local-agent-overrides',
    balance: agent.balance,
    health: agent.health,
  });
  assertSmoke(agent.balance === 997, 'local agent balance override was not applied', {
    expected: 997,
    actual: agent.balance,
  });
  // A live continuous-time heartbeat can heal fractionally before Pause reaches the Worker.
  // This still distinguishes the requested initial 88 from the default 100.
  assertSmoke(agent.health >= 88 && agent.health < 89, 'local agent health override was not applied within the initial live interval', {
    expected: 88,
    actual: agent.health,
  });

  await context.close();
}

async function runProxyMissing(browser) {
  const context = await createContext(
    browser,
    browserInitPayload({ roster: codexRoster, keys: { codex: 'test-codex-key' } })
  );
  const page = await openPage(context);

  await openSetup(page);
  await setupStep(page, 'Provider keys');
  const openaiRow = setupDialog(page).locator('.key-row').filter({ hasText: 'OpenAI' }).first();
  // With an official relay in the build the row offers it; without one it asks for the user's relay.
  const relayNotice = await openaiRow.getByText('does not accept calls from a browser').count();
  const relayRoutes = await openaiRow.locator('option[value="official-relay"], option[value="user-relay"]').count();
  const directOffered = await openaiRow.locator('option[value="direct"]').count();
  results.push({ step: 'proxy-missing-ui', relayNotice, relayRoutes, directOffered });
  assertSmoke(directOffered === 0 && (relayNotice === 1 || relayRoutes > 0), 'proxy-required provider offers a direct route or does not explain the relay');
  await page.keyboard.press('Escape');

  await page.locator('.app-header:visible').getByRole('button', { name: 'Start', exact: true }).click();
  await setupDialog(page).getByRole('status').filter({ hasText: 'configure an HTTPS relay' }).waitFor();
  const blocked = await setupDialog(page).getByRole('navigation', { name: 'Setup progress' }).getByRole('button', { name: /Limits and start/ }).isDisabled();
  results.push({ step: 'proxy-missing-run', startBlocked: blocked });
  assertSmoke(blocked, 'missing-proxy session was not blocked before start');

  await context.close();
}

async function runDirectLlm(browser) {
  const hits = [];
  const context = await createContext(
    browser,
    browserInitPayload({
      roster: claudeRoster,
      keys: { claude: 'test-claude-key' },
    })
  );
  const page = await openPage(context);

  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillCorsPreflight(route);
      return;
    }
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    hits.push({
      url: route.request().url(),
      headers: await route.request().allHeaders(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeadersFor(route.request()),
      body: JSON.stringify({
        content: [{ type: 'text', text: actionText('claude') }],
        usage: { input_tokens: 20, output_tokens: 8 },
      }),
    });
  });

  await clickStart(page, 'new');
  await page.waitForTimeout(2_500);
  await clickPause(page);
  results.push({
    step: 'direct-llm-mocked',
    hits: hits.length,
    authHeader: hits[0]?.headers?.['x-api-key'] ? 'x-api-key' : 'missing',
    model: hits[0]?.body?.model,
  });
  assertSmoke(hits.length > 0, 'direct LLM mock received no POST requests');
  assertSmoke(hits[0]?.headers?.['x-api-key'] === 'test-claude-key', 'direct LLM mock missing x-api-key header', {
    actual: hits[0]?.headers?.['x-api-key'] ? 'present' : 'missing',
  });
  assertSmoke(hits[0]?.body?.model === 'claude-sonnet-5', 'direct LLM mock used unexpected model', {
    expected: 'claude-sonnet-5',
    actual: hits[0]?.body?.model,
  });

  await context.close();
}

async function runProxyLlm(browser) {
  const hits = [];
  const proxyUrl = 'https://proxy.example.test/llm';
  const context = await createContext(
    browser,
    browserInitPayload({
      roster: codexRoster,
      keys: { codex: 'test-openai-key' },
      proxyUrl,
    })
  );
  const page = await openPage(context);

  await page.route(`${proxyUrl}/api.openai.com/v1/chat/completions`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillCorsPreflight(route);
      return;
    }
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    hits.push({
      url: route.request().url(),
      headers: await route.request().allHeaders(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeadersFor(route.request()),
      body: JSON.stringify({
        choices: [{ message: { content: actionText('codex') } }],
        usage: { prompt_tokens: 22, completion_tokens: 9 },
      }),
    });
  });

  await clickStart(page, 'new');
  await page.waitForTimeout(2_500);
  await clickPause(page);
  results.push({
    step: 'proxy-llm-mocked',
    hits: hits.length,
    authorization: hits[0]?.headers?.authorization ? 'bearer' : 'missing',
    url: hits[0]?.url,
    model: hits[0]?.body?.model,
  });
  assertSmoke(hits.length > 0, 'proxied LLM mock received no POST requests');
  assertSmoke(hits[0]?.headers?.authorization === 'Bearer test-openai-key', 'proxied LLM mock missing bearer auth', {
    actual: hits[0]?.headers?.authorization ? 'present' : 'missing',
  });
  assertSmoke(
    hits[0]?.url === `${proxyUrl}/api.openai.com/v1/chat/completions`,
    'proxied LLM mock used unexpected URL',
    { expected: `${proxyUrl}/api.openai.com/v1/chat/completions`, actual: hits[0]?.url }
  );
  assertSmoke(hits[0]?.body?.model === 'gpt-5.4-mini', 'proxied LLM mock used unexpected model', {
    expected: 'gpt-5.4-mini',
    actual: hits[0]?.body?.model,
  });

  await context.close();
}

const browser = await browserType.launch({ headless: true });
try {
  console.log('Internal smoke: baseline persistence');
  await runBaselinePersistence(browser);
  console.log('Internal smoke: local overrides');
  await runLocalAgentOverrides(browser);
  console.log('Internal smoke: missing relay');
  await runProxyMissing(browser);
  console.log('Internal smoke: direct fixtures');
  await runDirectLlm(browser);
  console.log('Internal smoke: relay fixtures');
  await runProxyLlm(browser);
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
if (failures.length > 0) {
  console.error('Smoke assertions failed:');
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
