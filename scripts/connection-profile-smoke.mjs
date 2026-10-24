#!/usr/bin/env node
import { openSimulationTool, productText, setSmokeLanguage } from './browser-helpers.mjs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const baseUrl = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const browser = await playwright[process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium'].launch({ headless: true });
const specs = [
  ['codex', 'openai-responses', '/v1/responses'], ['codex', 'chat-completions', '/v1/chat/completions'],
  ['claude', 'anthropic-messages', '/v1/messages'], ['gemini', 'gemini-generate-content', '/v1beta/models'],
  ['openrouter', 'chat-completions', '/api/v1/chat/completions'],
];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  for (const [provider, protocol, path] of specs) {
    const context = await browser.newContext({ acceptDownloads: true });
    let calls = 0;
    await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    await context.route('https://fixture.example/**', async (route) => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, headers, json: protocol === 'gemini-generate-content' ? { models: [{ name: 'models/fixture-model' }] } : { data: [{ id: 'fixture-model' }] } });
      calls++;
      const body = route.request().postDataJSON();
      if (provider === 'openrouter') assert(body.provider?.allow_fallbacks === false && body.models === undefined, 'OpenRouter fallback routing was enabled');
      if (protocol !== 'gemini-generate-content') assert(body.model === 'fixture-model', 'Requested model changed');
      else assert(route.request().url().endsWith('/fixture-model:generateContent'), 'Wrong Gemini model URL');
      const text = JSON.stringify({ action: 'speak', paramsJson: JSON.stringify({ message: 'fixture' }), reasoning: 'fixture' });
      const json = protocol === 'openai-responses' ? { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }
        : protocol === 'chat-completions' ? { choices: [{ finish_reason: 'stop', message: { content: text } }] }
        : protocol === 'anthropic-messages' ? { content: [{ type: 'text', text }], stop_reason: 'end_turn' }
        : { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'ignore me' }, { text }] } }] };
      await route.fulfill({ status: 200, headers, json });
    });
    const page = await context.newPage();
await setSmokeLanguage(page);
    page.setDefaultTimeout(12000);
    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await openSimulationTool(page, 'Configuration');
      await page.getByRole('button', { name: productText('Connections'), exact: true }).click();
      await page.getByRole('button', { name: productText('Add connection'), exact: true }).click();
      await page.getByLabel(productText('Connection provider'), { exact: true }).selectOption(provider);
      await page.getByLabel(productText('Connection name'), { exact: true }).fill(`Fixture ${protocol}`);
      await page.getByLabel(productText('Connection protocol'), { exact: true }).selectOption(protocol);
      await page.getByLabel(productText('Connection endpoint'), { exact: true }).fill(`https://fixture.example${path}`);
      await page.getByLabel(productText('Connection transport'), { exact: true }).selectOption('direct');
      await page.getByLabel(productText('Connection API key'), { exact: true }).fill('synthetic-profile-secret');
      await page.getByRole('button', { name: productText('Save connection'), exact: true }).click();
      await page.getByLabel(productText('Connection for Agent 1'), { exact: true }).selectOption({ label: `Fixture ${protocol}` });
      await page.getByLabel(productText('Model for Agent 1'), { exact: true }).selectOption('__custom__');
      await page.getByLabel(productText('Custom model ID for Agent 1'), { exact: true }).fill('fixture-model');
      await page.getByText(productText('Model capabilities (check provider documentation)'), { exact: true }).click();
      await page.getByLabel(productText('Output format for Agent 1'), { exact: true }).selectOption('json-schema');
      assert(calls === 0, 'Configuration triggered inference');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: productText('Start') }).first().click();
      assert(await page.getByRole('button', { name: productText('Start') }).last().isDisabled(), 'Unverified profile could start');
      await page.getByRole('button', { name: productText('Cancel'), exact: true }).click();
      await openSimulationTool(page, 'Configuration');
      await page.getByRole('button', { name: productText('Load model IDs (first page)'), exact: true }).click();
      await page.getByRole('option', { name: productText('fixture-model'), exact: true }).first().waitFor({ state: 'attached' });
      assert(calls === 0, 'Model listing triggered inference');
      await page.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }).click();
      await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
      assert(calls === 1, 'Verification did not use exactly one request');
      await page.getByText(productText('Model capabilities (check provider documentation)'), { exact: true }).click();
      await page.getByLabel(productText('Accepts temperature'), { exact: true }).check();
      await page.getByText(productText('Compatible protocol, model not verified'), { exact: true }).waitFor();
      await page.getByLabel(productText('Accepts temperature'), { exact: true }).uncheck();
      await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: productText('Start') }).first().click();
      await page.getByLabel(productText('Requests'), { exact: true }).fill('1');
      await page.getByRole('button', { name: productText('Start') }).last().click();
      await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
      assert(calls === 2, `Expected probe + one simulation request, saw ${calls}`);
      const [download] = await Promise.all([page.waitForEvent('download'), openSimulationTool(page, 'Export current world')]);
      const raw = await readFile(await download.path(), 'utf8');
      const exported = JSON.parse(raw);
      assert(!raw.includes('synthetic-profile-secret'), 'Export contains credential');
      const selected = exported.snapshot.configuration.connections.find((p) => p.id === exported.snapshot.store.agents[0].connectionId);
      assert(selected?.protocol === protocol, 'Stable connection metadata missing from snapshot');
      console.log(`PASS: ${protocol} profile, explicit verification/listing, structured decision, budget and secret-free export`);
    } catch (error) { console.error((await page.locator('body').innerText()).slice(-5000)); throw error; }
    finally { await context.close(); }
  }
} finally { await browser.close(); }
