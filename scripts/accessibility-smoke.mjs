#!/usr/bin/env node
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { openSimulationTool, productText, setSmokeLanguage, smokeLanguage } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const browser = await playwright[browserName].launch({ headless: true });
await mkdir('.tmp/accessibility', { recursive: true });
let failed = false;
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 900 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await setSmokeLanguage(page);
    await page.goto(base, { waitUntil: 'networkidle' });
    for (const surface of ['ready', 'setup', 'configuration']) {
      if (surface === 'setup') await page.getByRole('button', { name: productText('Set up a simulation'), exact: true }).click();
      if (surface === 'configuration') { await page.keyboard.press('Escape'); await openSimulationTool(page, 'Advanced settings'); }
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      await writeFile(`.tmp/accessibility/${browserName}-${width}-${smokeLanguage}-${surface}.json`, JSON.stringify(result, null, 2));
      if (result.violations.length) {
        failed = true;
        console.error(JSON.stringify({ browserName, width, surface, violations: result.violations.map(issue => ({ id: issue.id, impact: issue.impact, targets: issue.nodes.map(node => node.target), summary: issue.nodes.map(node => node.failureSummary) })) }, null, 2));
      } else console.log(`PASS ${browserName} ${width}px ${surface}: automated WCAG A/AA checks.`);
    }
    await context.close();
  }
} finally { await browser.close(); }
if (failed) process.exitCode = 1;
