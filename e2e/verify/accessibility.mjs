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
import { settled } from './observe.mjs';
import { measureContrast } from './contrast.mjs';

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
// it is neither confirmed nor refuted by axe.
//
// Contrast is measured here in a second way, which does not wait on axe: after
// each scan `contrast.mjs` photographs the page with its glyphs removed and
// compares every piece of text with the pixels behind it. Axe reads a background
// from the cascade and has no answer for text on translucent glass over a
// gradient. That sweep has no budget. Every pair on every surface meets its
// minimum, and a pair that does not is a failure to fix in the interface.

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
 *
 * It waits on what the page reports: no CSS animation or transition still
 * running, and no inline style or class still being rewritten, which is how
 * framer-motion writes its frames. A fixed wait is a guess at that, and a
 * stalled renderer outlasts the guess.
 */
const settle = async (label = 'the page to stop animating before it is scanned') => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await settled(page, { label });
};

const scan = async surface => {
  await settle();
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  const counted = Object.fromEntries(violations.map(v => [v.id, v.nodes.length]));
  const allowed = BASELINE[surface] ?? {};
  const rules = new Set([...Object.keys(counted), ...Object.keys(allowed)]);

  log(`\n--- ${surface} ---`);

  for (const rule of [...rules].sort((a, b) => a.localeCompare(b))) {
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

  await sweepContrast();
};

/**
 * The colour of every piece of text on the settled page, against the pixels
 * painted behind it. Axe has no answer for text on a translucent surface over a
 * gradient, and the list of pairs in design-tokens.mjs holds only the pairs
 * somebody thought of. This holds every pair that is on screen.
 */
const sweepContrast = async () => {
  const { measured, failures, lowest, skipped } = await measureContrast(page);
  const ok = failures.length === 0 && measured.length > 0;
  results.push(ok);
  const left = Object.entries(skipped)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
  const glyphs = measured.filter(box => box.kind === 'glyph').length;
  log(
    `${ok ? 'PASS' : 'FAIL'}  contrast of every colour on screen  -> ${measured.length} measured (${glyphs} glyphs), ${failures.length} below the minimum, lowest ${lowest?.ratio}:1 (${lowest?.kind}, "${lowest?.label}" in ${lowest?.where})${left ? `; not measured: ${left}` : ''}`,
  );
  for (const box of failures.slice(0, 12)) {
    log(`        ${box.ratio}:1 < ${box.minimum}:1  "${box.label}"  ${box.color} on rgb(${box.behind})  in ${box.where}`);
  }
};

await page.goto(`${FRONT}/login`);
await page.waitForSelector('form');

// The sweep is only worth its pass if it can fail. Four probes of known colour
// are put on the page and taken away again: the grey the reference design uses
// for small text (3.2:1, which has to be refused), ink (which has to pass), the
// same grey at a size WCAG treats as large (3:1, which has to pass) and ink at
// 30% opacity (which has to be refused, so a faded parent is not ignored).
await page.evaluate(() => {
  const probe = document.createElement('div');
  probe.id = 'contrast-probe';
  probe.setAttribute('style', 'position:fixed;left:8px;top:8px;z-index:99999;background:#ffffff;padding:8px');
  probe.innerHTML = [
    '<p style="color:#8391a4;font:16px sans-serif;margin:0">probe weak</p>',
    '<p style="color:#0f1b2d;font:16px sans-serif;margin:0">probe strong</p>',
    '<p style="color:#8391a4;font:bold 24px sans-serif;margin:0">probe large</p>',
    '<div style="opacity:0.3"><p style="color:#0f1b2d;font:16px sans-serif;margin:0">probe faded</p></div>',
  ].join('');
  document.body.appendChild(probe);
});
const probed = await measureContrast(page);
await page.evaluate(() => document.getElementById('contrast-probe')?.remove());
const probeFailed = label => probed.failures.some(box => box.label === label);
check('the contrast sweep refuses the reference design grey on white', probeFailed('probe weak'), true);
check('the contrast sweep accepts ink on white', probeFailed('probe strong'), false);
check('the contrast sweep accepts that grey at the large text size', probeFailed('probe large'), false);
check('the contrast sweep refuses ink at 30% opacity', probeFailed('probe faded'), true);

await scan('login');

// The forgot password dialog was the fifth hand-written modal and the one
// finding P3-4 missed, which is exactly what an unscanned state buys you. It
// is scanned now, open.
await page.getByRole('button', { name: 'Forgot it?' }).click();
await settled(page, { within: '[role="dialog"]', label: 'the forgot password dialog to finish opening' });
await scan('login, forgot password open');

// The confirmation replaces the form inside the same dialog, so it is a state
// of its own: a live region and a control that has just received focus. The
// address belongs to nobody, which is also the case the confirmation exists
// for.
await page.getByRole('dialog', { name: 'Forgot password' }).getByLabel('Email address').fill(`axe-nobody-${Date.now()}@example.test`);
await page.getByRole('button', { name: 'Send reset link' }).click();
await page.getByRole('dialog', { name: 'Forgot password' }).getByRole('status').waitFor();
await settled(page, { within: '[role="dialog"]', label: 'the confirmation to finish replacing the form' });
await scan('login, forgot password confirmation');

// A refused sign in: the error banner is a tint of its own, with its own text
// colour, and exists only after a refusal. The terms dialog opened from the
// pair of links under the form is a long document in a dialog.
await page.goto(`${FRONT}/login`);
const refusedForm = page.locator('form').first();
await refusedForm.getByLabel('Email address', { exact: true }).fill(`axe-nobody-${Date.now()}@example.test`);
await refusedForm.getByLabel('Password', { exact: true }).fill('NotARealPassw0rd');
await refusedForm.getByRole('button', { name: /sign in/i }).click();
await page.getByRole('alert').first().waitFor();
await scan('login, sign in refused');
await page.getByRole('button', { name: 'Terms', exact: true }).click();
await page.getByRole('dialog', { name: /Terms of Service/ }).locator('.whitespace-pre-wrap').waitFor();
await settled(page, { within: '[role="dialog"]', label: 'the terms dialog to finish opening' });
await scan('login, terms open');

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
// Every page names its tab: it is what a screen reader announces on arrival and
// what the history and a bookmark show.
check('the home page names the tab Home', await page.title(), 'Home | BreezyBoard');

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
await settled(page, { within: '[role="dialog"]', label: 'the create board dialog to finish opening' });
await scan('dashboard, create board modal open');

const boardName = `Axe Board ${Date.now()}`;
await page.getByLabel(/board name/i).fill(boardName);
await page.getByRole('button', { name: /^create board$/i }).last().click();
await page.getByText(boardName).first().click();
await page.waitForURL(/\/board\/[a-f0-9]{24}$/);
await settled(page, { label: 'the board page to stop animating' });
// A board with no card at all: the banner above the columns and "Still air" in
// each of them.
await scan('board, empty');
check('a board names the tab with its own name', await page.title(), `${boardName} | BreezyBoard`);

// The header's "Add card" opens the first column's composer, which is a form
// at the foot of a column and is scanned open, with a title typed in it.
await page.getByRole('button', { name: 'Add card', exact: true }).click();
const composer = page.getByRole('textbox', { name: /new card in/i });
await composer.waitFor();
await composer.fill('Axe card');
await scan('board, composer open');

await composer.press('Enter');
await page.getByRole('button', { name: 'Axe card', exact: true }).waitFor();
await settled(page, { label: 'the new card to finish landing' });
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
await settled(page, { label: 'the held card and its gap to come to rest' });
await scan('board, a card held with the keyboard');
await page.keyboard.press('Escape');
await page.locator('[id^="DndLiveRegion"]', { hasText: 'cancelled' }).waitFor();

// A task is edited in a modal: centered at a desktop width, a bottom sheet on
// a phone. The header strip's gradient is decoration and is hidden from
// assistive technology, which would take the close button with it if the
// button were inside it, so that is asserted beside the scan.
await page.getByRole('button', { name: 'Axe card', exact: true }).click();
const taskDialog = page.getByRole('dialog', { name: 'Edit task' });
await taskDialog.waitFor();
await settled(page, { within: '[role="dialog"]', label: 'the task modal to finish opening' });
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
// The checklist adds an item from a named field at its foot, with Enter, and
// has no button that adds a blank row.
check('the checklist has no Add Item button', await taskDialog.getByRole('button', { name: /add item/i }).count(), 0);
const addItem = taskDialog.getByRole('textbox', { name: 'Add an item' });
await addItem.fill('An item to scan');
await addItem.press('Enter');
await taskDialog.getByRole('textbox', { name: 'Checklist item 1' }).waitFor();
check('Enter in the Add an item field adds the item and leaves the dialog open', `${await taskDialog.getByRole('textbox', { name: 'Checklist item 1' }).inputValue()} ${await taskDialog.isVisible()}`, 'An item to scan true');
await addItem.press('Enter');
check('Enter in an empty Add an item field adds nothing', await taskDialog.getByRole('textbox', { name: /^Checklist item/ }).count(), 1);
// The footer is Blow it away and one Done. There is no Cancel and no Save
// Changes, and the buttons are named by their text.
check(
  'the footer offers Blow it away and Done, and neither Cancel nor Save Changes',
  `${await taskDialog.getByRole('button', { name: 'Blow it away' }).count()} ${await taskDialog.locator('button[type="submit"]').innerText()} ${await taskDialog.getByRole('button', { name: /^(cancel|save changes)$/i }).count()}`,
  '1 Done 0',
);
await scan('board, task modal open');

await page.setViewportSize({ width: 390, height: 844 });
await scan('board, task modal open, phone');
await page.setViewportSize({ width: 1440, height: 900 });

// The "Move to" menu is a popup in a portal, so nothing scanned with it
// closed says anything about it. It is opened on a card that has a column
// either side of it, so every state of an item is on screen: a column to move
// to and the current one, disabled.
await page.keyboard.press('Escape');
await settled(page, { label: 'the task modal to finish leaving' });
const token =(await register.json()).data.token;
const authorised = { headers: { Authorization: `Bearer ${token}` } };
const boardId = /board\/([a-f0-9]{24})/.exec(page.url())[1];
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
// Cards in the states the first one is not in: a high priority card with a
// description and a half done checklist, and a low priority card in the last
// column with a finished one. Together with the medium card they put every
// priority chip, the checklist figure in both colours, the description marker
// and the muted title of a card that has landed on screen at once.
const lastColumn = board.columns.at(-1)._id;
for (const extra of [
  { title: 'Axe high card', status: board.columns[1]._id, priority: 'high', description: 'Something worth reading', checklist: [{ text: 'First', completed: true }, { text: 'Second' }] }, // NOSONAR javascript:S9382 sequential on purpose: each card is added to the same column and its place is the order it was made in
  { title: 'Axe landed card', status: lastColumn, priority: 'low', description: '', checklist: [{ text: 'Only', completed: true }] },
]) { // NOSONAR javascript:S9382
  const made = await page.request.post(`${API}/tasks/board/${boardId}`, { ...authorised, data: { ...extra, color: palette[1]._id, boardId } }); // NOSONAR javascript:S9382
  if (!made.ok()) {
    console.error(`creating ${extra.title} failed with ${made.status()}.`);
    await browser.close();
    process.exit(1);
  }
}
await page.reload();
await page.getByRole('button', { name: 'Move Axe menu task to another column' }).waitFor();
await page.getByRole('button', { name: 'Axe landed card', exact: true }).waitFor();
await settled(page, { label: 'the cards to finish arriving' });
await scan('board, cards in every state');
await page.setViewportSize({ width: 390, height: 844 });
await scan('board, cards in every state, phone');
await page.setViewportSize({ width: 1440, height: 900 });
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
await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Blow it away' }).click();
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
await page.getByRole('dialog', { name: 'Add members' }).waitFor();
await page.getByRole('textbox', { name: 'Search team members' }).waitFor();
await settled(page, { within: '[role="dialog"]', label: 'the add members dialog to finish opening' });
await scan('board, add members dialog open');
// A person chosen: the row in its selected tint, the chip row above the list and
// the count in the footer.
await page.getByRole('dialog', { name: 'Add members' }).locator('[aria-pressed="false"]').first().click();
await page.getByText('1 member selected').first().waitFor();
await settled(page, { within: '[role="dialog"]', label: 'the selection to finish arriving' });
await scan('board, add members dialog, one person chosen');
await page.keyboard.press('Escape');
await page.getByRole('dialog', { name: 'Add members' }).waitFor({ state: 'hidden' });

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
await page.getByRole('dialog', { name: 'Edit board' }).waitFor();
await page.getByRole('radio').first().waitFor({ state: 'attached' });
await scan('board, edit dialog open');
await page.keyboard.press('Escape');

// Home with a board on it: the banner over its gradient, the tile's cover, its
// progress figure and the counts in the tertiary ink on glass. Every earlier
// scan of this page was of an empty one. The phone is scanned too, because the
// banner's text sits on a different part of the gradient there.
await page.goto(`${FRONT}/`);
await page.getByText(boardName).first().waitFor();
await settled(page, { label: 'the home page to stop animating' });
await scan('dashboard, with a board');
// The tile's options button is drawn only while a pointer or the keyboard is on
// its tile, so it is measured with the pointer there: a glass disc and a glyph
// over the board's cover gradient.
await page.locator('main').getByRole('heading', { level: 3, name: boardName }).hover();
await page.getByRole('button', { name: /^options for /i }).waitFor();
await settled(page, { label: 'the tile to finish lifting under the pointer' });
await scan('dashboard, a tile under the pointer');
await page.mouse.move(0, 0);
await page.setViewportSize({ width: 390, height: 844 });
await scan('dashboard, with a board, phone');
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${FRONT}/board/${boardId}`);
await page.getByRole('button', { name: 'Axe card', exact: true }).waitFor();

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
await page.getByRole('heading', { level: 1 }).waitFor();
await settled(page, { label: 'the profile page to stop animating' });
await scan('profile');
check('the profile names the tab Profile', await page.title(), 'Profile | BreezyBoard');

// What axe has no rule for on the profile: the order of its panels, that the
// two preferences that are not built are switches that are off and disabled
// with a name and a description each, that the Breeze level is a named radio
// group of four, and that Sign out is offered twice, in the header and in its
// card, under the same name.
check(
  'the profile has four panels, in order',
  (await page.locator('main section[aria-labelledby] h2').allTextContents()).join('|'),
  'About you|Your breeze|Password|Sign out',
);
check('the Breeze level is one radio group of four', await page.getByRole('radiogroup', { name: 'Breeze level' }).getByRole('radio').count(), 4);
const comingSoon = await page.getByRole('switch').evaluateAll(items =>
  items.map(item => ({
    name: document.getElementById(item.getAttribute('aria-labelledby'))?.textContent,
    description: document.getElementById(item.getAttribute('aria-describedby'))?.textContent?.slice(0, 11),
    off: item.getAttribute('aria-checked') === 'false' && item.disabled,
  })),
);
check(
  'the two coming preferences are named, described as Coming soon, off and disabled',
  comingSoon.map(item => `${item.name}:${item.description}:${item.off}`).join('|'),
  'Due-date nudges:Coming soon:true|Weekly digest:Coming soon:true',
);
check('Sign out is offered in the header and in its card', await page.getByRole('button', { name: 'Sign out', exact: true }).count(), 2);
check('the avatar can be changed with the keyboard: its input is named and focusable', await page.getByLabel('Change avatar').evaluate(input => input.tabIndex >= 0 && !input.disabled), true);

// The password panel with a refusal showing: an error under the field it
// belongs to, announced, and the field marked invalid.
const passwordPanel = page.getByRole('region', { name: 'Password' });
await passwordPanel.getByLabel('Current password', { exact: true }).fill('NotMyPassw0rd');
await passwordPanel.getByLabel('New password', { exact: true }).fill('FreshPassw0rd');
await passwordPanel.getByLabel('Confirm new password', { exact: true }).fill('FreshPassw0rd');
await passwordPanel.getByRole('button', { name: 'Change password' }).click();
await passwordPanel.getByRole('alert').waitFor();
await scan('profile, password refused');
check(
  'the refused current password is marked invalid and described by its error',
  `${await passwordPanel.getByLabel('Current password', { exact: true }).getAttribute('aria-invalid')} ${await passwordPanel.getByLabel('Current password', { exact: true }).evaluate(input => document.getElementById(input.getAttribute('aria-describedby'))?.textContent)}`,
  'true That is not your current password',
);

// A name and a place typed on the profile are saved, and the toast that says
// so is a live region scanned showing.
await page.getByLabel('First name').fill('Axel');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.getByTestId('toast').waitFor();
await scan('profile, saved toast showing');

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
