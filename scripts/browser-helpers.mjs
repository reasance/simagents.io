import { en, it } from '../apps/web/src/i18n/catalog.ts';
export const smokeLanguage = process.env.SIMAGENTS_SMOKE_LANGUAGE === 'it' ? 'it' : 'en';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Test labels follow the real product catalog; synthetic data/model responses remain original. */
export function productText(key, parameters = {}) {
  const catalog = smokeLanguage === 'it' ? it : en;
  let value = catalog[key];
  if (value === undefined) {
    for (const candidate of Object.keys(en)) {
      if (!candidate.includes('{')) continue;
      const names = [...candidate.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
      const pattern = escape(en[candidate]).replace(/\\\{(\w+)\\\}/g, '(.+?)');
      const match = key.match(new RegExp(`^${pattern}$`));
      if (match) { value = catalog[candidate]; parameters = Object.fromEntries(names.map((name, index) => [name, match[index + 1]])); break; }
    }
  }
  return (value ?? key).replace(/\{(\w+)\}/g, (_match, name) => {
    const parameter = String(parameters[name] ?? `{${name}}`);
    return ['scenario', 'section', 'type'].includes(name) && Object.hasOwn(en, parameter) ? productText(parameter) : parameter;
  });
}
export async function setSmokeLanguage(page) {
  if (smokeLanguage !== 'en') await page.addInitScript(locale => localStorage.setItem('simagents_locale_v1', locale), smokeLanguage);
}
/** Open a public secondary tool through the visible header's keyboard-accessible drawer. */
export async function activateControl(locator, keyboardOnly = false) {
  if (keyboardOnly) {
    await locator.waitFor({ state: 'visible' });
    const deadline = Date.now() + 20000;
    while (!(await locator.isEnabled())) {
      if (Date.now() >= deadline) throw new Error('Keyboard control remained disabled');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await locator.press('Enter');
  } else await locator.click();
}
export async function openSimulationTool(page, name, keyboardOnly = false) {
  // Sections are visible tabs on wide screens; everything else lives in the header menu.
  const tab = page.locator('.app-header:visible .nav-tabs').getByRole('button', { name: productText(name), exact: true });
  if (await tab.count() && await tab.isVisible()) { await activateControl(tab, keyboardOnly); return; }
  const drawer = page.locator('.simulation-tools:visible');
  const button = drawer.getByRole('button', { name: productText(name), exact: true });
  if (!(await button.isVisible())) await activateControl(drawer.locator('summary'), keyboardOnly);
  await activateControl(button, keyboardOnly);
}

const SETUP_STEPS = ['Provider keys', 'Participants', 'Limits and start'];
export function setupDialog(page) {
  return page.getByRole('dialog', { name: productText('Set up your simulation') });
}
/** Open the guided setup from the menu; it lands on the first step that still needs attention. */
export async function openSetup(page, keyboardOnly = false) {
  await openSimulationTool(page, 'Keys and participants', keyboardOnly);
  await setupDialog(page).waitFor();
}
/** Move to a setup step: the progress rail on wide screens, Back and Continue on narrow ones. */
export async function setupStep(page, label) {
  const dialog = setupDialog(page);
  const target = SETUP_STEPS.indexOf(label);
  const rail = dialog.getByRole('navigation', { name: productText('Setup progress') });
  if (await rail.isVisible()) {
    await rail.getByRole('button', { name: new RegExp(productText(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  } else {
    for (let n = 0; n < SETUP_STEPS.length; n++) {
      // textContent, not innerText: the heading is uppercased by CSS only.
      const heading = (await dialog.locator('h2').first().textContent()).trim();
      const index = SETUP_STEPS.findIndex(step => productText(step) === heading);
      if (index === target) break;
      await dialog.getByRole('button', { name: productText(index < target ? 'Continue' : 'Back'), exact: true }).click();
    }
  }
  await dialog.locator('h2', { hasText: productText(label) }).first().waitFor();
}
/** Paste a provider key in the first setup step and save it with Enter. */
export async function saveProviderKey(page, provider, key) {
  const input = setupDialog(page).getByLabel(productText('API key for {provider}', { provider }), { exact: true });
  await input.fill(key);
  await input.press('Enter');
  await setupDialog(page).getByText(productText('Key in this tab ({masked})', { masked: `••••${key.slice(-4)}` }), { exact: true }).waitFor();
}
/** Save a key for the default Claude participant and verify it with one request. */
export async function verifyDefaultClaude(page, key, keyboardOnly = false) {
  await openSetup(page, keyboardOnly);
  await setupStep(page, 'Provider keys');
  await saveProviderKey(page, 'Claude (Anthropic)', key);
  await setupStep(page, 'Participants');
  await activateControl(setupDialog(page).getByRole('button', { name: productText('Verify model for Agent 1 (1 request)'), exact: true }), keyboardOnly);
  await setupDialog(page).getByText(productText('Verified in this tab'), { exact: true }).waitFor();
}
/** From the setup's last step: optional request limit and capture, then start or resume. */
export async function startFromSetup(page, { requests, capture, choice = 'new' } = {}) {
  const dialog = setupDialog(page);
  if (!(await dialog.isVisible())) { await page.locator('.app-header:visible').getByRole('button', { name: productText('Start'), exact: true }).click(); await dialog.waitFor(); }
  await setupStep(page, 'Limits and start');
  if (requests !== undefined) await dialog.getByLabel(productText('Requests'), { exact: true }).fill(String(requests));
  if (capture) await dialog.getByRole('checkbox', { name: productText('Capture actual requests for this session') }).check();
  const resumeCard = dialog.getByRole('button', { name: new RegExp(productText(choice === 'resume' ? 'Resume saved world' : 'Start new world')) });
  if (await resumeCard.count()) await resumeCard.click();
  await dialog.getByRole('button', { name: productText(choice === 'resume' ? 'Resume world' : 'Start world'), exact: true }).click();
}
