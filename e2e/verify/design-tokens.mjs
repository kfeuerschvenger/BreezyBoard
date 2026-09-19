// Design tokens, checked on a rendered page rather than in the stylesheet.
//
// This script exists because of how finding P4-1 was actually caught. The
// code said `font-heading` in forty places and the stylesheet imported
// Inter, and both of those read as a working typography system. What was
// true was that Tailwind 4 has no implicit theme, so an undeclared token
// makes its utility a silent no-op, and the whole application rendered in
// the default sans stack. Nothing in the source says that. Only the
// computed style on a real page does.
//
// It also measures the colour contrast of the muted text and icon token
// rather than trusting a hex value copied out of a palette, because
// Tailwind 4 states its palette in oklch and the numbers are not the ones
// from version 3 that most contrast advice is written against.

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
// The webfont is fetched from Google, so the first paint can land before it
// arrives and report the fallback perfectly correctly.
await page.evaluate(() => document.fonts.ready);

log('--- the typography tokens resolve to a real family ---');

const usesInter = async selector =>
  page.evaluate(sel => {
    const element = document.querySelector(sel);
    if (!element) return 'no such element';
    return getComputedStyle(element).fontFamily.toLowerCase().includes('inter') ? 'Inter' : 'not Inter';
  }, selector);

check('body text resolves to Inter', await usesInter('body'), 'Inter');
check('a heading resolves to Inter', await usesInter('h1, h2, h3'), 'Inter');

// The tokens are what the classes point at. An element carrying one has to
// end up with the family rather than with whatever the browser defaults to,
// which is exactly what was not happening before the @theme block existed.
const tokenApplies = await page.evaluate(() => {
  const probe = document.createElement('span');
  probe.className = 'font-heading';
  probe.textContent = 'probe';
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family.toLowerCase().includes('inter') ? 'applied' : 'silently ignored';
});
check('the font-heading utility actually applies', tokenApplies, 'applied');

log('\n--- contrast of the muted text and icon colour ---');

// WCAG 1.4.3 wants 4.5:1 for normal text and 1.4.11 wants 3:1 for the
// meaningful parts of an icon. The muted grey is used for both, so the
// stricter of the two is the one that matters.
const measured = await page.evaluate(() => {
  // Every colour goes through a canvas rather than through a regular
  // expression. Tailwind 4 states its palette in oklch, so a computed colour
  // reads as `oklch(0.707 0.022 261.325)`, and a parser that assumes three
  // channels of 0 to 255 reads those numbers as an RGB triple and produces a
  // confident, meaningless answer. Painting one pixel and reading it back
  // costs nothing and is correct for any colour space the browser accepts.
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

  // The nearest ancestor that actually paints something, which is the
  // surface the text is read against. Walking up matters: the elements
  // carrying this colour sit on white cards over a grey page.
  const backgroundBehind = element => {
    for (let node = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor;
      const [r, g, b] = toRgb(value);
      const alpha = Number(value.match(/[\d.]+\s*\)$/)?.[0]?.replace(')', '') ?? '1');
      if (!value.startsWith('rgba(0, 0, 0, 0') && alpha !== 0) return [r, g, b];
    }
    return [255, 255, 255];
  };

  const sample = document.querySelector('.text-gray-400');
  if (!sample) return null;

  return {
    color: getComputedStyle(sample).color,
    contrast: ratio(toRgb(getComputedStyle(sample).color), backgroundBehind(sample)),
  };
});

if (measured) {
  log(`measured on a real element: text-gray-400 is ${measured.color}`);
  log(`          against the surface behind it: ${measured.contrast}:1`);
  log(`          ${measured.contrast >= 4.5 ? 'passes' : 'FAILS'} 1.4.3 for text (4.5:1)`);
  log(`          ${measured.contrast >= 3 ? 'passes' : 'FAILS'} 1.4.11 for icon parts (3:1)`);
} else {
  log('no element carrying text-gray-400 on this page');
}

log('\nReported rather than asserted. The colour is used in thirty five places for both text');
log('and icons, so the remedy is a decision per call site rather than a global swap, and it');
log('belongs with the component migration. Recorded here so the number comes from a');
log('measurement instead of from a palette table written for Tailwind 3.');

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
