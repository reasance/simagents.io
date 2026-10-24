#!/usr/bin/env node
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { openSimulationTool, productText, setSmokeLanguage, smokeLanguage } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const browser = await playwright[browserName].launch({ headless: true });
const assert = (value, message) => { if (!value) throw new Error(message); };
await mkdir('.tmp/keyboard', { recursive: true });
try {
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    let calls = 0;
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await context.route('https://api.anthropic.com/v1/messages', async route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
      calls++;
      await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ model: 'synthetic-reported-model', content: [{ type: 'text', text: '{"action":"speak","params":{"message":"keyboard fixture"}}' }] }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await setSmokeLanguage(page);
    try {
      await page.goto(base);
      await openSimulationTool(page, 'Configuration');
      await page.getByLabel(productText('Claude (Anthropic) API key'), { exact: true }).fill('synthetic-keyboard-key');
      await page.getByRole('button', { name: productText('Use Keys for This Session'), exact: true }).click();
      await page.getByText(productText('User Key'), { exact: true }).waitFor();
      await page.getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }).click();
      await page.getByText(productText('Verified in this tab'), { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: productText('Start'), exact: true }).first().click();
      await page.getByLabel(productText('Requests'), { exact: true }).fill('1');
      await page.getByRole('button', { name: productText('Start'), exact: true }).last().click();
      await page.getByRole('alert').filter({ hasText: productText('The request budget is exhausted. Start a new session explicitly to make more requests.') }).waitFor();
      assert(calls === 2, `Expected one explicit probe and one decision, saw ${calls}`);
      if (width >= 1024) {
        const select = page.getByRole('combobox', { name: productText('Inspect agent or resource') });
        const agent = await select.locator('option[value^="agent:"]').first().getAttribute('value');
        const resource = await select.locator('option[value^="resource:"]').first().getAttribute('value');
        assert(agent && resource, 'Fixture has no selectable entities');
        await select.focus(); await select.selectOption(agent);
        await page.getByText('synthetic-reported-model', { exact: true }).filter({ visible: true }).first().waitFor();
        await select.selectOption(resource);
        await page.getByText(productText('Quantity'), { exact: true }).filter({ visible: true }).first().waitFor();
        await select.selectOption('');
        const collapse = page.getByTitle(productText('Collapse sidebar'));
        await collapse.focus(); await page.keyboard.press('Enter');
        assert(await page.locator('#desktop-observation-panel').getAttribute('inert') !== null, 'Collapsed sidebar remains focusable');
      } else {
        const nav = page.locator('nav').filter({ has: page.getByRole('button', { name: productText('Map'), exact: true }) });
        await nav.getByRole('button', { name: new RegExp(productText('Agents')) }).focus(); await page.keyboard.press('Enter');
        const agentButton = page.getByRole('button').filter({ hasText: 'Agent 1' }).first();
        await agentButton.focus(); await page.keyboard.press('Enter');
        await page.getByText('synthetic-reported-model', { exact: true }).filter({ visible: true }).first().waitFor();
        await nav.getByRole('button', { name: productText('Resources'), exact: true }).focus(); await page.keyboard.press('Enter');
        await page.locator('.entity-row').first().focus(); await page.keyboard.press('Enter');
        await page.getByText(productText('Quantity'), { exact: true }).filter({ visible: true }).first().waitFor();
        await nav.getByRole('button', { name: productText('Map'), exact: true }).focus(); await page.keyboard.press('Enter');
      }
      for (const [title, minimum, maximum, reset] of [['2D Grid View', 0.5, 3, 1], ['Isometric View', 0.3, 2.5, 0.8]]) {
        await page.locator('.simulation-tools:visible > summary').focus(); await page.keyboard.press('Enter');
        await page.getByTitle(productText(title)).filter({ visible: true }).first().focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
        const canvas = page.getByRole('img', { name: productText('Interactive world map') }).first();
        await canvas.focus(); const before = await canvas.getAttribute('data-camera-x');
        await page.keyboard.press('ArrowRight'); assert(await canvas.getAttribute('data-camera-x') !== before, 'Keyboard pan did not move the view');
        for (let n = 0; n < 20; n++) await page.keyboard.press('+');
        assert(Number(await canvas.getAttribute('data-zoom')) === maximum, 'Keyboard zoom exceeded upper bound');
        for (let n = 0; n < 25; n++) await page.keyboard.press('-');
        assert(Number(await canvas.getAttribute('data-zoom')) === minimum, 'Keyboard zoom exceeded lower bound');
        await page.keyboard.press('r'); assert(Number(await canvas.getAttribute('data-zoom')) === reset, 'Keyboard reset failed');
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflow');
      assert(errors.length === 0, `Unhandled browser error: ${errors.join(', ')}`);
      assert(calls === 2, 'Entity or camera inspection issued inference');
      await page.screenshot({ path: `.tmp/keyboard/${browserName}-${width}-${smokeLanguage}.png` });
      console.log(`PASS ${browserName} ${width}px ${smokeLanguage}: agent/resource selection, both canvas keyboard bounds, no overflow.`);
    } catch (error) {
      await page.screenshot({ path: `.tmp/keyboard/${browserName}-${width}-${smokeLanguage}-failure.png` });
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
