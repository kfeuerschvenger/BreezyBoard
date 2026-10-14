import { chromium } from 'playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const log = (...a) => console.log(...a);
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  :: ' + detail : ''}`);
};

const req = async (method, path, token, body) => {
  const response = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const user = {
  firstName: 'Draft',
  lastName: 'Check',
  email: `draft-${Date.now()}@example.test`,
  password: 'Passw0rd1',
};
const registered = await req('POST', '/auth/register', null, user);
if (registered.status !== 201 && registered.status !== 200) {
  console.error(`registration failed with ${registered.status}. Run: docker compose restart back`);
  process.exit(1);
}
const token = registered.body.data.token;
const userId = registered.body.data.user._id;

// A board with one card that is already valid, so a draft is the only thing
// between the form and a save. Both drafts below are what a person loses when
// a session ends mid sentence: the task form's, and the composer's.
const templates = await req('GET', '/templates', token);
const boardColors = await req('GET', '/colors?type=board', token);
const taskColors = await req('GET', '/colors?type=task', token);
const board = await req('POST', '/boards', token, {
  title: `Draft Board ${Date.now()}`,
  description: 'for the draft checks',
  color: boardColors.body.data[0]._id,
  template: templates.body.data[0]._id,
});
const boardId = board.body.data._id;
const [firstColumn] = [...board.body.data.columns].sort((a, b) => a.order - b.order);
const task = await req('POST', `/tasks/board/${boardId}`, token, {
  title: 'Card with a draft',
  description: 'The description as it was saved',
  status: firstColumn._id,
  color: taskColors.body.data[0]._id,
  owner: userId,
});
const taskId = task.body.data._id;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await page.goto(`${FRONT}/login`, { waitUntil: 'networkidle' });
const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.getByText('Your boards').waitFor();

const openBoard = async () => {
  await page.goto(`${FRONT}/board/${boardId}`);
  await page.getByRole('button', { name: 'Card with a draft', exact: true }).waitFor();
};
const openCard = async (name = 'Card with a draft') => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit Task' }).waitFor();
  // The form is built from the saved task and then from the draft, a render
  // after the dialog is on screen, so a read before the title has a value is a
  // read of a form still being filled in.
  await page.getByRole('radio').first().waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('[placeholder="Enter task title"]')?.value);
};
const draftKey = `breezyboard:draft:task:${taskId}`;
const draftOf = key => page.evaluate(k => window.localStorage.getItem(k), key);

const SENTENCE = 'A sentence the user was halfway through writing';

log('--- the task form ---');
await openBoard();
await openCard();
await page.getByPlaceholder('Enter task title').fill('Half edited title');
await page.getByPlaceholder('Enter task description').fill(SENTENCE);
// The draft is written on a throttle, so it is read from storage and not
// assumed: nothing below means anything until it is there.
await page.waitForFunction(
  ([key, text]) => (window.localStorage.getItem(key) ?? '').includes(text),
  [draftKey, SENTENCE],
);

// Every write to the task's draft key from here on is recorded, with the
// title it held. The page is reloaded next, so the recorder is installed as an
// init script and runs before the application does.
await page.addInitScript(key => {
  window.__draftWrites = [];
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name, value) {
    if (name === key) {
      try {
        window.__draftWrites.push(JSON.parse(value).value.title);
      } catch {
        window.__draftWrites.push(null);
      }
    }
    return original.call(this, name, value);
  };
}, draftKey);

// Losing the page entirely, the way a session timeout or a crashed tab would.
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Card with a draft', exact: true }).waitFor();
await openCard();

const title = await page.getByPlaceholder('Enter task title').inputValue();
const description = await page.getByPlaceholder('Enter task description').inputValue();
log(`  restored title: ${JSON.stringify(title)}`);
log(`  restored description: ${JSON.stringify(description)}`);

check('the title survived losing the page', title === 'Half edited title', title);
check('the description survived losing the page', description === SENTENCE, description);

// Opening a task rebuilds the form in the render after the dialog opens, and
// the autosave must not write the empty form it was built with over the draft
// it is about to restore. A tab lost inside the window between the two writes
// lost the draft.
// The write that follows the restore is waited for. A late write of the empty
// form would be the trailing write of the draft's 500 millisecond throttle, so
// the writes are read once none has come for longer than that. That is an
// absence over a window, the one thing here with nothing to observe, and a
// stalled page only lengthens it.
await page
  .waitForFunction(() => window.__draftWrites.length > 0, null, { timeout: 15000 })
  .catch(() => {});
await page.evaluate(
  quietMs =>
    new Promise(resolve => {
      let seen = window.__draftWrites.length;
      let changedAt = performance.now();
      const tick = () => {
        if (window.__draftWrites.length !== seen) {
          seen = window.__draftWrites.length;
          changedAt = performance.now();
        }
        if (performance.now() - changedAt >= quietMs) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    }),
  600
);
const writes = await page.evaluate(() => window.__draftWrites);
log(`  titles written while opening the card: ${JSON.stringify(writes)}`);
check('opening a card writes its draft at least once', writes.length > 0, String(writes.length));
check(
  'opening a card never writes the empty form over its draft',
  writes.every(written => written === 'Half edited title'),
  JSON.stringify(writes),
);

// Finish the edit properly, then confirm the draft is not left behind.
// The footer is Blow it away and one Done, which saves and closes. The column
// called Done is a button in the dialog as well, so the submit button is read
// by its type.
await page.getByRole('dialog').locator('button[type="submit"]').click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'Half edited title', exact: true }).waitFor();
check('the draft is cleared after a successful save', (await draftOf(draftKey)) === null, String(await draftOf(draftKey)));

await openCard('Half edited title');
const saved = await page.getByPlaceholder('Enter task description').inputValue();
check('the saved text is what the form shows afterwards', saved === SENTENCE, saved);
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'detached' });

// There is no Cancel. The close button and Escape leave the dialog without
// saving, and what was typed stays as a draft for the next time.
const dialogButtons = async () => (await page.getByRole('dialog').getByRole('button').allInnerTexts()).map(text => text.trim());
await openCard('Half edited title');
const labels = await dialogButtons();
check('the dialog has no Cancel and no Save Changes button', !labels.some(label => /^(cancel|save changes)$/i.test(label)), labels.join('|'));
await page.getByPlaceholder('Enter task title').fill('Typed and closed');
await page.waitForFunction(([key]) => (window.localStorage.getItem(key) ?? '').includes('Typed and closed'), [draftKey]);
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
check('closing with the close button keeps the draft', ((await draftOf(draftKey)) ?? '').includes('Typed and closed'), String(await draftOf(draftKey)));
await page.getByRole('button', { name: 'Half edited title', exact: true }).waitFor();
check('and the card on the board still has its saved title', (await page.getByRole('button', { name: 'Typed and closed', exact: true }).count()) === 0);

await openCard('Half edited title');
check('the next time the card opens it shows the draft', (await page.getByPlaceholder('Enter task title').inputValue()) === 'Typed and closed');
await page.getByPlaceholder('Enter task title').fill('Typed and escaped');
await page.waitForFunction(([key]) => (window.localStorage.getItem(key) ?? '').includes('Typed and escaped'), [draftKey]);
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'detached' });
check('closing with Escape keeps the draft too', ((await draftOf(draftKey)) ?? '').includes('Typed and escaped'), String(await draftOf(draftKey)));

// Blowing the card away is the other way out, and it drops the draft: there is
// no task left for it to be a draft of. Catching the card brings back the same
// task, and the board is left as it was found.
await openCard('Half edited title');
await page.getByRole('dialog').getByRole('button', { name: 'Blow it away' }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
check('blowing the card away drops its draft', (await draftOf(draftKey)) === null, String(await draftOf(draftKey)));
await page.getByTestId('toast').getByRole('button', { name: 'Catch it' }).click();
await page.getByRole('button', { name: 'Half edited title', exact: true }).waitFor();
const caught = await req('GET', `/tasks/${taskId}`, token);
check('catching it brings back the same task from the server', caught.status === 200 && caught.body.data.title === 'Half edited title', `${caught.status}`);

log('\n--- the column composer ---');
const composerKey = `breezyboard:draft:composer:${firstColumn._id}`;
await page.getByRole('button', { name: `Add a card to ${firstColumn.title}` }).click();
const field = page.getByRole('textbox', { name: new RegExp(`new card in ${firstColumn.title}`, 'i') });
await field.fill('Half a card title');
await page.waitForFunction(
  ([key]) => (window.localStorage.getItem(key) ?? '').includes('Half a card title'),
  [composerKey],
);

await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Half edited title', exact: true }).waitFor();
await page.getByRole('button', { name: `Add a card to ${firstColumn.title}` }).click();
const restored = await page.getByRole('textbox', { name: new RegExp(`new card in ${firstColumn.title}`, 'i') }).inputValue();
check('a half typed card title survived losing the page', restored === 'Half a card title', restored);

await page.keyboard.press('Enter');
await page.getByRole('button', { name: 'Half a card title', exact: true }).waitFor();
check('the composer draft is cleared once the card is added', (await draftOf(composerKey)) === null, String(await draftOf(composerKey)));

await browser.close();
const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
