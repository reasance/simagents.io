// A dry run starts from the first screen without keys, runs a talking world and sends nothing off the origin.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { openSimulationTool, productText, setSmokeLanguage, setupDialog, setupStep, smokeLanguage } from './browser-helpers.mjs';
const require = createRequire(import.meta.url);
const pw = process.env.PLAYWRIGHT_MODULE_DIR ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const base = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5185/';
const browserName = process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium';
const width = Number(process.env.SIMAGENTS_SMOKE_WIDTH ?? 1440);
const directory = `${process.env.SIMAGENTS_EVIDENCE_ROOT ?? '.tmp'}/dry-run`;
await mkdir(directory, { recursive: true });
const browser = await pw[browserName].launch({ headless: true });
const context = await browser.newContext({ viewport: { width, height: 900 } });
const offOrigin = [], errors = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
  offOrigin.push(route.request().url());
  return route.abort();
});
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', error => errors.push(error.message));
await setSmokeLanguage(page);
const name = `${browserName}-${smokeLanguage}-${width}`;
let failed = true;
// Bottom navigation on narrow screens; its buttons carry counts after the label.
const view = label => page.locator('.mobile-nav').getByRole('button', { name: new RegExp(`^${productText(label)}`) }).click();
try {
  await page.goto(base);
  await page.getByRole('button', { name: productText('Try a dry run'), exact: true }).click();
  const dialog = setupDialog(page);
  await dialog.locator('h2', { hasText: productText('Participants') }).first().waitFor();
  assert(await dialog.locator('.participant-card').count() === 4, 'A first dry run should start with four participants.');
  assert(await dialog.getByRole('button', { name: /Verify/ }).count() === 0, 'A dry run must not offer verification requests.');
  await setupStep(page, 'Limits and start');
  await dialog.getByRole('checkbox', { name: productText('Capture actual requests for this session') }).check();
  await dialog.getByRole('button', { name: productText('Start dry run'), exact: true }).click();
  await dialog.waitFor({ state: 'detached' });

  const header = page.locator('.app-header:visible');
  await header.locator('.badge', { hasText: productText('Dry run') }).first().waitFor();
  if (width < 1024) await view('Feed');
  await page.locator('.feed-speech').first().waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${directory}/${name}-world.png` });
  if (width < 1024) await view('Participants');
  await page.locator('.participant-row').first().click();
  if (width < 1024) await view('Details');
  await page.locator('p:visible', { hasText: productText('Scripted replies in this tab (dry run); no model was called. Tokens are estimated from the prompt length.') }).first().waitFor({ timeout: 30000 });

  await openSimulationTool(page, 'Prompts');
  const agentSelect = page.getByLabel(productText('Select Agent'), { exact: true });
  await agentSelect.selectOption({ index: 1 });
  // Narrow layouts open the latest request directly; wide ones list it in the timeline first.
  const body = page.getByText(/"dryRun":\s*true/).locator('visible=true').first();
  if (!(await body.waitFor({ timeout: 5000 }).then(() => true, () => false))) {
    await page.getByRole('button', { name: new RegExp(productText('Captured request')) }).locator('visible=true').first().click({ timeout: 30000 });
  }
  await body.waitFor({ timeout: 30000 }).catch(async () => {
    await page.screenshot({ path: `${directory}/${name}-prompts.png` });
    throw new Error('Captured dry run prompts are not shown on the Prompts page.');
  });
  assert(offOrigin.length === 0, `A dry run reached outside the origin: ${offOrigin.join(', ')}`);
  assert(errors.length === 0, `Page errors: ${errors.join(' | ')}`);
  failed = false;
  console.log(`Dry run smoke passed (${name}).`);
} finally {
  if (failed) await page.screenshot({ path: `${directory}/${name}-failure.png` }).catch(() => undefined);
  await browser.close();
}
