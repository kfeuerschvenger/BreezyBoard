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
  // region and landmark-one-main were measured here and have no line now: the
  // application shell gives every signed in page a banner, a main, a
  // complementary sidebar and navigation landmarks, so nothing sits outside one.
  //
  // The dashboard, its create board modal and its undo toast have no line:
  // each scans clean. The home page is an h1 greeting, an h2 "Your boards" and
  // h3 tile titles, so no level is skipped. The create board modal uses the
  // shared Modal, whose close control is an IconButton that cannot be rendered
  // without a label.
  //
  // The board, its task modal (a centered dialog at a desktop width and a
  // bottom sheet at a phone width, with the Move to row, the priority chips,
  // the checklist and its progress bar on screen), the toast that follows
  // blowing a card away, the board
  // not found page, the delete confirmation, the edit dialog and the profile
  // have no line: each scans clean.
  //
  // The "Move to" menu renders in a portal at the end of the body, outside the
  // page's landmarks, so its popup is the one `region` node that remains. The
  // second surface here is the one that exists to catch a popup in a portal.
  'board, move menu open': { region: 1 },
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

// A plain assertion beside the axe scans, for what axe has no rule for: that a
// menu offers its items in order, or that a breadcrumb has its two links.
const check = (label, got, expected) => {
  const ok = got === expected;
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${got} (expected ${expected})`);
};

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
await page.getByRole('button', { name: 'Forgot it?' }).click();
await page.waitForTimeout(400);
await scan('login, forgot password open');

// The confirmation replaces the form inside the same dialog, so it is a state
// of its own: a live region and a control that has just received focus. The
// address belongs to nobody, which is also the case the confirmation exists
// for.
await page.getByRole('dialog', { name: 'Forgot password' }).getByLabel('Email address').fill(`axe-nobody-${Date.now()}@example.test`);
await page.getByRole('button', { name: 'Send reset link' }).click();
await page.getByRole('dialog', { name: 'Forgot password' }).getByRole('status').waitFor();
await page.waitForTimeout(400);
await scan('login, forgot password confirmation');

await page.goto(`${FRONT}/register`);
await page.waitForSelector('form').catch(() => {});
await scan('register');

// The reset page opened from an emailed link, with a token in the address.
// The form shows whether or not the token is any good, since only the server
// can say that, so a made up one reaches the same page. Both password fields
// are scanned with their reveal toggles, the part of PasswordInput that has
// gone wrong before.
await page.goto(`${FRONT}/reset-password#token=${'a'.repeat(64)}`);
await page.getByRole('heading', { level: 1, name: 'Choose a new password' }).waitFor();
await scan('reset password');

// The same address with no token, or with one the server refused: the page
// that replaces the form.
await page.goto(`${FRONT}/reset-password`);
await page.getByRole('heading', { level: 1, name: 'This link cannot be used' }).waitFor();
await scan('reset password, link cannot be used');

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
await page.getByText('Your boards').waitFor();
await scan('dashboard');

// The sidebar is a column on this screen and a panel on a phone, and the panel
// is a different surface: a dialog that holds focus, over a page made inert,
// with a scrim between them. It is scanned open at a phone width.
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Open navigation' }).click();
await page.getByRole('dialog', { name: 'Navigation' }).waitFor();
await scan('dashboard, navigation panel open, phone');
await page.keyboard.press('Escape');
await page.getByRole('dialog', { name: 'Navigation' }).waitFor({ state: 'detached' });
await page.setViewportSize({ width: 1440, height: 900 });

await page.getByRole('button', { name: 'New board' }).first().click();
await page.waitForTimeout(400);
await scan('dashboard, create board modal open');

const boardName = `Axe Board ${Date.now()}`;
await page.getByLabel(/board name/i).fill(boardName);
await page.getByRole('button', { name: /^create board$/i }).last().click();
await page.getByText(boardName).first().click();
await page.waitForURL(/\/board\/[a-f0-9]{24}$/);
await page.waitForTimeout(400);
// A board with no card at all: the banner above the columns and "Still air" in
// each of them.
await scan('board, empty');

// The header's "Add card" opens the first column's composer, which is a form
// at the foot of a column and is scanned open, with a title typed in it.
await page.getByRole('button', { name: 'Add card', exact: true }).click();
const composer = page.getByRole('textbox', { name: /new card in/i });
await composer.waitFor();
await composer.fill('Axe card');
await scan('board, composer open');

await composer.press('Enter');
await page.getByRole('button', { name: 'Axe card', exact: true }).waitFor();
await page.waitForTimeout(700);
await scan('board, with a card');

// A card held in the air: it is collapsed where it was, a gap is open where it
// would land and a copy follows the pointer, and none of it may leave the page
// with a node that is hidden and still focusable or a gap that is announced.
await page.getByRole('button', { name: 'Drag handle' }).focus();
await page.keyboard.press('Space');
await page.locator('[id^="DndLiveRegion"]', { hasText: 'Picked up' }).waitFor();
// The keyboard sensor listens for the arrows one task after the pick up, and
// the announcement can be on screen before that. A task queued behind the
// sensor's runs after it: timers of the same delay run in the order they were set.
await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
await page.keyboard.press('ArrowRight');
await page.locator('[id^="DndLiveRegion"]', { hasText: 'Up Next' }).waitFor();
await page.waitForTimeout(400);
await scan('board, a card held with the keyboard');
await page.keyboard.press('Escape');
await page.locator('[id^="DndLiveRegion"]', { hasText: 'cancelled' }).waitFor();

// A task is edited in a modal: centered at a desktop width, a bottom sheet on
// a phone. The header strip's gradient is decoration and is hidden from
// assistive technology, which would take the close button with it if the
// button were inside it, so that is asserted beside the scan.
await page.getByRole('button', { name: 'Axe card', exact: true }).click();
const taskDialog = page.getByRole('dialog', { name: 'Edit Task' });
await taskDialog.waitFor();
await page.waitForTimeout(400);
check('the task modal is a modal dialog', await taskDialog.getAttribute('aria-modal'), 'true');
check(
  'the close button is in the accessibility tree, outside the hidden gradient',
  await taskDialog.getByRole('button', { name: 'Close' }).evaluate(button => button.closest('[aria-hidden="true"]') === null),
  true,
);
check(
  'Move to is a named group with one column pressed',
  `${await taskDialog.getByRole('group', { name: 'Move to' }).count()} ${await taskDialog.getByRole('group', { name: 'Move to' }).locator('[aria-pressed="true"]').count()}`,
  '1 1',
);
await page.getByRole('button', { name: 'Add Item' }).click();
await scan('board, task modal open');

await page.setViewportSize({ width: 390, height: 844 });
await scan('board, task modal open, phone');
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

// Blowing a card away closes the modal and raises the toast with Catch it, the
// one live region a card's delete mounts. It is scanned showing, over the
// board the person is left on, and the card is caught again so what follows
// finds the board as it was.
await page.getByRole('button', { name: 'Axe menu task', exact: true }).click();
await page.getByRole('dialog', { name: 'Edit Task' }).getByRole('button', { name: 'Blow it away' }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
await page.getByTestId('toast').waitFor();
check('the toast that follows a delete offers Catch it', await page.getByTestId('toast').getByRole('button', { name: 'Catch it' }).count(), 1);
await scan('board, blown away toast showing');
await page.getByTestId('toast').getByRole('button', { name: 'Catch it' }).click();
await page.getByRole('button', { name: 'Axe menu task', exact: true }).waitFor();

// The board's own menu has three items for the owner: Edit board, Add members
// and Delete board. Its popup is in a portal like the "Move to" menu's and
// would carry the same `region` finding, once for each of its items, so the
// popup is not scanned and the order of its items is asserted instead. Its
// Add members item opens the same dialog the Home tile's menu does, scanned
// with the search results on screen.
await page.getByRole('button', { name: /^options for /i }).click();
await page.getByRole('menu').waitFor();
const boardMenuItems = await page.getByRole('menuitem').allInnerTexts();
check(
  'the board menu offers Edit board, Add members and Delete board, in that order',
  boardMenuItems.map(item => item.trim()).join('|'),
  'Edit board|Add members|Delete board',
);
await page.getByRole('menuitem', { name: 'Add members' }).click();
await page.getByRole('dialog', { name: 'Add Members' }).waitFor();
await page.getByRole('textbox', { name: 'Search team members' }).waitFor();
await page.waitForTimeout(600);
await scan('board, add members dialog open');
await page.keyboard.press('Escape');
await page.getByRole('dialog', { name: 'Add Members' }).waitFor({ state: 'hidden' });

// The breadcrumb above the board reads Home, Boards, then the board. Home and
// Boards are links, to the page and to its grid of boards, and the last entry
// is the board as text. The separators are hidden from assistive technology.
// The links are scanned with the page, and their names and places are
// asserted here.
const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
check(
  'the breadcrumb on a board has two links, Home to / and Boards to /#boards',
  `${await crumbs.getByRole('link').count()} ${await crumbs.getByRole('link', { name: 'Home', exact: true }).getAttribute('href')} ${await crumbs.getByRole('link', { name: 'Boards', exact: true }).getAttribute('href')}`,
  '2 / /#boards',
);
check(
  'the last entry of the breadcrumb is the board, as text marked as the current page',
  `${await crumbs.locator('[aria-current="page"]').count()} ${await crumbs.locator('[aria-current="page"] a').count()}`,
  '1 0',
);
check(
  'the breadcrumb separators are hidden from assistive technology and the entries are three',
  `${await crumbs.locator('li[aria-hidden="true"]').count()} ${await crumbs.getByRole('listitem').count()}`,
  '2 3',
);

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
