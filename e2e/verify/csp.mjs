import { chromium } from 'playwright';

const BASE = process.env.E2E_PROD_URL ?? 'http://localhost:8080';
const log = (...a) => console.log(...a);
const cspViolations = [];
const consoleErrors = [];
const failedRequests = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('console', m => {
  const text = m.text();
  if (/Content Security Policy|Refused to/i.test(text)) cspViolations.push(text);
  else if (m.type() === 'error') consoleErrors.push(text);
});
page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e)));
page.on('requestfailed', r => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

const user = {
  firstName: 'Csp',
  lastName: 'Check',
  email: `csp-${Date.now()}@example.test`,
  password: 'Passw0rd1',
};
const reg = await page.request.post(`${BASE}/api/v1/auth/register`, { data: user });
log('register through prod stack:', reg.status());

await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
log('login page title:', await page.title());

const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.waitForTimeout(3000);
log('url after login:', page.url());
log('dashboard visible:', (await page.locator('body').innerText()).includes('My Boards'));

// The font is loaded from Google Fonts through an @import in the stylesheet,
// which is exactly the kind of thing a careless CSP blocks.
const fontApplied = await page.evaluate(() => {
  const probe = document.querySelector('h1, h2, p');
  return probe ? getComputedStyle(probe).fontFamily : 'none';
});
log('computed font family:', fontApplied);

await page.screenshot({ path: 'prod-csp.png', fullPage: true });

await browser.close();

const section = (t, arr) => {
  log(`\n=== ${t} (${arr.length}) ===`);
  [...new Set(arr)].slice(0, 15).forEach(x => log(' -', x));
};
section('CSP VIOLATIONS', cspViolations);
section('CONSOLE ERRORS', consoleErrors);
section('FAILED REQUESTS', failedRequests);
process.exit(cspViolations.length ? 1 : 0);
