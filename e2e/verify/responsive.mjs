// Every main surface, measured on a rendered page at five widths.
//
// What a phone user meets is a fact about computed layout, which no layer
// below a real browser produces: jsdom loads no stylesheet, so a component
// test sees that a breakpoint class is present and never that it fixed
// anything. A modal footer that pushes a button off the screen, a header
// whose actions overlap its title, or a control smaller than a fingertip
// would each pass every unit test in the repository.
//
// Per surface and per width the script asserts:
//
//   - the document does not scroll sideways
//   - no control is cut off by a box that does not scroll, and none sits
//     outside the viewport (a control inside a scrolling region is reachable
//     by scrolling it, so it is measured where it is visible)
//   - no two controls overlap, apart from a button deliberately placed inside
//     the field it belongs to and controls on different layers (a menu or a
//     dialog over the page behind it)
//   - every control is at least 24 by 24 pixels (WCAG 2.5.8), inline links in
//     running text excepted, as the criterion does
//   - a page title keeps a readable width, so a header never "fits" by crushing it
//   - text clipped with an ellipsis or a line clamp can still be read in full
//     through a title
//
// Then the task modal, which is a different shape of claim: below the medium
// breakpoint it is a bottom sheet and above it a centered dialog, its actions stay
// inside the viewport while its body scrolls, and shrinking the viewport the
// way an on-screen keyboard does keeps the actions and the focused field on
// screen.
//
// What is asserted is behaviour rather than coordinates, so a redesign that
// changes colours, spacing or type does not break it.

import { chromium } from 'playwright';
import { settled } from './observe.mjs';

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

/** The small breakpoint, where the registration name fields share a row. */
const SMALL = 640;

/** The medium breakpoint: the task modal is a bottom sheet strictly below it. */
const MD = 768;

/** The large breakpoint: from here up the sidebar is a column, below it a panel. */
const LARGE = 1024;

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

/** A page with no session, for the pages only a signed out visitor reaches. */
const anonPage = await (await browser.newContext({ viewport: VIEWPORTS[1] })).newPage();
/** A page signed in through the interface, so the session is a real one. */
const page = await (await browser.newContext({ viewport: VIEWPORTS[4] })).newPage();

await page.goto(`${FRONT}/login`);
const form = page.locator('form').first();
await form.getByLabel('Email address', { exact: true }).fill(user.email);
await form.getByLabel('Password', { exact: true }).fill(user.password);
await form.getByRole('button', { name: /sign in/i }).click();
await page.getByText('Your boards').waitFor();

const settle = async target => {
  await target.waitForLoadState('networkidle').catch(() => {});
  await settled(target, { label: 'the page to stop animating before it is measured' });
};

/**
 * Resolves once the dialog has stopped animating: no CSS animation or
 * transition running in it and none of its inline styles still being rewritten,
 * which is how the panel's slide is drawn. A box compared over a count of
 * frames reads a panel that is still sliding whenever a frame takes long, and
 * reports its box a pixel short of the edge.
 */
const dialogStill = target =>
  settled(target, { within: '[role="dialog"]', label: 'the dialog to stop moving' });

/**
 * Everything the assertions need, read in one round trip.
 *
 * It runs in the page, so it cannot import anything: the clipping model is
 * written out here and kept deliberately small. A control's visible box is
 * its own box cut by every ancestor that clips. An ancestor that scrolls
 * (`auto` or `scroll`) only hides what can be scrolled to, which is fine. An
 * ancestor with `overflow: hidden` that removes part of the control is a
 * defect, because nothing can ever bring it back.
 */
const audit = target =>
  target.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const doc = document.documentElement;

    const CONTROLS = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="option"]',
      '[role="combobox"]',
    ].join(',');

    const intersect = (a, b) => {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const describe = el => {
      const name =
        el.getAttribute('aria-label') ||
        el.getAttribute('name') ||
        el.getAttribute('placeholder') ||
        el.textContent.trim().replace(/\s+/g, ' ');
      return `${el.tagName.toLowerCase()}${name ? ` "${name.slice(0, 32)}"` : ''}`;
    };

    const measured = [];
    const problems = { clipped: [], outside: [], small: [], overlap: [], truncated: [] };

    for (const el of document.querySelectorAll(CONTROLS)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const own = el.getBoundingClientRect();
      // Visually hidden inputs (sr-only, 1 pixel) are measured through their
      // visible label, not on their own.
      if (own.width <= 1 || own.height <= 1) continue;

      let visible = {
        left: own.left,
        top: own.top,
        right: own.right,
        bottom: own.bottom,
        width: own.width,
        height: own.height,
      };
      let absolute = style.position === 'absolute';
      let fixed = style.position === 'fixed';
      let clippedBy = null;

      for (let node = el.parentElement; node && !fixed; node = node.parentElement) {
        const ancestor = getComputedStyle(node);
        if (absolute && ancestor.position === 'static' && ancestor.transform === 'none') continue;
        absolute = ancestor.position === 'absolute';
        if (ancestor.position === 'fixed') {
          // Fixed ancestors are the end of the walk: nothing above them clips.
          fixed = true;
        }
        const clipsX = ancestor.overflowX !== 'visible';
        const clipsY = ancestor.overflowY !== 'visible';
        if (!clipsX && !clipsY) continue;
        const box = node.getBoundingClientRect();
        const before = visible;
        const cut = intersect(visible, {
          left: clipsX ? box.left : -Infinity,
          right: clipsX ? box.right : Infinity,
          top: clipsY ? box.top : -Infinity,
          bottom: clipsY ? box.bottom : Infinity,
        });
        if (cut.width <= 0 || cut.height <= 0) {
          visible = null;
          break;
        }
        const hidesX = ancestor.overflowX === 'hidden' && cut.width < before.width - 2;
        const hidesY = ancestor.overflowY === 'hidden' && cut.height < before.height - 2;
        if (hidesX || hidesY) clippedBy = clippedBy ?? describe(node);
        visible = cut;
      }
      // Scrolled out of a scrolling region: reachable by scrolling it.
      if (!visible) continue;

      const dialog = el.closest('[role="dialog"]');
      // A toast is a layer of its own: it floats over the page by design, so
      // what it covers is not an overlap between controls.
      const layer = el.closest('[role="dialog"],[role="menu"],[role="status"]');
      measured.push({ el, visible, layer });

      if (clippedBy) problems.clipped.push(`${describe(el)} is cut off by ${clippedBy}`);
      if (visible.left < -0.5 || visible.right > vw + 0.5) {
        problems.outside.push(
          `${describe(el)} spans x ${Math.round(visible.left)} to ${Math.round(visible.right)} in a ${vw}px viewport`
        );
      }
      // A dialog is fixed to the viewport, so what is visible of it must be
      // inside it vertically too. The page behind it may scroll.
      if (dialog && (visible.top < -0.5 || visible.bottom > vh + 0.5)) {
        problems.outside.push(
          `${describe(el)} spans y ${Math.round(visible.top)} to ${Math.round(visible.bottom)} in a ${vh}px viewport`
        );
      }

      // Target size. A checkbox or radio is pressed through its label.
      let width = own.width;
      let height = own.height;
      if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type) && el.labels?.length) {
        const label = el.labels[0].getBoundingClientRect();
        width = Math.max(width, label.width);
        height = Math.max(height, label.height);
      }
      // A link or button set in the middle of a sentence is exempt, as WCAG
      // 2.5.8 exempts it: its size is the size of the text around it.
      const inRunningText =
        style.display.startsWith('inline') &&
        [...el.parentElement.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const inline = inRunningText || (style.display === 'inline' && el.tagName === 'A');
      if (!inline && (width < 24 - 0.5 || height < 24 - 0.5)) {
        problems.small.push(`${describe(el)} is ${Math.round(width)}x${Math.round(height)}`);
      }
    }

    for (let i = 0; i < measured.length; i += 1) {
      for (let j = i + 1; j < measured.length; j += 1) {
        const a = measured[i];
        const b = measured[j];
        if (a.layer !== b.layer) continue;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const both = intersect(a.visible, b.visible);
        if (both.width <= 2 || both.height <= 2) continue;
        // A button placed inside the field it belongs to, such as a password
        // toggle, is the one intended overlap.
        const field = x => x instanceof HTMLInputElement || x instanceof HTMLTextAreaElement;
        const inside = (inner, outer) =>
          inner.left >= outer.left - 1 &&
          inner.right <= outer.right + 1 &&
          inner.top >= outer.top - 1 &&
          inner.bottom <= outer.bottom + 1;
        if (field(a.el) && inside(b.visible, a.visible)) continue;
        if (field(b.el) && inside(a.visible, b.visible)) continue;
        problems.overlap.push(`${describe(a.el)} overlaps ${describe(b.el)} by ${Math.round(both.width)}x${Math.round(both.height)}`);
      }
    }

    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      const ellipsis = style.textOverflow === 'ellipsis' && style.overflow !== 'visible';
      const clamp = style.webkitLineClamp && style.webkitLineClamp !== 'none';
      if (!ellipsis && !clamp) continue;
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) continue;
      if (el.closest('[title]') || el.closest('[aria-label]')) continue;
      problems.truncated.push(`${describe(el)} is cut short and has no title`);
    }

    const headline = document.querySelector('header h1');
    return {
      pageWide: doc.scrollWidth - doc.clientWidth,
      headlineWidth: headline ? Math.round(headline.getBoundingClientRect().width) : null,
      problems,
    };
  });

/** Assert one surface at the current width. */
const scanSurface = async (target, surface, width) => {
  await settle(target);
  const found = await audit(target);
  const where = `${surface} at ${width}`;
  check(`${where}: the page does not scroll sideways`, found.pageWide <= 0, `overflows by ${found.pageWide}px`);
  // Nothing overlaps or leaves the screen when a title is squeezed to a
  // sliver, so the other assertions cannot see it: a header that fits by
  // reducing its title to a column of single letters is still a broken header.
  if (found.headlineWidth !== null) {
    check(`${where}: the page title keeps a readable width`, found.headlineWidth >= 120, `title is ${found.headlineWidth}px wide`);
  }
  const rules = {
    clipped: 'no control is cut off',
    outside: 'every control is inside the viewport',
    overlap: 'no controls overlap',
    small: 'every control is at least 24x24',
    truncated: 'clipped text can be read in full',
  };
  for (const [key, label] of Object.entries(rules)) {
    const list = [...new Set(found.problems[key])];
    check(`${where}: ${label}`, list.length === 0, list.slice(0, 4).join('; '));
  }
};

/**
 * Opens the sidebar where it is a panel, and does nothing where it is a column.
 * The header's menu button is on screen only below the large breakpoint, so
 * whether it is visible is the question to ask, not the viewport width.
 */
const openNavigation = async () => {
  const button = page.getByRole('button', { name: 'Open navigation' });
  if (!(await button.isVisible())) return;
  await button.click();
  await page.getByRole('dialog', { name: 'Navigation' }).waitFor();
  await settle(page);
};

const openMoveMenu = async () => {
  await page.getByRole('button', { name: /^Move .* to another column$/ }).first().click();
  await page.getByRole('menu').waitFor();
};

const authed = [
  {
    name: 'dashboard',
    open: async () => {
      await page.goto(`${FRONT}/`);
      await page.getByText('Your boards').waitFor();
    },
  },
  {
    name: 'dashboard, create board modal',
    open: async () => {
      await page.goto(`${FRONT}/`);
      await page.getByText('Your boards').waitFor();
      // The view's own button in the header, which is on screen at every width.
      // The sidebar's plus button opens the same dialog but is not on screen
      // while the sidebar is a closed panel.
      await page.getByRole('button', { name: 'New board' }).first().click();
      await page.getByRole('dialog', { name: 'Create New Board' }).waitFor();
    },
  },
  {
    name: 'dashboard, add members modal',
    open: async () => {
      await page.goto(`${FRONT}/`);
      await page.getByText('Your boards').waitFor();
      await page.getByRole('button', { name: /^Options for / }).first().click();
      await page.getByRole('button', { name: 'Add Member' }).click();
      await page.getByRole('dialog', { name: 'Add Members' }).waitFor();
    },
  },
  {
    name: 'dashboard, account menu',
    open: async () => {
      await page.goto(`${FRONT}/`);
      await page.getByText('Your boards').waitFor();
      await openNavigation();
      await page.getByRole('button', { name: /^Account menu/ }).click();
      await page.getByRole('menu').waitFor();
    },
  },
  {
    // Below the large breakpoint the sidebar is a panel that is closed until
    // the header's button opens it, so this is the surface where its contents
    // are measured: every control in it must fit, clear its neighbours and be
    // large enough to press. At and above the breakpoint it is a column of
    // every other surface and needs no surface of its own.
    name: 'dashboard, navigation panel',
    below: LARGE,
    open: async () => {
      await page.goto(`${FRONT}/`);
      await page.getByText('Your boards').waitFor();
      await openNavigation();
    },
  },
  {
    name: 'board',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByRole('region', { name: 'Board columns' }).waitFor();
      await page.getByText('Short task', { exact: true }).waitFor();
    },
  },
  {
    // Home, Boards and the board's name share the strip with the menu button
    // and the header's action. Below the small breakpoint Home is an icon and
    // Boards is left out, because the name would otherwise have no width. The name is the one entry that may give way,
    // and it gives way by truncating with its full text in `title`; the two
    // links stay whole, as tall as a touch target below the large breakpoint,
    // and inside the navigation.
    name: 'board, breadcrumb',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByText('Short task', { exact: true }).waitFor();
      const width = page.viewportSize().width;
      const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
      const box = await crumbs.evaluate(nav => {
        const rect = el => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) };
        };
        const name = nav.querySelector('[aria-current="page"]');
        return {
          nav: rect(nav),
          links: [...nav.querySelectorAll('a')].filter(a => a.getBoundingClientRect().width > 0).map(a => ({ text: a.textContent.trim(), ...rect(a), wide: a.scrollWidth > a.clientWidth })),
          name: { ...rect(name), clipped: name.scrollWidth > name.clientWidth, title: name.getAttribute('title') },
        };
      });
      check(`board breadcrumb at ${width}: ${width >= SMALL ? 'Home and Boards are both links' : 'Home is the one link, Boards is left out'}`, box.links.map(l => l.text).join('|'), width >= SMALL ? 'Home|Boards' : 'Home');
      check(
        `board breadcrumb at ${width}: both links are whole and inside the navigation`,
        box.links.every(l => !l.wide && l.right <= box.nav.right + 8 && l.left >= box.nav.left - 8),
        JSON.stringify(box.links)
      );
      check(
        `board breadcrumb at ${width}: both links are ${width >= LARGE ? 32 : 44} pixels tall`,
        box.links.every(l => l.height === (width >= LARGE ? 32 : 44)),
        JSON.stringify(box.links.map(l => l.height))
      );
      check(
        `board breadcrumb at ${width}: the board name is the entry that gives way, stays at least 48 pixels wide and says so in full`,
        box.name.right <= box.nav.right + 1 && box.name.right - box.name.left >= 48 && (box.name.clipped || width >= MD) && box.name.title.startsWith('A board with'),
        JSON.stringify(box.name)
      );
    },
  },
  {
    name: 'board, move menu',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByText('Short task', { exact: true }).waitFor();
      await openMoveMenu();
    },
  },
  {
    name: 'board, edit board dialog',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByText('Short task', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Options for / }).click();
      await page.getByRole('menuitem', { name: 'Edit board' }).click();
      await page.getByRole('dialog', { name: 'Edit Board' }).waitFor();
      await page.getByRole('radio').first().waitFor({ state: 'attached' });
    },
  },
  {
    name: 'board, delete confirmation',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByText('Short task', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Options for / }).click();
      await page.getByRole('menuitem', { name: 'Delete board' }).click();
      await page.getByRole('dialog', { name: 'Delete this board?' }).waitFor();
    },
  },
  {
    name: 'dashboard, undo toast',
    open: async () => {
      // A board of its own to delete, so the one every other surface measures
      // is still there. Created through the API and found by its title.
      const title = `Throwaway ${Date.now()}`;
      await req('POST', '/boards', token, {
        title,
        description: 'deleted to put the undo toast on screen',
        color: boardColors.body.data[0]._id,
        template: templates.body.data[0]._id,
      });
      await page.goto(`${FRONT}/`);
      // The sidebar lists the board as well as the tile.
      await page.getByRole('link', { name: title }).first().waitFor();
      await page.getByRole('button', { name: `Options for ${title}` }).click();
      await page.getByRole('button', { name: /^Delete$/ }).click();
      await page.getByRole('dialog', { name: 'Delete this board?' }).getByRole('button', { name: 'Delete board' }).click();
      await page.getByTestId('toast').waitFor();
    },
  },
  {
    // The composer at the foot of a column, open with a title typed in it. It
    // is the way a card is made, so it has to fit and clear its neighbours at
    // every width, including a column in the middle of a row that scrolls.
    name: 'board, card composer open',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByText('Short task', { exact: true }).waitFor();
      await page.getByRole('button', { name: /^Add a card to / }).first().click();
      await page.getByRole('textbox', { name: /new card in/i }).fill('A card half typed');
    },
  },
  {
    name: 'board, edit task modal',
    open: async () => {
      await page.goto(`${FRONT}/board/${boardId}`);
      await page.getByText('Short task', { exact: true }).waitFor();
      await page.getByText('Short task', { exact: true }).click();
      await page.getByRole('dialog', { name: 'Edit Task' }).waitFor();
    },
  },
  {
    name: 'unknown address, signed in',
    open: async () => {
      await page.goto(`${FRONT}/no/such/page`);
      await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
    },
  },
  {
    name: 'board not found',
    open: async () => {
      await page.goto(`${FRONT}/board/${'0'.repeat(24)}`);
      await page.getByRole('heading', { level: 1, name: 'Board not found' }).waitFor();
    },
  },
  {
    name: 'profile',
    open: async () => {
      await page.goto(`${FRONT}/profile`);
      await page.getByText('Profile Settings').waitFor();
    },
  },
  {
    name: 'profile, saved modal',
    open: async () => {
      await page.goto(`${FRONT}/profile`);
      await page.getByText('Profile Settings').waitFor();
      // Saving is disabled until the form is dirty.
      await page.getByLabel('First Name').fill(`Responsive${Date.now() % 1000}`);
      await page.getByRole('button', { name: /^Save/ }).first().click();
      await page.getByRole('dialog').waitFor();
    },
  },
];

const anonymous = [
  {
    name: 'login',
    open: async () => {
      await anonPage.goto(`${FRONT}/login`);
      await anonPage.waitForSelector('form');
    },
  },
  {
    name: 'login, forgot password',
    open: async () => {
      await anonPage.goto(`${FRONT}/login`);
      await anonPage.waitForSelector('form');
      await anonPage.getByRole('button', { name: 'Forgot it?' }).click();
      await anonPage.getByRole('dialog').waitFor();
    },
  },
  {
    // The confirmation replaces the form inside the dialog, so it is a layout
    // of its own: a sentence that wraps around an address of any length, and
    // one button.
    name: 'login, forgot password confirmation',
    open: async () => {
      await anonPage.goto(`${FRONT}/login`);
      await anonPage.waitForSelector('form');
      await anonPage.getByRole('button', { name: 'Forgot it?' }).click();
      const dialog = anonPage.getByRole('dialog', { name: 'Forgot password' });
      await dialog.getByLabel('Email address').fill('a.very.long.address.nobody.owns@example.test');
      await dialog.getByRole('button', { name: 'Send reset link' }).click();
      await dialog.getByRole('status').waitFor();
    },
  },
  {
    name: 'reset password',
    open: async () => {
      await anonPage.goto(`${FRONT}/reset-password#token=${'a'.repeat(64)}`);
      await anonPage.getByRole('heading', { level: 1, name: 'Choose a new password' }).waitFor();
    },
  },
  {
    name: 'reset password, link cannot be used',
    open: async () => {
      await anonPage.goto(`${FRONT}/reset-password`);
      await anonPage.getByRole('heading', { level: 1, name: 'This link cannot be used' }).waitFor();
    },
  },
  {
    name: 'register',
    open: async () => {
      await anonPage.goto(`${FRONT}/register`);
      await anonPage.waitForSelector('form');
    },
  },
  {
    name: 'unknown address, signed out',
    open: async () => {
      await anonPage.goto(`${FRONT}/no/such/page`);
      await anonPage.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor();
    },
  },
  {
    name: 'register, terms modal',
    open: async () => {
      await anonPage.goto(`${FRONT}/register`);
      await anonPage.waitForSelector('form');
      await anonPage.getByRole('button', { name: 'Terms of Service', exact: true }).click();
      await anonPage.getByRole('dialog').waitFor();
      await anonPage.getByRole('dialog').getByText(/\S{4,}/).first().waitFor();
    },
  },
];

for (const viewport of VIEWPORTS) {
  log(`\n--- ${viewport.width} by ${viewport.height} ---`);
  await page.setViewportSize(viewport);
  await anonPage.setViewportSize(viewport);

  for (const surface of authed) {
    if (surface.below !== undefined && viewport.width >= surface.below) continue;
    await surface.open();
    await scanSurface(page, surface.name, viewport.width);
  }
  for (const surface of anonymous) {
    await surface.open();
    await scanSurface(anonPage, surface.name, viewport.width);

    if (surface.name === 'register') {
      // The two name fields share a row from the small breakpoint up and take
      // a row each below it, where half of a phone's width is too narrow to
      // read what was typed.
      const names = await anonPage.evaluate(() =>
        ['firstName', 'lastName'].map(name => {
          const box = document.querySelector(`input[name="${name}"]`).getBoundingClientRect();
          return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width) };
        })
      );
      const sideBySide = names[0].top === names[1].top;
      check(
        `register at ${viewport.width}: the name fields ${viewport.width >= SMALL ? 'share a row' : 'stack'}`,
        sideBySide === viewport.width >= SMALL,
        `first at ${names[0].left},${names[0].top} and ${names[0].width}px wide, last at ${names[1].left},${names[1].top}`
      );
    }
  }
}

log('\n--- the task modal is a bottom sheet on a phone and a centered dialog from the medium breakpoint ---');

/** Geometry of the open modal, its header strip and its actions, read in one round trip. */
const modalGeometry = () =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = dialog.getBoundingClientRect();
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const buttons = [...dialog.querySelectorAll('button')];
    const save = dialog.querySelector('button[type="submit"]');
    const blow = buttons.find(b => /blow it away/i.test(b.textContent));
    const close = buttons.find(b => b.getAttribute('aria-label') === 'Close');
    const strip = dialog.firstElementChild.getBoundingClientRect();
    const moves = [...dialog.querySelectorAll('[role="group"] [aria-pressed]')];
    const smallest = Math.min(...moves.map(b => Math.min(b.offsetWidth, b.offsetHeight)));
    const scroller = [...dialog.querySelectorAll('*')].find(
      el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1
    );
    // The header strip stands for the title: the dialog's own h2 is visually
    // hidden, and a visually hidden box sits one pixel outside its parent.
    const heading = dialog.firstElementChild;
    return {
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height },
      pageWide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      save: save && rect(save),
      blow: blow && rect(blow),
      close: close && rect(close),
      strip: { top: strip.top, bottom: strip.bottom, height: strip.height },
      moveButtons: {
        count: moves.length,
        pressed: moves.filter(b => b.getAttribute('aria-pressed') === 'true').length,
        smallest,
      },
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
  await page.getByText('Short task', { exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit Task' }).waitFor();
  await settle(page);
  await dialogStill(page);

  const g = await modalGeometry();
  const label = `at ${viewport.width}`;
  if (viewport.width < MD) {
    check(`${label}: the modal is a bottom sheet, full width and anchored to the bottom`,
      Math.abs(g.box.left) < 1 && Math.abs(g.box.right - g.vw) < 1 && Math.abs(g.box.bottom - g.vh) < 1,
      `x ${Math.round(g.box.left)} to ${Math.round(g.box.right)}, bottom ${Math.round(g.box.bottom)} of ${g.vh}`);
    check(`${label}: the sheet leaves the top of the page visible`,
      g.box.top >= g.vh * 0.08 - 1,
      `top at ${Math.round(g.box.top)} of ${g.vh}`);
  } else {
    check(`${label}: the modal is centered across the page, inside it, and no wider than its cap`,
      Math.abs((g.box.left + g.box.right) / 2 - g.vw / 2) < 1 &&
        g.box.left > 0 && g.box.right < g.vw &&
        g.box.right - g.box.left <= 673,
      `x ${Math.round(g.box.left)} to ${Math.round(g.box.right)} of ${g.vw}`);
    check(`${label}: the modal is centered down the page and inside it`,
      Math.abs(g.box.top - (g.vh - g.box.bottom)) < 1 && g.box.top >= 0 && g.box.bottom <= g.vh,
      `y ${Math.round(g.box.top)} to ${Math.round(g.box.bottom)} of ${g.vh}`);
    check(`${label}: it is not a sheet, so the rows below it are not covered by a flat bottom edge`,
      g.box.bottom < g.vh - 1,
      `bottom ${Math.round(g.box.bottom)} of ${g.vh}`);
  }
  check(`${label}: the modal does not scroll the page sideways`, g.pageWide <= 0, `overflows by ${g.pageWide}px`);
  check(`${label}: Done and Blow it away are inside the viewport`,
    within(g.save, g.vw, g.vh) && within(g.blow, g.vw, g.vh),
    `done ${g.save && Math.round(g.save.bottom)}, blow ${g.blow && Math.round(g.blow.bottom)} of ${g.vh}`);
  check(`${label}: the header strip is 100px and the close button is on it`,
    Math.abs(g.strip.height - 100) < 1 && g.close.top >= g.strip.top - 0.5 && g.close.bottom <= g.strip.bottom + 0.5,
    `strip ${Math.round(g.strip.height)}px, close y ${Math.round(g.close.top)} to ${Math.round(g.close.bottom)}`);
  check(`${label}: Move to has one pressed column and every column button is a target of 24px or more`,
    g.moveButtons.pressed === 1 && g.moveButtons.smallest >= 24 && (viewport.width >= MD || g.moveButtons.smallest >= 44),
    `pressed ${g.moveButtons.pressed}, smallest ${Math.round(g.moveButtons.smallest)}px over ${g.moveButtons.count}`);

  // The body scrolls inside the panel and the actions do not move with it.
  const bottomBefore = g.save?.bottom;
  const scrollTheForm = () =>
    page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const scroller = [...dialog.querySelectorAll('*')].find(
        el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1
      );
      if (!scroller) return null;
      scroller.scrollTop = scroller.scrollHeight;
      return scroller.scrollTop;
    });
  let scrolled = await scrollTheForm();
  if (scrolled === null && viewport.height <= 844) {
    // A form that fits has nothing to scroll, which says nothing about the
    // panel. How tall the form is depends on its header and its padding, so
    // the height is taken down until it overflows, and the body is asked to
    // scroll there.
    await page.setViewportSize({ width: viewport.width, height: 420 });
    await dialogStill(page);
    scrolled = await scrollTheForm();
    await page.setViewportSize(viewport);
    await dialogStill(page);
  }
  if (viewport.height <= 844) {
    check(`${label}: the form scrolls inside the panel`, scrolled !== null && scrolled > 0, `scrollTop ${scrolled}`);
  }
  const after = await modalGeometry();
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
    await dialogStill(page);
    const k = await modalGeometry();
    check(`${label}: with half the height gone the sheet fits and the actions stay reachable`,
      k.box.top >= -0.5 && k.box.bottom <= k.vh + 0.5 && within(k.save, k.vw, k.vh) && within(k.blow, k.vw, k.vh),
      `sheet y ${Math.round(k.box.top)} to ${Math.round(k.box.bottom)} of ${k.vh}`);
    check(`${label}: the focused field is on screen`, within(k.active, k.vw, k.vh), `field y ${k.active && Math.round(k.active.top)} to ${k.active && Math.round(k.active.bottom)}`);
  }

  // Dialog semantics survive the layout change.
  await page.setViewportSize(viewport);
  check(`${label}: focus is inside the dialog`, (await modalGeometry()).activeInside);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check(`${label}: Escape closes it and focus returns to the control that opened it`,
    // The control that opened it is the card's title button.
    await page.evaluate(() => document.activeElement?.dataset.taskOpen !== undefined && /short task/i.test(document.activeElement.textContent ?? '')));
}

log('\n--- on a touch screen nothing is hidden behind a hover ---');

// A phone has no hover, so a control that is transparent until the pointer
// is over its card is invisible there, and still pressable by accident.
const touchPage = await (
  await browser.newContext({ viewport: VIEWPORTS[1], hasTouch: true, isMobile: true })
).newPage();
await touchPage.goto(`${FRONT}/login`);
const touchForm = touchPage.locator('form').first();
await touchForm.getByLabel('Email address', { exact: true }).fill(user.email);
await touchForm.getByLabel('Password', { exact: true }).fill(user.password);
await touchForm.getByRole('button', { name: /sign in/i }).click();
await touchPage.getByText('Your boards').waitFor();
await settle(touchPage);

const touchSurfaces = [
  ['dashboard', `${FRONT}/`, () => touchPage.getByRole('button', { name: /^Options for / }).first().waitFor()],
  ['board', `${FRONT}/board/${boardId}`, () => touchPage.getByText('Short task', { exact: true }).waitFor()],
];
for (const [name, url, ready] of touchSurfaces) {
  await touchPage.goto(url);
  await ready();
  await settle(touchPage);
  const hidden = await touchPage.evaluate(() => {
    const found = [];
    for (const el of document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"]')) {
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      let opacity = 1;
      for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      if (opacity < 0.05) found.push(el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30));
    }
    return found;
  });
  check(`${name} on a touch screen: every control is visible`, hidden.length === 0, hidden.slice(0, 4).join('; '));
}

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
