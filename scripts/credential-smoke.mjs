#!/usr/bin/env node
import { openSetup, productText, saveProviderKey, setSmokeLanguage, setupDialog, setupStep } from './browser-helpers.mjs';
// Real browser crypto, synthetic credentials only, no external network.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = process.env.PLAYWRIGHT_MODULE_DIR
  ? createRequire(`${process.env.PLAYWRIGHT_MODULE_DIR}/package.json`)('playwright') : require('playwright');
const baseUrl = process.env.SIMAGENTS_SMOKE_URL ?? 'http://127.0.0.1:5184/';
const browser = await playwright[process.env.SIMAGENTS_SMOKE_BROWSER ?? 'chromium'].launch({ headless: true });
const context = await browser.newContext();
await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
const page = await context.newPage();
await setSmokeLanguage(page);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const passphrase = 'smoke-only-vault-passphrase';
const secret = 'fixture-api-secret-not-real';
async function config() {
  if (!(await setupDialog(page).isVisible())) await openSetup(page);
  await setupStep(page, 'Provider keys');
  const vault = setupDialog(page).locator('details').filter({ hasText: productText('Save keys on this device (encrypted)') });
  if (!(await vault.evaluate(el => el.open))) await vault.locator('summary').click();
}
const claudeStatus = () => setupDialog(page).getByText(new RegExp(productText('Key in this tab ({masked})', { masked: '••••' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('••••', '••••.{4}')));
const noKey = async () => (await claudeStatus().count()) === 0;
async function fillPhrase(value = passphrase) { await page.getByLabel(productText('Vault passphrase'), { exact: true }).fill(value); }
async function click(name) { await page.getByRole('button', { name: productText(name), exact: true }).click(); }
async function stored() { return page.evaluate(() => JSON.stringify(localStorage)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
try {
  await page.goto(baseUrl);
  await config();
  await saveProviderKey(page, 'Claude (Anthropic)', secret);
  assert(!(await stored()).includes(secret), 'plaintext credential persisted');
  await fillPhrase();
  await click('Save session keys encrypted');
  await page.waitForFunction(() => !!localStorage.getItem('simagents_credential_vault_v1'));
  assert(!(await stored()).includes(secret) && !(await stored()).includes(passphrase), 'secret or passphrase persisted');
  await page.reload();
  await config();
  await page.getByText(productText('Encrypted vault locked.'), { exact: true }).waitFor();
  assert(await noKey(), 'reload restored credentials without unlock');
  await fillPhrase('wrong-passphrase-for-test');
  await click('Unlock vault');
  await page.getByText(productText('The vault could not be unlocked. Check the passphrase; the existing keys were preserved.'), { exact: true }).waitFor();
  await fillPhrase();
  await click('Unlock vault');
  await page.getByText(productText('Encrypted vault unlocked for this tab.'), { exact: true }).waitFor();
  await claudeStatus().waitFor();
  await click('Lock and clear session keys');
  await page.getByText(productText('Encrypted vault locked.'), { exact: true }).waitFor();
  assert(await noKey(), 'lock retained session key');
  await click('Remove saved vault');
  await page.waitForFunction(() => !localStorage.getItem('simagents_credential_vault_v1'));
  await page.evaluate((secret) => localStorage.setItem('simagents_api_keys', JSON.stringify({ claude: secret })), secret);
  await page.reload();
  await config();
  assert(await noKey(), 'legacy key automatically loaded');
  await fillPhrase();
  await click('Encrypt and migrate old keys');
  await page.waitForFunction(() => !localStorage.getItem('simagents_api_keys') && !!localStorage.getItem('simagents_credential_vault_v1'));
  assert(!(await stored()).includes(secret), 'migration left plaintext secret');
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  console.log('PASS: memory-only keys, encrypted save/reload/unlock/lock, wrong-passphrase rejection, explicit legacy migration; external traffic blocked.');
} finally { await context.close(); await browser.close(); }
