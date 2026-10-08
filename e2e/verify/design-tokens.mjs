// Design tokens, checked on a rendered page rather than in the stylesheet.
//
// Tailwind 4 has no implicit theme: an undeclared token makes its utility a
// silent no-op, and the page falls back to the browser default without any
// error. Nothing in the source says so. Only the computed style on a real
// page does, which is why every assertion here reads a rendered element, a
// loaded font face or a painted pixel.
//
// Colour contrast is measured on the rendered page as well, rather than read
// off a hex value in a palette table, because the tokens are stated in oklch
// and the numbers are not the ones most contrast advice is written against.

import { chromium } from 'playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';

const log = (...a) => console.log(...a);
const results = [];
const check = (label, got, expected) => {
  const ok = got === expected;
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${got} (expected ${expected})`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto(`${FRONT}/login`);
await page.waitForSelector('form');

log('--- the typography tokens resolve to a real family ---');

// The faces are self-hosted and split by unicode range, so a family is only
// fetched once something draws with it. Asking the font loader for each face
// forces the fetch and returns the faces that matched: an empty list means
// the family name resolves to nothing, which a computed style alone never
// reveals because it reports the declared stack, not what was drawn.
const faceLoads = async spec =>
  page.evaluate(async s => {
    const faces = await document.fonts.load(s);
    return faces.length > 0 && faces.every(f => f.status === 'loaded') ? 'loaded' : 'no face loaded';
  }, spec);

const familyOf = async selector =>
  page.evaluate(sel => {
    const element = document.querySelector(sel);
    return element ? getComputedStyle(element).fontFamily : 'no such element';
  }, selector);

const leads = (family, name) =>
  (family.split(',')[0] ?? '')
    .replace(/["']/g, '')
    .trim()
    .startsWith(name);

check('body text leads with Instrument Sans', leads(await familyOf('body'), 'Instrument Sans'), true);
check('a heading leads with Bricolage Grotesque', leads(await familyOf('h1, h2, h3'), 'Bricolage Grotesque'), true);
check('Inter is gone from the page', (await familyOf('body')).toLowerCase().includes('inter,'), false);

check('the display face loads from a real file', await faceLoads('700 24px "Bricolage Grotesque Variable"'), 'loaded');
check('the body face loads from a real file', await faceLoads('400 14px "Instrument Sans Variable"'), 'loaded');
check('the mono face loads at 400', await faceLoads('400 12px "DM Mono"'), 'loaded');
check('the mono face loads at 500', await faceLoads('500 12px "DM Mono"'), 'loaded');

// The tokens are what the classes point at. An element carrying one has to
// end up with the family rather than with whatever the browser defaults to.
const utilityFamily = className =>
  page.evaluate(cls => {
    const probe = document.createElement('span');
    probe.className = cls;
    probe.textContent = 'probe';
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    return family;
  }, className);

check('the font-heading utility applies', leads(await utilityFamily('font-heading'), 'Bricolage Grotesque'), true);
check('the font-body utility applies', leads(await utilityFamily('font-body'), 'Instrument Sans'), true);
// No component draws in the mono face yet, so Tailwind has generated no
// `font-mono` utility to probe. The token itself is what a later class or
// style reads, so the probe takes it through `var()`.
const monoFamily = await page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.fontFamily = 'var(--font-mono)';
  probe.textContent = 'probe';
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family;
});
check('the mono token resolves to DM Mono', leads(monoFamily, 'DM Mono'), true);

log('\n--- the global basics ---');

const basics = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const paint = value => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).join(',');
  };
  const token = name => root.getPropertyValue(name).replace(/\s/g, '');
  return {
    ground: paint(root.getPropertyValue('--color-ground').trim()),
    ink: paint(root.getPropertyValue('--color-ink').trim()),
    bodyBackground: paint(body.backgroundColor),
    bodyColor: paint(body.color),
    easing: token('--ease-standard'),
    exit: token('--ease-exit'),
    spring: token('--ease-spring'),
    hues: ['sky', 'teal', 'green', 'sand', 'coral', 'lavender'].map(h =>
      ['tint', 'deep', 'mid'].every(step => root.getPropertyValue(`--color-${h}-${step}`).trim() !== '')
    ),
  };
});
check('the page ground is the ground token', basics.bodyBackground, basics.ground);
check('the page text is the ink token', basics.bodyColor, basics.ink);
check('the standard easing is declared', basics.easing, 'cubic-bezier(0.2,0.8,0.2,1)');
check('the exit easing is declared', basics.exit, 'cubic-bezier(0.5,0,0.75,0)');
check('the spring easing is declared', basics.spring, 'cubic-bezier(0.3,1.4,0.5,1)');
check('all six hues declare a tint, a deep and a mid', basics.hues.every(Boolean), true);

log('\n--- contrast of the tertiary text token ---');

// Placeholders, eyebrow labels and timestamps are small text, so 1.4.3 asks
// for 4.5:1 on every surface they sit on: white, the page ground and each
// note tint. Every colour goes through a canvas, because the tokens are
// stated in oklch and a parser written for three channels of 0 to 255 reads
// them as an RGB triple and answers confidently and wrongly.
const tertiary = await page.evaluate(() => {
  const toRgb = cssColor => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };
  const channel = c => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => {
    const lighter = Math.max(luminance(a), luminance(b));
    const darker = Math.min(luminance(a), luminance(b));
    return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  };
  const root = getComputedStyle(document.documentElement);
  const text = toRgb(root.getPropertyValue('--color-ink-tertiary').trim());
  const surfaces = {
    white: toRgb(root.getPropertyValue('--color-surface').trim()),
    ground: toRgb(root.getPropertyValue('--color-ground').trim()),
  };
  // The note background of the reference design: lightness .955, chroma .035.
  for (const [name, hue] of [
    ['sky', 232],
    ['teal', 192],
    ['green', 150],
    ['sand', 82],
    ['coral', 38],
    ['lavender', 300],
  ]) {
    surfaces[`note ${name}`] = toRgb(`oklch(0.955 0.035 ${hue})`);
  }
  return Object.fromEntries(Object.entries(surfaces).map(([name, rgb]) => [name, ratio(text, rgb)]));
});

for (const [surface, value] of Object.entries(tertiary)) {
  check(`tertiary text on ${surface} is at least 4.5:1 (${value}:1)`, value >= 4.5, true);
}

log('\n--- the reduced motion policy ---');

// A person who asks the system for less motion gets animations and
// transitions collapsed to an instant. The collapse must not break what
// waits on an animation to finish: a dialog unmounts only after its exit
// completes, so a dialog that opens and then never leaves the page under
// this setting would be the failure to catch.
const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const calmPage = await calm.newPage();
await calmPage.goto(`${FRONT}/login`);
await calmPage.waitForSelector('form');

const collapsed = await calmPage.evaluate(() => {
  const probe = document.createElement('div');
  probe.style.transition = 'opacity 2s';
  probe.style.animation = 'spin 3s linear infinite';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const out = {
    transition: Number.parseFloat(style.transitionDuration) * (style.transitionDuration.endsWith('ms') ? 1 : 1000),
    animation: Number.parseFloat(style.animationDuration) * (style.animationDuration.endsWith('ms') ? 1 : 1000),
    iterations: style.animationIterationCount,
  };
  probe.remove();
  return out;
});
check('a 2s transition collapses to under 1ms', collapsed.transition < 1, true);
check('a 3s animation collapses to under 1ms', collapsed.animation < 1, true);
check('an infinite animation plays once', collapsed.iterations, '1');

await calmPage.getByRole('button', { name: /forgot password/i }).click();
const dialog = calmPage.getByRole('dialog');
await dialog.waitFor({ state: 'visible' });
check('a dialog opens under reduced motion', await dialog.isVisible(), true);
await calmPage.keyboard.press('Escape');
await dialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
check('the dialog unmounts after its exit under reduced motion', await dialog.count(), 0);

await calm.close();

const normal = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const normalPage = await normal.newPage();
await normalPage.goto(`${FRONT}/login`);
await normalPage.waitForSelector('form');
await normalPage.getByRole('button', { name: /forgot password/i }).click();
const normalDialog = normalPage.getByRole('dialog');
await normalDialog.waitFor({ state: 'visible' });
await normalPage.keyboard.press('Escape');
await normalDialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
check('the dialog unmounts after its exit with motion on', await normalDialog.count(), 0);
await normal.close();

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
