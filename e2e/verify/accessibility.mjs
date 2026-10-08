// The end to end layer of the accessibility gate, section 10.2 of the
// revival plan.
//
// It matters more than the other two layers because the defects it catches
// are the ones static analysis structurally cannot see. The unlabelled
// dialog below is the exact case the plan predicted: "an axe scan with the
// task drawer open would have flagged the unlabeled dialog immediately". It
// does, and nothing else in this repository does.
//
// This is a ratchet rather than a pass/fail. The application has real
// accessibility debt, all of it already written up as P4-3 and P4-5, and a
// gate that simply failed on all of it would be switched off within a week.
// Instead each surface carries the count that was measured when the gate
// went in, and the script fails on anything above it. The numbers can only
// go down. When one reaches zero, delete its line rather than leaving a
// zero behind, so the table shrinks as the debt does.

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

/**
 * Violating elements per rule, per surface, as measured on 2026-09-15.
 *
 * Lower is the only direction allowed. A rule absent from a surface means
 * zero, so introducing a new one fails even though no number changed.
 */
const BASELINE = {
  // button-name was 1 here and its line is gone rather than sitting at zero.
  // It was the password reveal toggle, written out by hand with no accessible
  // name at all. It comes from shared/ui/PasswordInput now, which cannot be
  // rendered without one.
  // heading-order was 1 here too and its line is gone rather than sitting at
  // zero. The auth layout's feature list was a set of h3 headings under the
  // layout's h1, and a jump from h1 to h3 is a level skipped. They are h2.
  // One change closed this rule on all three surfaces below.
  login: {},
  // Added on 2026-10-05, the first time this dialog was ever scanned. Its one
  // number is the login page's own heading-order showing through from behind
  // it, the `h3` in the auth layout: the dialog contributes nothing of its
  // own. It was the fifth hand-written modal until this change and the one
  // P3-4 missed, so it had no dialog role, no accessible name, no focus trap
  // and a close button with no name. It comes from the shared Modal now, and
  // that is the whole argument of P3-4 in one measurement.
  'login, forgot password open': {},
  register: {},
  dashboard: { region: 6, 'heading-order': 1, 'landmark-one-main': 1 },
  // button-name was 1 here and its line is gone rather than sitting at zero:
  // the create board modal now uses the shared Modal, whose close control is
  // an IconButton that cannot be rendered without a label. region fell from
  // 10 to 6 and heading-order from 2 to 1 in the same change, and what is
  // left of both is the dashboard behind the dialog rather than the dialog.
  'dashboard, create board modal open': { region: 6, 'heading-order': 1 },
  board: { 'landmark-one-main': 1, region: 1 },
  // aria-dialog-name was 1 here and its line is gone rather than sitting at
  // zero. It was the violation section 10.2 predicted this gate would find,
  // word for word, and it closed when the task drawer moved onto the shared
  // Drawer, whose dialog is labelled by its own title.
  'board, task drawer open': { region: 1 },
  // Added with the bottom sheet. The same drawer below the medium breakpoint is
  // a different layout, a bottom sheet with its own scrolling body and a footer
  // outside it, and a layout nothing scanned at a desktop width says anything
  // about. It is scanned with a checklist item added, because an item is three
  // controls, a drag handle, a checkbox and a delete button, and each of them
  // has to be named. The first two were not, and no surface scanned an item.
  'board, task drawer open, phone': { region: 1 },
  // Added on 2026-10-07, when the "Move to" menu shipped. The menu renders in
  // a portal at the end of the body, outside the page's landmarks, so a
  // second `region` node is what this surface exists to catch. Its two
  // numbers are the board's own, unchanged: no main landmark, and the one
  // region node the board already carries. The popup adds nothing to either.
  'board, move menu open': { 'landmark-one-main': 1, region: 1 },
  // Added with board deletion. The dashboard with an undo toast showing. The
  // numbers are the dashboard's own, empty because the only board was just
  // deleted: the toast, its live region and its landmark add nothing to any
  // of the three. The delete confirmation scans clean, the page behind a
  // modal being inert to axe, so it carries no entry.
  'dashboard, undo toast showing': { region: 6, 'heading-order': 1, 'landmark-one-main': 1 },
  // Added on 2026-09-25, when this surface was scanned for the first time.
  // Its two numbers are the same debt every other surface carries: no main
  // landmark, and content sitting outside one. aria-prohibited-attr was also
  // 1 on the first measurement and its line is absent rather than zero,
  // because it was fixed in the same change: PageHeader's action wrapper is a
  // div with no role and carried an aria-label, which ARIA does not allow.
  // It only ever surfaced here because this is the first scanned page that
  // renders that header with an empty action area.
  profile: { 'landmark-one-main': 1, region: 17 },
};

// There is deliberately no colour-contrast entry anywhere above. The first
// measurement reported eleven on the login page and four on the dashboard,
// and every one of them turned out to be an artefact of scanning during the
// entrance animation, which `settle` below now waits out. On the settled
// page axe finds none. The contrast concern recorded in P4-5 is about icon
// colours, which is WCAG 1.4.11 and a rule axe does not run by default, so
// it is neither confirmed nor refuted by this script.

const log = (...a) => console.log(...a);
const results = [];

const user = {
  firstName: 'Axe',
  lastName: 'Gate',
  email: `axe-${Date.now()}@example.test`,
  password: 'AxeGate1',
};

const browser = await chromium.launch();
// AxeBuilder refuses a page created straight off the browser and wants an
// explicit context, so the viewport is set on the context instead.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const register = await page.request.post(`${API}/auth/register`, { data: user });
if (!register.ok()) {
  console.error(`registration failed with ${register.status()}.`);
  console.error('Registration is rate limited to twenty an hour. Run: docker compose restart back');
  await browser.close();
  process.exit(1);
}

/**
 * Wait for the entrance animations to finish before measuring.
 *
 * Without this the contrast count for the login page moved between 0, 3 and
 * 11 across consecutive runs of the identical page. framer-motion animates
 * opacity from zero by writing inline styles from requestAnimationFrame, and
 * axe computes contrast against whatever opacity it finds, so scanning
 * mid-transition measures a page that exists for about half a second and is
 * never what anybody sees. A ratchet built on a number that flaps is worse
 * than no ratchet, because the first false red teaches everyone to ignore
 * it.
 */
const settle = async () => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
};

const scan = async surface => {
  await settle();
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  const counted = Object.fromEntries(violations.map(v => [v.id, v.nodes.length]));
  const allowed = BASELINE[surface] ?? {};
  const rules = new Set([...Object.keys(counted), ...Object.keys(allowed)]);

  log(`\n--- ${surface} ---`);

  for (const rule of [...rules].sort()) {
    const found = counted[rule] ?? 0;
    const budget = allowed[rule] ?? 0;
    const ok = found <= budget;
    results.push(ok);

    if (found === budget) {
      log(`${ok ? 'PASS' : 'FAIL'}  ${rule}  -> ${found} (budget ${budget})`);
    } else if (found < budget) {
      log(`PASS  ${rule}  -> ${found}, down from ${budget}. Lower the baseline in this file.`);
    } else {
      const detail = violations.find(v => v.id === rule);
      log(`FAIL  ${rule}  -> ${found}, above the budget of ${budget}  :: ${detail?.help ?? ''}`);
      for (const node of detail?.nodes.slice(0, 3) ?? []) {
        log(`        ${node.html.slice(0, 120)}`);
      }
    }
  }

  if (rules.size === 0) {
    log('PASS  no violations at all');
    results.push(true);
  }
};

await page.goto(`${FRONT}/login`);
await page.waitForSelector('form');
await scan('login');

// The forgot password dialog was the fifth hand-written modal and the one
// finding P3-4 missed, which is exactly what an unscanned state buys you. It
// is scanned now, open.
await page.getByRole('button', { name: /forgot password/i }).click();
await page.waitForTimeout(400);
await scan('login, forgot password open');

await page.goto(`${FRONT}/register`);
await page.waitForSelector('form').catch(() => {});
await scan('register');

// An address that leads nowhere, before anyone has signed in. The page has to
// stand on its own here: no account menu, no redirect to login.
await page.goto(`${FRONT}/no/such/page`);
await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
await scan('unknown address, signed out');

// Sign in through the interface, so the session under test is a real one.
await page.goto(`${FRONT}/login`);
const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.getByText('My Boards').waitFor();
await scan('dashboard');

await page.getByRole('button', { name: /create board/i }).first().click();
await page.waitForTimeout(400);
await scan('dashboard, create board modal open');

const boardName = `Axe Board ${Date.now()}`;
await page.getByLabel(/board name/i).fill(boardName);
await page.getByRole('button', { name: /^create board$/i }).last().click();
await page.getByText(boardName).first().click();
await page.waitForURL(/\/board\/[a-f0-9]{24}$/);
await page.waitForTimeout(400);
await scan('board');

await page.getByRole('button', { name: /add task/i }).first().click();
await page.waitForTimeout(400);
await scan('board, task drawer open');

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Add Item' }).click();
await scan('board, task drawer open, phone');
await page.setViewportSize({ width: 1440, height: 900 });

// The "Move to" menu is a popup in a portal, so nothing scanned with it
// closed says anything about it. It is opened on a card that has a column
// either side of it, so every state of an item is on screen: a column to move
// to and the current one, disabled.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const token = (await register.json()).data.token;
const authorised = { headers: { Authorization: `Bearer ${token}` } };
const boardId = page.url().match(/board\/([a-f0-9]{24})/)[1];
const board = (await (await page.request.get(`${API}/boards/${boardId}`, authorised)).json()).data;
const palette = (await (await page.request.get(`${API}/colors?type=task`, authorised)).json()).data;
const created = await page.request.post(`${API}/tasks/board/${boardId}`, {
  ...authorised,
  data: {
    title: 'Axe menu task',
    description: '',
    status: board.columns[0]._id,
    priority: 'medium',
    color: palette[0]._id,
    boardId,
    checklist: [],
  },
});
if (!created.ok()) {
  console.error(`creating the task for the move menu failed with ${created.status()}.`);
  await browser.close();
  process.exit(1);
}
await page.reload();
await page.getByRole('button', { name: 'Move Axe menu task to another column' }).waitFor();
await page.keyboard.press('Tab');
await page.getByRole('button', { name: 'Move Axe menu task to another column' }).click();
await page.getByRole('menu', { name: 'Move Axe menu task to' }).waitFor();
await scan('board, move menu open');
await page.keyboard.press('Escape');

// The edit dialog is a modal over the board page. It is scanned with the
// board's own colours loaded, so the swatch radios are on screen: a radio
// group is where a missing legend or an unnamed input would show.
await page.getByRole('button', { name: /^options for /i }).click();
await page.getByRole('menuitem', { name: 'Edit board' }).click();
await page.getByRole('dialog', { name: 'Edit Board' }).waitFor();
await page.getByRole('radio').first().waitFor({ state: 'attached' });
await scan('board, edit dialog open');
await page.keyboard.press('Escape');

// The delete confirmation is a second dialog from the same menu, and the
// toast that follows a delete is the one live region the application
// mounts. The toast is scanned showing, on the dashboard the person lands on,
// because an empty region says nothing about the content that goes into it.
await page.getByRole('button', { name: /^options for /i }).click();
await page.getByRole('menuitem', { name: 'Delete board' }).click();
await page.getByRole('dialog', { name: 'Delete this board?' }).waitFor();
await scan('board, delete confirmation open');
await page.getByRole('dialog', { name: 'Delete this board?' }).getByRole('button', { name: 'Delete board' }).click();
await page.getByTestId('toast').waitFor();
await scan('dashboard, undo toast showing');

// The two not found pages a signed in person can reach: an unknown route and
// a board that does not exist. Both carry the app header, so they are
// scanned where the account menu is on screen.
await page.goto(`${FRONT}/no/such/page`);
await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
await scan('unknown address, signed in');

await page.goto(`${FRONT}/board/${'0'.repeat(24)}`);
await page.getByRole('heading', { level: 1, name: 'Board not found' }).waitFor();
await scan('board not found');

// The profile page was outside this gate until now, which is how its joined
// date printed "Invalid Date" and its avatar input sat at display:none
// without either being measured. A surface nobody scans is a surface nobody
// knows about.
await page.goto(`${FRONT}/profile`);
await page.getByText('Profile Settings').waitFor();
await page.waitForTimeout(400);
await scan('profile');

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
