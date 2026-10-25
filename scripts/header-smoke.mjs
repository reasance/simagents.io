#!/usr/bin/env node
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const assert = (value, message) => { if (!value) throw new Error(message); };
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const browser = await playwright[browserName].launch({ headless: true });
await mkdir('.tmp/header', { recursive: true });
try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 768 ? 1024 : 900 } });
    let foreign = 0;
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
      foreign++; return route.abort();
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    const header = page.locator('.app-header:visible');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflows at ${width}`);
    const start = header.getByRole('button', { name: 'Start', exact: true });
    const bounds = await start.boundingBox();
    assert(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width, 'Start is clipped or too small');
    await header.locator('summary').focus(); await page.keyboard.press('Enter');
    await header.getByRole('button', { name: 'Advanced settings', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert(await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY'), 'Menu focus not restored');
    await header.locator('summary').click();
    await header.getByLabel('Language', { exact: true }).selectOption('it');
    assert(await page.locator('html').getAttribute('lang') === 'it', 'document.lang did not change');
    await header.getByRole('button', { name: 'Impostazioni avanzate', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `.tmp/header/${browserName}-${width}-it.png` });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.app-header:visible').getByRole('button', { name: 'Avvia', exact: true }).waitFor();
    assert(foreign === 0, 'Changing interface language made a provider request');
    await context.close();
    console.log(`PASS ${browserName} ${width}px: essential control bounds, keyboard menu, persistent language and no provider traffic.`);
  }
} finally { await browser.close(); }
