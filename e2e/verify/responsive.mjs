// The task drawer, measured on a rendered page at five widths.
//
// Below the medium breakpoint the drawer is a bottom sheet and above it a
// side panel, its actions stay inside the viewport while its body scrolls, and
// shrinking the viewport the way an on-screen keyboard does keeps the actions
// and the focused field on screen. Every one of those is a fact about computed
// layout, which no layer below a real browser produces: jsdom loads no
// stylesheet, so a component test sees that a breakpoint class is present and
// never that it did anything.
//
// What is asserted is behaviour rather than coordinates, so a redesign that
// changes colours, spacing or type does not break it.

import { chromium } from 'playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

const log = (...a) => console.log(...a);
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
};

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

/** The medium breakpoint: the drawer is a bottom sheet strictly below it. */
const MD = 768;

const req = async (method, path, token, body) => {
  const response = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const user = {
  firstName: 'Responsive',
  lastName: 'Gate',
  email: `responsive-${Date.now()}@example.test`,
  password: 'ResponsiveGate1',
};

const registered = await req('POST', '/auth/register', null, user);
if (registered.status !== 201 && registered.status !== 200) {
  console.error(`registration failed with ${registered.status}.`);
  console.error('Registration is rate limited to twenty an hour. Run: docker compose restart back');
  process.exit(1);
}
const token = registered.body.data.token;

const templates = await req('GET', '/templates', token);
const boardColors = await req('GET', '/colors?type=board', token);
const taskColors = await req('GET', '/colors?type=task', token);

const board = await req('POST', '/boards', token, {
  title: 'A board with a deliberately long title to see what it does to the header',
  description: 'created to be measured',
  color: boardColors.body.data[0]._id,
  template: templates.body.data[0]._id,
});
const boardId = board.body.data._id;
const columns = [...board.body.data.columns].sort((a, b) => a.order - b.order);

const LONG_TITLE =
  'A task title long enough that it has to wrap or be cut somewhere on a phone screen without breaking anything';
for (const [index, title] of [LONG_TITLE, 'Short task'].entries()) {
  await req('POST', `/tasks/board/${boardId}`, token, {
    title,
    description: 'Some description text for the card.',
    status: columns[index]._id,
    priority: 'high',
    color: taskColors.body.data[0]._id,
    checklist: [{ text: 'first item', completed: false }],
  });
}

const browser = await chromium.launch();

/** A page signed in through the interface, so the session is a real one. */
const page = await (await browser.newContext({ viewport: VIEWPORTS[4] })).newPage();

await page.goto(`${FRONT}/login`);
const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.getByText('My Boards').waitFor();

const settle = async target => {
  await target.waitForLoadState('networkidle').catch(() => {});
  await target.waitForTimeout(700);
};

log('\n--- the task drawer is a bottom sheet on a phone and a side panel on a desktop ---');

/** Geometry of the open drawer and of its two actions, read in one round trip. */
const drawerGeometry = () =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = dialog.getBoundingClientRect();
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const buttons = [...dialog.querySelectorAll('button')];
    const save = buttons.find(b => /save/i.test(b.textContent));
    const cancel = buttons.find(b => /cancel/i.test(b.textContent));
    const scroller = [...dialog.querySelectorAll('*')].find(
      el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1
    );
    const heading = dialog.querySelector('h2');
    return {
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height },
      pageWide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      save: save && rect(save),
      cancel: cancel && rect(cancel),
      scrolls: Boolean(scroller),
      heading: heading && rect(heading),
      active: document.activeElement && rect(document.activeElement),
      activeInside: dialog.contains(document.activeElement),
      scrollTarget: scroller ? { top: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight } : null,
    };
  });

const within = (r, vw, vh) => Boolean(r) && r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5;

for (const viewport of VIEWPORTS) {
  await page.setViewportSize(viewport);
  await page.goto(`${FRONT}/board/${boardId}`);
  await page.getByText('Short task', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add Task' }).click();
  await page.getByRole('dialog', { name: 'Create New Task' }).waitFor();
  await settle(page);

  const g = await drawerGeometry();
  const label = `at ${viewport.width}`;
  if (viewport.width < MD) {
    check(`${label}: the drawer is a bottom sheet, full width and anchored to the bottom`,
      Math.abs(g.box.left) < 1 && Math.abs(g.box.right - g.vw) < 1 && Math.abs(g.box.bottom - g.vh) < 1,
      `x ${Math.round(g.box.left)} to ${Math.round(g.box.right)}, bottom ${Math.round(g.box.bottom)} of ${g.vh}`);
    check(`${label}: the sheet leaves the top of the page visible`,
      g.box.top >= g.vh * 0.08 - 1,
      `top at ${Math.round(g.box.top)} of ${g.vh}`);
  } else {
    check(`${label}: the drawer is a side panel against the right edge`,
      Math.abs(g.box.right - g.vw) < 1 && g.box.left > 0 && Math.abs(g.box.top) < 1 && Math.abs(g.box.bottom - g.vh) < 1,
      `x ${Math.round(g.box.left)} to ${Math.round(g.box.right)}, y ${Math.round(g.box.top)} to ${Math.round(g.box.bottom)}`);
  }
  check(`${label}: the drawer does not scroll the page sideways`, g.pageWide <= 0, `overflows by ${g.pageWide}px`);
  check(`${label}: Save and Cancel are inside the viewport`,
    within(g.save, g.vw, g.vh) && within(g.cancel, g.vw, g.vh),
    `save ${g.save && Math.round(g.save.bottom)}, cancel ${g.cancel && Math.round(g.cancel.bottom)} of ${g.vh}`);

  // The body scrolls inside the panel and the actions do not move with it.
  const bottomBefore = g.save?.bottom;
  const scrolled = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const scroller = [...dialog.querySelectorAll('*')].find(
      el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1
    );
    if (!scroller) return null;
    scroller.scrollTop = scroller.scrollHeight;
    return scroller.scrollTop;
  });
  if (viewport.height <= 844) {
    check(`${label}: the form scrolls inside the panel`, scrolled !== null && scrolled > 0, `scrollTop ${scrolled}`);
  }
  const after = await drawerGeometry();
  check(`${label}: the title and the actions stay put while the form scrolls`,
    within(after.heading, after.vw, after.vh) &&
      within(after.save, after.vw, after.vh) &&
      Math.abs(after.save.bottom - bottomBefore) < 1,
    `save bottom ${bottomBefore && Math.round(bottomBefore)} before, ${after.save && Math.round(after.save.bottom)} after`);

  // The on-screen keyboard takes roughly half of a phone's height. Resizing
  // the viewport is how a browser that resizes its layout viewport reports
  // it, and dynamic viewport units follow.
  if (viewport.width < MD) {
    const keyboardHeight = Math.round(viewport.height * 0.5);
    await page.setViewportSize({ width: viewport.width, height: keyboardHeight });
    await page.getByRole('textbox', { name: /^Title/ }).focus();
    await page.waitForTimeout(300);
    const k = await drawerGeometry();
    check(`${label}: with half the height gone the sheet fits and the actions stay reachable`,
      k.box.top >= -0.5 && k.box.bottom <= k.vh + 0.5 && within(k.save, k.vw, k.vh) && within(k.cancel, k.vw, k.vh),
      `sheet y ${Math.round(k.box.top)} to ${Math.round(k.box.bottom)} of ${k.vh}`);
    check(`${label}: the focused field is on screen`, within(k.active, k.vw, k.vh), `field y ${k.active && Math.round(k.active.top)} to ${k.active && Math.round(k.active.bottom)}`);
  }

  // Dialog semantics survive the layout change.
  await page.setViewportSize(viewport);
  check(`${label}: focus is inside the dialog`, (await drawerGeometry()).activeInside);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(`${label}: Escape closes it and focus returns to the control that opened it`,
    await page.evaluate(() => /add task/i.test(document.activeElement?.textContent ?? '')));
}

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
