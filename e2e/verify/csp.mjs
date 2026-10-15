import { chromium } from 'playwright';

const BASE = process.env.E2E_PROD_URL ?? 'http://localhost:8080';
const log = (...a) => console.log(...a);
const cspViolations = [];
const consoleErrors = [];
const failedRequests = [];
const fontResponses = [];
const foreignRequests = [];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('console', m => {
  const text = m.text();
  if (/Content Security Policy|Refused to/i.test(text)) cspViolations.push(text);
  else if (m.type() === 'error') consoleErrors.push(text);
});
page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e)));
page.on('response', r => {
  if (r.request().resourceType() === 'font') fontResponses.push({ url: r.url(), status: r.status() });
});
page.on('request', r => {
  if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreignRequests.push(r.url());
});
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
// The dashboard is what the sign in produces, and the network going quiet is
// what says every request the page makes has been made and answered, so the
// assertions below count them all. A dashboard that never appears is reported
// by the line below, not waited on forever.
await page.getByText('Your boards').waitFor({ timeout: 15000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
log('url after login:', page.url());
log('dashboard visible:', (await page.locator('body').innerText()).includes('Your boards'));

// The typefaces are bundled into /assets/ and served from the application
// origin, so the policy names no font host. This reads the computed families,
// waits for the faces to actually load, and then asserts where the files came
// from. A policy that blocked them would show up here as a fallback family and
// an empty font response list rather than as a thrown error.
const fontReport = await page.evaluate(async () => {
  await document.fonts.ready;
  const heading = document.querySelector('h1, h2, h3');
  const body = document.querySelector('p, label, button');
  await document.fonts.load('700 20px "Bricolage Grotesque Variable"');
  await document.fonts.load('400 14px "Instrument Sans Variable"');
  return {
    heading: heading ? getComputedStyle(heading).fontFamily : 'none',
    body: body ? getComputedStyle(body).fontFamily : 'none',
    loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replaceAll('"', '')),
  };
});
log('computed heading family:', fontReport.heading);
log('computed body family:', fontReport.body);
log('faces loaded:', [...new Set(fontReport.loaded)].join(', '));

const headerResponse = await page.request.get(BASE + '/');
const policy = headerResponse.headers()['content-security-policy'] ?? '';
log('policy:', policy);

const fontProblems = [];
if (/googleapis|gstatic/.test(policy)) fontProblems.push('the policy still names a third-party font host');
if (!fontResponses.length) fontProblems.push('no font file was requested');
for (const f of fontResponses) {
  if (!f.url.startsWith(BASE)) fontProblems.push(`font served from another origin: ${f.url}`);
  if (f.status !== 200) fontProblems.push(`font answered ${f.status}: ${f.url}`);
}
for (const family of ['Bricolage Grotesque Variable', 'Instrument Sans Variable']) {
  if (!fontReport.loaded.includes(family)) fontProblems.push(`${family} did not load`);
}
if (!fontReport.heading.includes('Bricolage')) fontProblems.push('a heading did not resolve to Bricolage Grotesque');
if (!fontReport.body.includes('Instrument Sans')) fontProblems.push('body text did not resolve to Instrument Sans');
log('font files from the app origin:', fontResponses.filter(f => f.url.startsWith(BASE)).length);

// The profile is a page of its own with an upload on it: the picture is sent to
// the API, stored, and drawn from the address the API answers with, which the
// policy has to allow and nginx has to serve. A policy that blocked the image,
// or a proxy that did not route /uploads, would leave the initials in place.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const profileProblems = [];
await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 }).catch(() => profileProblems.push('the profile did not render'));
await page.getByLabel('Change avatar').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PIXEL_PNG });
await page.locator('main header img').waitFor({ timeout: 15000 }).catch(() => profileProblems.push('the uploaded avatar was never drawn'));
await page.waitForLoadState('networkidle').catch(() => {});
// The picture loads lazily and after the network has gone quiet it may still
// be arriving, so what is awaited is the image itself.
await page
  .waitForFunction(
    () => {
      const image = document.querySelector('main header img');
      return Boolean(image?.complete && image.naturalWidth > 0);
    },
    null,
    { timeout: 15000 }
  )
  .catch(() => {});
const avatarImage = await page.evaluate(() => {
  const image = document.querySelector('main header img');
  return image ? { src: image.src, complete: image.complete, width: image.naturalWidth } : null;
});
const avatarDrawn = Boolean(avatarImage?.complete && avatarImage.width > 0);
log('profile avatar uploaded and drawn:', avatarDrawn, JSON.stringify(avatarImage));
if (!avatarDrawn) profileProblems.push('the uploaded avatar did not load');

await page.screenshot({ path: 'prod-csp.png', fullPage: true });

await browser.close();

const section = (t, arr) => {
  log(`\n=== ${t} (${arr.length}) ===`);
  [...new Set(arr)].slice(0, 15).forEach(x => log(' -', x));
};
section('CSP VIOLATIONS', cspViolations);
section('CONSOLE ERRORS', consoleErrors);
section('FAILED REQUESTS', failedRequests);
section('REQUESTS TO OTHER ORIGINS', foreignRequests);
section('FONT PROBLEMS', fontProblems);
section('PROFILE PROBLEMS', profileProblems);
process.exit(cspViolations.length || fontProblems.length || foreignRequests.length || profileProblems.length ? 1 : 0);
