import { chromium } from 'playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const log = (...a) => console.log(...a);
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  :: ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const user = {
  firstName: 'Draft',
  lastName: 'Check',
  email: `draft-${Date.now()}@example.test`,
  password: 'Passw0rd1',
};
await page.request.post(`${API}/auth/register`, { data: user });

await page.goto(`${FRONT}/login`, { waitUntil: 'networkidle' });
const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.waitForSelector('text=Your boards');

const boardName = `Draft Board ${Date.now()}`;
await page.getByRole('button', { name: /create board/i }).first().click();
await page.waitForTimeout(900);
await page.getByLabel(/board name/i).fill(boardName);
await page.getByRole('button', { name: /^create board$/i }).last().click();
await page.waitForTimeout(2500);
await page.getByText(boardName).first().click();
await page.waitForTimeout(2500);

const SENTENCE = 'A sentence the user was halfway through writing';

await page.getByRole('button', { name: /add task/i }).first().click();
await page.waitForTimeout(1200);
await page.getByPlaceholder('Enter task title').fill('Half written task');
await page.getByPlaceholder('Enter task description').fill(SENTENCE);
await page.waitForTimeout(1200);

// Losing the page entirely, the way a session timeout or a crashed tab would.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /add task/i }).first().click();
await page.waitForTimeout(1500);

const title = await page.getByPlaceholder('Enter task title').inputValue();
const description = await page.getByPlaceholder('Enter task description').inputValue();
log(`  restored title: ${JSON.stringify(title)}`);
log(`  restored description: ${JSON.stringify(description)}`);

check('the title survived losing the page', title === 'Half written task', title);
check('the description survived losing the page', description === SENTENCE, description);

// Finish the task properly, then confirm the draft is not left behind.
await page.locator('label', { has: page.getByRole('radio', { name: 'Coral' }) }).click();
await page.getByPlaceholder('Search team members...').fill('Draft');
await page.waitForTimeout(1600);
await page.getByText(user.email).last().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /save changes/i }).click();
await page.waitForTimeout(2500);

await page.getByRole('button', { name: /add task/i }).first().click();
await page.waitForTimeout(1500);
const afterSave = await page.getByPlaceholder('Enter task description').inputValue();
check('the draft is cleared after a successful save', afterSave === '', JSON.stringify(afterSave));

await browser.close();
const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
