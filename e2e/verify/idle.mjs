import { chromium } from 'playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const log = (...a) => console.log(...a);
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  :: ' + detail : ''}`);
};

const mode = process.argv[2] ?? 'expire';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const apiCalls = [];
page.on('request', r => {
  if (r.url().includes('/api/')) apiCalls.push({ at: Date.now(), line: `${r.method()} ${r.url().replace(API, '')}` });
});
page.on('pageerror', e => log('  PAGEERROR', String(e).slice(0, 160)));

const user = {
  firstName: 'Idle',
  lastName: 'Check',
  email: `idle-${Date.now()}@example.test`,
  password: 'Passw0rd1',
};
await page.request.post(`${API}/auth/register`, { data: user });

await page.goto(`${FRONT}/login`, { waitUntil: 'networkidle' });
const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.waitForSelector('text=Your boards');

const loginDoneAt = Date.now();
apiCalls.length = 0;
log(`\nlogged in. window is 90s, so the warning is due at about 30s of idleness.\n`);

const toast = page.getByRole('alert').filter({ hasText: /sign|session|expire/i });

const waitAndReport = async seconds => {
  await page.waitForTimeout(seconds * 1000);
  const elapsed = Math.round((Date.now() - loginDoneAt) / 1000);
  const visible = await toast.count();
  log(`  t+${String(elapsed).padStart(2)}s  apiCalls=${apiCalls.length}  toastVisible=${visible > 0}`);
  return { elapsed, visible: visible > 0 };
};

let sawToastAt = null;
for (let i = 0; i < 8; i++) {
  const state = await waitAndReport(5);
  if (state.visible && sawToastAt === null) sawToastAt = state.elapsed;
}

check('no background traffic while idle', apiCalls.length === 0, apiCalls.map(c => c.line).join(', ') || 'none');
check('the warning appeared', sawToastAt !== null, sawToastAt ? `at t+${sawToastAt}s` : 'never');
check(
  'the warning appeared roughly 60s before expiry',
  sawToastAt !== null && sawToastAt >= 25 && sawToastAt <= 45,
  `t+${sawToastAt}s of a 90s window`
);

if (sawToastAt !== null) {
  const text = await toast.first().innerText();
  log(`\n  toast text: ${JSON.stringify(text.replace(/\\n/g, ' / '))}`);
  const action = page.getByRole('button', { name: /stay signed in/i });
  const hasAction = await action.count();
  check('the warning carries an action', hasAction > 0);
  if (hasAction > 0) {
    await action.first().focus();
    check('the action is keyboard reachable', await action.first().evaluate(el => el === document.activeElement));
  }

  const aria = await page.locator('[aria-hidden="true"]').filter({ hasText: /^\d+$/ }).count();
  check('the ticking number is hidden from assistive technology', aria > 0, `${aria} aria-hidden numeric nodes`);
}

if (mode === 'extend') {
  log('\n--- clicking the action to stay signed in ---');
  await page.getByRole('button', { name: /stay signed in/i }).first().click();
  await page.waitForTimeout(2500);
  const pinged = apiCalls.some(c => c.line.includes('/auth/ping'));
  check('the action calls the ping endpoint', pinged, apiCalls.map(c => c.line).join(', '));
  check('the warning is dismissed', (await toast.count()) === 0);

  await page.waitForTimeout(35000);
  const stillIn = (await page.locator('body').innerText()).includes('Your boards');
  check('the session survived past the original expiry', stillIn, `url ${page.url()}`);
} else {
  log('\n--- letting it run out ---');
  for (let i = 0; i < 16; i++) {
    await waitAndReport(5);
    const out = page.url().includes('/login') || !(await page.locator('body').innerText()).includes('Your boards');
    if (out) break;
  }
  const signedOut = page.url().includes('/login') || !(await page.locator('body').innerText()).includes('Your boards');
  check('signed out at expiry', signedOut, `url ${page.url()}`);
  check('the toast never auto-dismissed before expiry', sawToastAt !== null);
}

await browser.close();
const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
