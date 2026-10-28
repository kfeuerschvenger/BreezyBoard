// Captures the product screenshots and the landing demo used in the README.
//
// It drives a running stack that holds the demo workspace (`npm run seed:demo`
// in back/), takes each shot in a real browser, and writes two files per shot:
// the raw screenshot, and the same screenshot inside a browser frame. The hero
// slug records a video instead, which gif.mjs turns into a GIF and an MP4.
//
// Nothing is typed into the product except the sign in. Every dialog is closed
// with Cancel or Escape and never confirmed. The hero flow moves one card and
// puts it back through the API when it is done, so the demo data ends as it
// began.
//
// Usage, from e2e/ (set DEMO_PASSWORD to the password the demo was seeded with):
//   node showcase/capture.mjs                 every still
//   SLUGS=board,login node showcase/capture.mjs
//   node showcase/capture.mjs hero            the video, for gif.mjs (a slug may also be an argument)

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');

const BASE = (process.env.SHOWCASE_BASE ?? 'http://localhost:5173').replace(/\/$/, '');
const API = (process.env.SHOWCASE_API ?? 'http://localhost:5000/api/v1').replace(/\/$/, '');
const EMAIL = process.env.SHOWCASE_EMAIL ?? 'demo@breezyboard.local';
const PASSWORD = process.env.DEMO_PASSWORD ?? '';

/** Framed shots, which are committed. */
const OUT = process.env.SHOWCASE_OUT ? path.resolve(process.env.SHOWCASE_OUT) : path.join(REPO, 'docs', 'assets', 'screens');
/** Raw shots and the hero video, which are not. */
const WORK = path.join(here, 'out');

// 1600 by 1000 is the narrowest 16:10 window in which the four columns of a
// board and the sidebar fit side by side, so the last column is not cut off.
const VIEWPORT = { width: 1600, height: 1000 };
/** Raw shots are taken at twice the pixel density, for crisp text. */
const RAW_SCALE = 2;
/** The framed composite is rendered at this density. */
const FRAME_SCALE = Number(process.env.SHOWCASE_FRAME_SCALE ?? 1.25);

/**
 * The moment `new Date()` answers in the page. The greeting and the date on
 * the home page come from it, and a shot must not change with the hour it is
 * taken.
 *
 * Only the no-argument constructor is replaced. `Date.now()` stays real, because
 * the session schedules its expiry from it: with the whole clock set months back,
 * the deadline lies beyond what a timer can hold, the timer fires at once and the
 * page signs out.
 */
const FIXED_TIME = new Date('2026-03-10T10:30:00Z');

const FIXED_DATE_SCRIPT = fixed => {
  const RealDate = Date;
  window.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
  };
};

const BOARD_TITLE = 'Kite Festival 2026';
const HERO_CARD = 'Run the opening parade of dragon kites';
const HERO_FROM = 'Airborne';
const HERO_TO = 'Landed';

const log = (...parts) => console.log(...parts);

/** Opens a context the way every shot needs it: light, a fixed locale and zone. */
const openContext = (browser, options = {}) =>
  browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: RAW_SCALE,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    ...options,
  });

/** Hides the Breeze control, which is a setting and not a feature of the product tour. */
const hideBreeze = page =>
  page
    .locator('aside[aria-label="Sidebar"] div.rounded-card', { hasText: /Breeze/ })
    .evaluateAll(boxes => boxes.forEach(box => (box.style.display = 'none')));

/** Resolves when every finite animation has ended, so a shot is not taken mid entrance. */
const waitForCalm = page =>
  page.waitForFunction(
    () => document.getAnimations().every(animation => animation.effect?.getComputedTiming().iterations === Infinity || animation.playState !== 'running'),
    undefined,
    { timeout: 15_000 }
  );

/** Fails the shot when something loading or transient is still on screen. */
const assertClean = async page => {
  const busy = await page.locator('[aria-busy="true"], .animate-spin').count();
  if (busy > 0) throw new Error(`a loading indicator is still on screen (${busy})`);

  const toasts = await page.locator('[role="alert"]').count();
  if (toasts > 0) throw new Error(`a notice is on screen (${toasts})`);
};

/** Waits for the page to be still, takes it out of the pointer's way, and checks it is clean. */
const settle = async page => {
  await page.waitForLoadState('networkidle');
  await hideBreeze(page);
  await page.mouse.move(VIEWPORT.width / 2, 2);
  await waitForCalm(page);
  await page.waitForTimeout(400);
  await assertClean(page);
};

const signIn = async page => {
  await page.goto(`${BASE}/login`);
  const form = page.locator('form').first();
  await form.getByLabel('Email address', { exact: true }).fill(EMAIL);
  await form.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await form.getByRole('button', { name: /sign in/i }).click();
  await page.getByText('Your boards').waitFor({ timeout: 20_000 });
};

const openBoard = async (page, title) => {
  await page.goto(`${BASE}/`);
  await page.getByRole('main').getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('heading', { level: 2, name: HERO_TO, exact: true }).waitFor();
  await page.locator('[role="article"]').first().waitFor();
};

/** The inventory. A shot receives a signed in page, or a signed out one when `auth` is false. */
const SHOTS = [
  {
    slug: 'boards-overview',
    title: 'Home',
    auth: true,
    run: async page => {
      await page.goto(`${BASE}/`);
      await page.getByRole('main').getByRole('link', { name: BOARD_TITLE, exact: true }).waitFor();
      await settle(page);
    },
  },
  {
    slug: 'board',
    title: BOARD_TITLE,
    auth: true,
    run: async page => {
      await openBoard(page, BOARD_TITLE);
      await settle(page);
    },
  },
  {
    slug: 'task-detail',
    title: BOARD_TITLE,
    auth: true,
    // Tall enough for the whole dialog, so the checklist is not cut by its footer.
    viewport: { width: VIEWPORT.width, height: 1260 },
    run: async page => {
      await openBoard(page, BOARD_TITLE);
      await page.getByRole('heading', { level: 3, name: /Tie down the kites/ }).click();
      await page.getByRole('dialog', { name: 'Edit task' }).waitFor();
      await settle(page);
    },
    cleanup: page => page.keyboard.press('Escape'),
  },
  {
    slug: 'edit-columns',
    title: BOARD_TITLE,
    auth: true,
    viewport: { width: VIEWPORT.width, height: 1340 },
    run: async page => {
      await openBoard(page, BOARD_TITLE);
      await page.getByRole('button', { name: 'Add column' }).click();
      const dialog = page.getByRole('dialog', { name: 'Edit board' });
      await dialog.waitFor();
      // Opening the dialog focuses its new column field, which scrolls the list
      // to the bottom and draws a focus ring. Start from the top, unfocused.
      await dialog.getByRole('heading', { name: 'Edit board' }).click();
      await dialog.evaluate(element => {
        for (const node of element.querySelectorAll('*')) node.scrollTop = 0;
      });
      await settle(page);
    },
    cleanup: page => page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click(),
  },
  {
    slug: 'login',
    title: 'Sign in',
    auth: false,
    run: async page => {
      await page.goto(`${BASE}/login`);
      await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await settle(page);
    },
  },
];

/** Every slug that can be asked for: the stills and the hero video. */
const SLUGS = [...SHOTS.map(shot => shot.slug), 'hero'];

/** The slugs this run takes. The hero is only recorded when it is named. */
const selectSlugs = () => {
  const requested = [(process.env.SLUGS ?? ''), ...process.argv.slice(2)]
    .flatMap(list => list.split(','))
    .map(slug => slug.trim())
    .filter(Boolean);

  const unknown = requested.filter(slug => !SLUGS.includes(slug));
  if (unknown.length > 0) {
    throw new Error(`Unknown slug ${unknown.join(', ')}. Known slugs: ${SLUGS.join(', ')}`);
  }

  return requested.length > 0 ? requested : SHOTS.map(shot => shot.slug);
};

/** Puts a raw screenshot in the browser frame and returns the framed PNG. */
const frameShot = async (framePage, raw, { title, width }) => {
  await framePage.evaluate(shot => window.placeShot(shot), {
    src: `data:image/png;base64,${raw.toString('base64')}`,
    width,
    title,
  });
  return framePage.locator('#stage').screenshot({ type: 'png' });
};

const kilobytes = async file => `${Math.round((await stat(file)).size / 1024)} KB`;

const takeStill = async (shot, { authed, anonymous, framePage }) => {
  const page = shot.auth ? authed : anonymous;
  const viewport = shot.viewport ?? VIEWPORT;

  await page.setViewportSize(viewport);
  try {
    await shot.run(page);
    const raw = await page.screenshot({ type: 'png' });
    const framed = await frameShot(framePage, raw, { title: shot.title, width: viewport.width });

    await writeFile(path.join(WORK, `${shot.slug}.raw.png`), raw);
    await writeFile(path.join(OUT, `${shot.slug}.png`), framed);
  } finally {
    // A dialog left open would cover the next shot. Closing never confirms.
    await shot.cleanup?.(page).catch(() => {});
    await page.setViewportSize(VIEWPORT);
  }
};

/** Mirrors the card's position through the API, so the demo ends the way it began. */
const putCardBack = async (token, boardId) => {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const read = async route => (await (await fetch(`${API}${route}`, { headers })).json()).data;

  const board = await read(`/boards/${boardId}`);
  const list = await read(`/tasks/board/${boardId}`);

  const origin = board.columns.find(column => column.title === HERO_FROM);
  const card = list.find(task => task.title === HERO_CARD);
  if (!origin || !card) throw new Error('could not find the hero card to put it back');

  const first = list.find(task => task.status === origin._id && task._id !== card._id);
  const response = await fetch(`${API}/tasks/${card._id}/move`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: origin._id, beforeId: first?._id ?? null, afterId: null }),
  });
  if (!response.ok) throw new Error(`putting the card back answered ${response.status}`);
};

/** A dot that follows the pointer, since a recording does not show the system cursor. */
const CURSOR_SCRIPT = () => {
  window.addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;' +
      'background:rgb(15 27 45 / 0.85);border:3px solid #fff;box-shadow:0 2px 8px rgb(0 0 0 / 0.35);' +
      'pointer-events:none;z-index:2147483647;transition:transform 0.08s ease-out;transform:translate(-100px,-100px)';
    document.body.append(dot);
    window.addEventListener('mousemove', event => {
      dot.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    }, true);
    window.addEventListener('mousedown', () => (dot.style.scale = '0.8'), true);
    window.addEventListener('mouseup', () => (dot.style.scale = '1'), true);
  });
};

/**
 * The hero runs in the full Chromium build in its new headless mode, not in the
 * headless shell that Playwright launches by default. The shell rasterizes in
 * software and renders this board's drag at about 13 frames a second, which the
 * video shows as stutter. The full build renders at the display rate (60), and
 * the 25 frames a second the recorder keeps are all distinct. Stills do not
 * move, so they stay on the shell.
 */
const launchHeroBrowser = () => chromium.launch({ channel: 'chromium' });

const recordHero = async storageState => {
  const dir = path.join(WORK, 'video');
  await rm(dir, { recursive: true, force: true });

  const browser = await launchHeroBrowser();
  const context = await openContext(browser, {
    deviceScaleFactor: 1,
    storageState,
    recordVideo: { dir, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  await context.addInitScript(FIXED_DATE_SCRIPT, FIXED_TIME.getTime());

  const page = await context.newPage();
  const recordingStarted = Date.now();
  let boardId = '';
  let token = '';

  try {
    await openBoard(page, BOARD_TITLE);
    boardId = page.url().split('/').pop();
    token = (await page.evaluate(() => localStorage.getItem('token'))) ?? '';
    await settle(page);

    const card = page.locator('[role="article"]', { has: page.getByRole('heading', { level: 3, name: HERO_CARD }) });
    const handle = card.locator('[aria-label="Drag handle"]');
    const target = page.getByRole('heading', { level: 2, name: HERO_TO, exact: true });

    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('the card or the target column is not rendered');

    // The footage before this moment is the page loading, and gif.mjs cuts it.
    const startAt = (Date.now() - recordingStarted) / 1000 + 0.4;
    await page.waitForTimeout(1200);

    await page.mouse.move(from.x - 200, from.y + 60, { steps: 12 });
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2, { steps: 12 });
    // A hovered card lifts, which moves its handle: read it again once it rests.
    await page.waitForTimeout(500);
    const resting = await handle.boundingBox();
    const x0 = resting.x + resting.width / 2;
    const y0 = resting.y + resting.height / 2;
    await page.mouse.move(x0, y0, { steps: 4 });
    await page.waitForTimeout(250);
    const cardsBefore = await page.locator('[role="article"]').count();
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(x0 + 12, y0 + 12, { steps: 3 });
    await page
      .waitForFunction(
        // The drag overlay is a second card on the page while a drag is in flight.
        count => document.querySelectorAll('[role="article"]').length === count + 1,
        cardsBefore,
        { timeout: 8_000 }
      )
      .catch(() => {
        throw new Error(`the drag sensor did not pick the card up at ${Math.round(x0)},${Math.round(y0)}`);
      });

    // An eased path with the pointer events spread in time: the drag sensor
    // coalesces a burst of moves and never sees it start.
    const x1 = to.x + 90;
    const y1 = to.y + 250;
    const steps = 42;
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(x0 + 12 + (x1 - x0 - 12) * eased, y0 + 12 + (y1 - y0 - 12) * eased);
      await page.waitForTimeout(40);
    }
    await page
      .waitForFunction(
        name => [...document.querySelectorAll('[role="status"]')].some(node => node.textContent.includes(name)),
        HERO_TO,
        { timeout: 8_000 }
      )
      .catch(async () => {
        const announced = (await page.locator('[role="status"]').allInnerTexts()).join(' ').trim();
        throw new Error(`the drag never reached ${HERO_TO}; the drag sensor last said "${announced}"`);
      });
    await page.waitForTimeout(500);
    await page.mouse.up();

    // The card lands in the last column, and the count and the progress follow.
    await page.getByText(/6 of 13 landed/).waitFor();
    await page.waitForTimeout(2200);
    const endAt = (Date.now() - recordingStarted) / 1000;

    await page.mouse.move(VIEWPORT.width / 2, 2);
    await page.waitForTimeout(300);

    await context.close();
    const video = await page.video().path();
    await copyFile(video, path.join(WORK, 'hero.webm'));
    await writeFile(path.join(WORK, 'hero.json'), JSON.stringify({ start: Number(startAt.toFixed(2)), end: Number(endAt.toFixed(2)) }));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (token && boardId) await putCardBack(token, boardId);
  }
};

const main = async () => {
  if (PASSWORD.length === 0) {
    throw new Error('DEMO_PASSWORD is not set. Set it to the password the demo was seeded with (npm run seed:demo in back/).');
  }

  const slugs = selectSlugs();
  const stills = SHOTS.filter(shot => slugs.includes(shot.slug));

  await mkdir(WORK, { recursive: true });
  await mkdir(OUT, { recursive: true });
  await readFile(path.join(here, 'frame.html'));

  const browser = await chromium.launch();
  const failures = [];
  const report = (slug, ok, detail) => {
    log(`${ok ? 'OK  ' : 'FAIL'} ${slug}${detail ? `  ${detail}` : ''}`);
    if (!ok) failures.push(slug);
  };

  try {
    const frameContext = await browser.newContext({ viewport: { width: 2000, height: 1500 }, deviceScaleFactor: FRAME_SCALE });
    const framePage = await frameContext.newPage();
    await framePage.goto(pathToFileURL(path.join(here, 'frame.html')).href);

    const anonymousContext = await openContext(browser);
    const anonymous = await anonymousContext.newPage();

    const authedContext = await openContext(browser);
    await authedContext.addInitScript(FIXED_DATE_SCRIPT, FIXED_TIME.getTime());
    const authed = await authedContext.newPage();
    let storageState;

    if (stills.some(shot => shot.auth) || slugs.includes('hero')) {
      await signIn(authed);
      storageState = await authedContext.storageState();
    }

    for (const shot of stills) {
      try {
        await takeStill(shot, { authed, anonymous, framePage });
        report(shot.slug, true, await kilobytes(path.join(OUT, `${shot.slug}.png`)));
      } catch (error) {
        report(shot.slug, false, error.message.split('\n')[0]);
        // A failed shot may leave the page on a dialog or a half loaded route.
        await authed.keyboard.press('Escape').catch(() => {});
      }
    }

    if (slugs.includes('hero')) {
      try {
        await recordHero(storageState);
        report('hero', true, 'recorded, run gif.mjs to convert it');
      } catch (error) {
        report('hero', false, error.message.split('\n')[0]);
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    log(`\n${failures.length} failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  log('\nAll shots captured.');
};

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
