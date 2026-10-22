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
import {
  WAIT_MS,
  armAppearance,
  distinctMidTransforms,
  poll,
  readAppearance,
  settled,
  until,
} from './observe.mjs';

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
    .replaceAll(/["']/g, '')
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
    const sample = document.createElement('span');
    sample.className = cls;
    sample.textContent = 'probe';
    document.body.appendChild(sample);
    const family = getComputedStyle(sample).fontFamily;
    sample.remove();
    return family;
  }, className);

check('the font-heading utility applies', leads(await utilityFamily('font-heading'), 'Bricolage Grotesque'), true);
check('the font-body utility applies', leads(await utilityFamily('font-body'), 'Instrument Sans'), true);
// No component draws in the mono face yet, so Tailwind has generated no
// `font-mono` utility to probe. The token itself is what a later class or
// style reads, so the probe takes it through `var()`.
const monoFamily = await page.evaluate(() => {
  const sample = document.createElement('span');
  sample.style.fontFamily = 'var(--font-mono)';
  sample.textContent = 'probe';
  document.body.appendChild(sample);
  const family = getComputedStyle(sample).fontFamily;
  sample.remove();
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
  const token = name => root.getPropertyValue(name).replaceAll(/\s/g, '');
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

log('\n--- contrast of the colour pairs the primitives introduce ---');

// Each pair is [label, foreground, background, minimum]. A value that starts
// with `--` is read from `:root`, anything else is a CSS colour. Both go
// through a canvas so oklch and alpha are resolved by the browser: the
// background is painted over white first and the foreground over that, which
// is how a translucent border or fill actually meets the page.
const measurePairs = async (target, pairs) =>
  target.evaluate(list => {
    const root = getComputedStyle(document.documentElement);
    const resolve = value => (value.startsWith('--') ? root.getPropertyValue(value).trim() : value);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const flatten = (fg, bg) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      for (const layer of Array.isArray(bg) ? bg : [bg]) {
        ctx.fillStyle = resolve(layer);
        ctx.fillRect(0, 0, 1, 1);
      }
      const under = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
      ctx.fillStyle = resolve(fg);
      ctx.fillRect(0, 0, 1, 1);
      return { over: [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3), under };
    };
    const channel = c => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    return list.map(([label, fg, bg, minimum]) => {
      const { over, under } = flatten(fg, bg);
      const hi = Math.max(luminance(over), luminance(under));
      const lo = Math.min(luminance(over), luminance(under));
      return [label, Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, minimum];
    });
  }, pairs);

const reportPairs = async (target, pairs) => {
  for (const [label, value, minimum] of await measurePairs(target, pairs)) {
    check(`${label} is at least ${minimum}:1 (${value}:1)`, value >= minimum, true);
  }
};

await reportPairs(page, [
  ['field and control border on white', '--color-line-control', '--color-surface', 3],
  ['field and control border on the ground', '--color-line-control', '--color-ground', 3],
  ['focus colour on white', '--color-focus', '--color-surface', 3],
  ['focus colour on the ground', '--color-focus', '--color-ground', 3],
  ['white on the primary button fill', '#ffffff', '--color-ink', 4.5],
  ['white on the primary button hover fill', '#ffffff', '--color-ink-hover', 4.5],
  ['white on the danger button fill', '#ffffff', '--color-danger', 4.5],
  ['danger text on white', '--color-danger', '--color-surface', 4.5],
  ['danger text on its tint', '--color-danger', '--color-danger-bg', 4.5],
  ['field error text on white', '--color-danger-strong', '--color-surface', 4.5],
  ['field label on white', '--color-ink-secondary', '--color-surface', 4.5],
  ['field hint on white', '--color-ink-tertiary', '--color-surface', 4.5],
  ['ghost button text on its hover fill', '--color-ink-secondary', '--color-line-06', 4.5],
]);

log('\n--- the keyframes are declared ---');

const keyframeNames = await page.evaluate(() => {
  const names = new Set();
  const walk = rules => {
    for (const rule of rules) {
      if (rule instanceof CSSKeyframesRule) names.add(rule.name);
      else if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      // A cross origin sheet cannot be read, and there is none to read.
    }
  }
  return [...names];
});
for (const name of [
  'bbUp',
  'bbFade',
  'bbIn',
  'bbLand',
  'bbAway',
  'bbFlow',
  'bbDrift',
  'bbSway',
  'bbPop',
  'bbGap',
  'bbSpin',
  'bbShake',
  'bbToast',
]) {
  check(`the ${name} keyframes exist`, keyframeNames.includes(name), true);
}

log('\n--- the field frame, on a rendered input ---');

const fieldMetrics = async target =>
  target.evaluate(() => {
    const input = document.querySelector('form input');
    const style = getComputedStyle(input);
    return {
      height: style.height,
      radius: style.borderTopLeftRadius,
      fontSize: style.fontSize,
      border: style.borderTopColor,
    };
  });
const paintOf = async (target, cssColor) =>
  target.evaluate(value => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).join(',');
  }, cssColor);
const tokenValue = (target, name) =>
  target.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

const isIdentity = transform => transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';

const field = await fieldMetrics(page);
check('an input is 48 pixels tall', field.height, '48px');
check('an input has the field radius', field.radius, '14px');
check('an input reads 15 pixels', field.fontSize, '15px');
check(
  'an input at rest has the control border',
  await paintOf(page, field.border),
  await paintOf(page, await tokenValue(page, '--color-line-control'))
);

await page.locator('form input').first().focus();
await settled(page, { within: 'form', label: 'the focused input to finish its transition' });
const focusedField = await page.evaluate(() => {
  const style = getComputedStyle(document.activeElement);
  return { border: style.borderTopColor, shadow: style.boxShadow };
});
check(
  'a focused input swaps its border for the focus colour',
  await paintOf(page, focusedField.border),
  await paintOf(page, await tokenValue(page, '--color-focus'))
);
check('a focused input draws the halo', focusedField.shadow.includes('0px 0px 0px 4px'), true);

log('\n--- buttons and the focus ring, on a rendered dialog ---');

await page.getByRole('button', { name: 'Forgot it?' }).click();
const probeDialog = page.getByRole('dialog');
await probeDialog.waitFor({ state: 'visible' });
await settled(page, { within: '[role="dialog"]', label: 'the forgot password dialog to finish opening' });
const primary = probeDialog.getByRole('button', { name: 'Send reset link' });
const secondary = probeDialog.getByRole('button', { name: 'Cancel' });
const styleOf = (locator, props) =>
  locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map(name => [name, style[name]]));
  }, props);

const primaryStyle = await styleOf(primary, ['height', 'backgroundColor', 'borderTopLeftRadius', 'fontWeight']);
check('the primary button is 44 pixels tall', primaryStyle.height, '44px');
check('the primary button has the control radius', primaryStyle.borderTopLeftRadius, '12px');
check('the primary button is semibold', primaryStyle.fontWeight, '600');
check(
  'the primary button is filled with ink',
  await paintOf(page, primaryStyle.backgroundColor),
  await paintOf(page, await tokenValue(page, '--color-ink'))
);
const secondaryStyle = await styleOf(secondary, ['height', 'borderTopColor', 'borderTopWidth']);
check('the secondary button is 44 pixels tall', secondaryStyle.height, '44px');
check('the secondary button has a border', secondaryStyle.borderTopWidth !== '0px', true);

// The dialog opens with focus on its field, so the keyboard walks to the
// buttons from there. `focus-visible` only matches for a keyboard arrival.
await primary.focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
const ring = await styleOf(primary, ['outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor']);
check('a keyboard focused button draws a 2px solid outline', `${ring.outlineStyle} ${ring.outlineWidth}`, 'solid 2px');
check('the outline is offset from the button', ring.outlineOffset, '2px');
check(
  'the outline is the focus colour',
  await paintOf(page, ring.outlineColor),
  await paintOf(page, await tokenValue(page, '--color-focus'))
);
// The surface of the shared Modal.
const panelStyle = await styleOf(probeDialog, ['borderTopLeftRadius', 'boxShadow', 'backgroundColor']);
check('a dialog panel has the modal radius', panelStyle.borderTopLeftRadius, '26px');
check('a dialog panel casts the modal shadow', panelStyle.boxShadow.includes('0px 40px 80px -30px'), true);
check('a dialog panel is white', await paintOf(page, panelStyle.backgroundColor), '255,255,255');
const scrimStyle = await probeDialog
  .locator('xpath=preceding-sibling::*[1]')
  .evaluate(element => {
    const style = getComputedStyle(element);
    return { filter: style.backdropFilter, background: style.backgroundColor };
  });
check('the scrim blurs what is behind it by 6 pixels', scrimStyle.filter, 'blur(6px)');
check(
  'the scrim is the navy scrim token',
  await paintOf(page, scrimStyle.background),
  await paintOf(page, await tokenValue(page, '--color-scrim'))
);
const titleStyle = await styleOf(probeDialog.getByRole('heading'), ['fontFamily', 'fontWeight', 'fontSize']);
check('a dialog title is set in the display face', leads(titleStyle.fontFamily, 'Bricolage Grotesque'), true);
check('a dialog title is bold and 22 pixels', `${titleStyle.fontWeight} ${titleStyle.fontSize}`, '700 22px');
const closeButton = probeDialog.getByRole('button', { name: 'Close' });
const closeStyle = await styleOf(closeButton, ['width', 'height', 'borderTopLeftRadius']);
check('the close button is a 36 pixel circle', `${closeStyle.width} ${closeStyle.height} ${closeStyle.borderTopLeftRadius}`, '36px 36px 99px');
await closeButton.hover();
await settled(page, { within: '[role="dialog"]', label: 'the close glyph to finish turning' });
check('the close glyph turns a quarter on hover', (await styleOf(closeButton.locator('svg'), ['rotate'])).rotate, '90deg');
await page.mouse.move(2, 2);

await page.keyboard.press('Escape');
await probeDialog.waitFor({ state: 'detached', timeout: WAIT_MS }).catch(() => {});

log('\n--- the new primitives, rendered for real ---');

// No page uses the new primitives yet, and a utility class that is not in the
// stylesheet is a silent no-op, so jsdom cannot vouch for them. The page the
// dev server already serves is borrowed instead: the React and ReactDOM it
// loaded are found in the transformed entry module and imported by URL, so the
// primitives are rendered with the same instances, the same stylesheet and the
// same fonts as the application, with nothing added to the repository.
const mountPrimitives = async (target, build, args = {}) => {
  await target.evaluate(async ([source, buildArgs]) => {
    const entry = await (await fetch('/src/main.tsx')).text();
    const urlOf = name => new RegExp(`/node_modules/[.]vite/deps/${name}[.]js[?]v=[a-f0-9]+`).exec(entry)?.[0];
    const react = await import(urlOf('react'));
    const dom = await import(urlOf('react-dom_client'));
    const ui = await import('/src/shared/ui/index.ts'); // NOSONAR javascript:S6859 a URL served by the Vite dev server inside the page, not a filesystem path, so it carries the extension
    const createElement = react.createElement ?? react.default.createElement;
    const createRoot = dom.createRoot ?? dom.default.createRoot;

    document.getElementById('probe-host')?.remove();
    const host = document.createElement('div');
    host.id = 'probe-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:100;padding:24px;background:#fff;overflow:auto';
    document.body.appendChild(host);
    const root = createRoot(host);
    window.__probeRoot = root;
    // eslint-disable-next-line no-new-func
    root.render(
      new Function('ui', 'h', 'React', 'args', `return (${source})(ui, h, React, args)`)(ui, createElement, react.default ?? react, buildArgs) // NOSONAR javascript:S1523 evaluates only the probe source this script wrote, inside the verify page, never anything read from the application or from the network
    );
    // The render is scheduled, not synchronous: wait for the probe's first element.
    await new Promise((resolve, reject) => {
      const started = performance.now();
      const look = () => {
        if (host.firstElementChild) return resolve();
        if (performance.now() - started > 15000) return reject(new Error('the probe never rendered'));
        requestAnimationFrame(look);
      };
      look();
    });
  }, [build.toString(), args]);
  // An entrance or a transition on the probe has to be over before it is measured.
  await settled(target, { within: '#probe-host', label: 'the mounted probe to stop animating' });
};

const unmountPrimitives = async target =>
  target.evaluate(() => {
    window.__probeRoot?.unmount();
    document.getElementById('probe-host')?.remove();
  });

const probeText = (target, text, props) =>
  target.locator('#probe-host').getByText(text, { exact: true }).evaluate(
    (element, names) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(names.map(name => [name, style[name]]));
    },
    props
  );

const probe = (target, selector, props) =>
  target.locator(`#probe-host ${selector}`).first().evaluate(
    (element, names) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(names.map(name => [name, style[name]]));
    },
    props
  );

// Chip: every hue is its deep step on its tint, measured from what the
// browser painted rather than from the token table.
await mountPrimitives(page, (ui, h) =>
  h(
    'div',
    null,
    ['sky', 'teal', 'green', 'sand', 'coral', 'lavender'].map(hue =>
      h(ui.Chip, { key: hue, hue, 'data-hue': hue }, `Chip ${hue}`)
    ),
    h(ui.Chip, { hue: 'neutral' }, 'Chip neutral')
  )
);
for (const hue of ['sky', 'teal', 'green', 'sand', 'coral', 'lavender']) { // NOSONAR javascript:S9382 sequential on purpose: the probes share one page, and the checks are logged in order
  const painted = await probeText(page, `Chip ${hue}`, ['color', 'backgroundColor', 'borderTopLeftRadius', 'fontSize']); // NOSONAR javascript:S9382
  check(`the ${hue} chip text is its deep step`, await paintOf(page, painted.color), await paintOf(page, await tokenValue(page, `--color-${hue}-deep`))); // NOSONAR javascript:S9382
  check(`the ${hue} chip fill is its tint`, await paintOf(page, painted.backgroundColor), await paintOf(page, await tokenValue(page, `--color-${hue}-tint`))); // NOSONAR javascript:S9382
  await reportPairs(page, [[`the ${hue} chip text on its fill`, painted.color, painted.backgroundColor, 4.5]]); // NOSONAR javascript:S9382
}
const neutralChip = await probeText(page, 'Chip neutral', ['color', 'backgroundColor']);
await reportPairs(page, [['the neutral chip text on its fill', neutralChip.color, neutralChip.backgroundColor, 4.5]]);
const labelChip = await probeText(page, 'Chip sky', ['fontSize', 'fontWeight', 'borderTopLeftRadius']);
check('a label chip is 11.5 pixels, semibold and round', `${labelChip.fontSize} ${labelChip.fontWeight} ${labelChip.borderTopLeftRadius}`, '11.5px 600 99px');
await unmountPrimitives(page);

const focusRing = async (target, locator) => {
  await locator.focus();
  await target.keyboard.press('Shift+Tab');
  await target.keyboard.press('Tab');
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineOffset}`;
  });
};

// Switch
await mountPrimitives(page, (ui, h, React) => {
  const Harness = () => {
    const [on, setOn] = React.useState(false);
    return h(ui.Switch, { 'aria-label': 'Probe switch', checked: on, onCheckedChange: setOn });
  };
  return h(Harness);
});
const switchControl = page.locator('#probe-host [role="switch"]');
const offTrack = await probe(page, '[role="switch"]', ['width', 'height', 'backgroundColor', 'borderTopLeftRadius']);
check('a switch is 44 by 26', `${offTrack.width} ${offTrack.height}`, '44px 26px');
check('a switch track is fully round', offTrack.borderTopLeftRadius, '99px');
check(
  'an off switch is drawn with the control border colour',
  await paintOf(page, offTrack.backgroundColor),
  await paintOf(page, await tokenValue(page, '--color-line-control'))
);
const knobOff = await probe(page, '[role="switch"] span', ['width', 'height', 'translate', 'backgroundColor']);
check('the knob is a 20 pixel white circle at rest', `${knobOff.width} ${knobOff.height} ${knobOff.backgroundColor}`, '20px 20px rgb(255, 255, 255)');
check('the knob rests at the start of the track', knobOff.translate === 'none' || knobOff.translate === '0px', true);
await reportPairs(page, [
  ['an off switch track on white', offTrack.backgroundColor, '--color-surface', 3],
  ['the knob on an off track', '#ffffff', offTrack.backgroundColor, 3],
]);
check('a keyboard focused switch draws a 2px outline offset by 2px', await focusRing(page, switchControl), 'solid 2px 2px');
await page.keyboard.press('Space');
await settled(page, { within: '#probe-host', label: 'the switch to finish turning on' });
check('pressing Space turns the switch on', await switchControl.getAttribute('aria-checked'), 'true');
const onTrack = await probe(page, '[role="switch"]', ['backgroundColor']);
const knobOn = await probe(page, '[role="switch"] span', ['translate']);
check(
  'an on switch is drawn with the strong accent',
  await paintOf(page, onTrack.backgroundColor),
  await paintOf(page, await tokenValue(page, '--color-accent-strong'))
);
check('the knob travels 18 pixels when on', knobOn.translate, '18px');
await reportPairs(page, [
  ['an on switch track on white', onTrack.backgroundColor, '--color-surface', 3],
  ['the knob on an on track', '#ffffff', onTrack.backgroundColor, 3],
]);
await unmountPrimitives(page);

// Segmented control
await mountPrimitives(page, (ui, h, React) => {
  const Harness = () => {
    const [value, setValue] = React.useState('breezy');
    return h(ui.SegmentedControl, {
      label: 'Breeze',
      value,
      onChange: setValue,
      options: [
        { id: 'calm', label: 'Calm' },
        { id: 'breezy', label: 'Breezy' },
        { id: 'gusty', label: 'Gusty' },
      ],
    });
  };
  return h(Harness);
});
const frame = await probe(page, '[role="radiogroup"]', ['borderTopColor', 'backgroundColor', 'borderTopLeftRadius']);
check(
  'the segmented frame is drawn with the control border colour',
  await paintOf(page, frame.borderTopColor),
  await paintOf(page, await tokenValue(page, '--color-line-control'))
);
const selectedSegment = await probe(page, 'label:has(input:checked)', ['backgroundColor', 'color', 'boxShadow', 'height']);
const idleSegment = await probe(page, 'label:has(input:not(:checked))', ['backgroundColor', 'color']);
check('a segment is 28 pixels tall', selectedSegment.height, '28px');
check('the selected segment is white', await paintOf(page, selectedSegment.backgroundColor), '255,255,255');
check('the selected segment carries the ink ring', selectedSegment.boxShadow.includes('rgb(15, 27, 45)'), true);
check('an unselected segment is transparent', idleSegment.backgroundColor, 'rgba(0, 0, 0, 0)');
await reportPairs(page, [
  ['the segmented frame on white', frame.borderTopColor, '--color-surface', 3],
  ['the selected segment ring on its segment', '--color-ink', selectedSegment.backgroundColor, 3],
  ['selected segment text on white', selectedSegment.color, selectedSegment.backgroundColor, 4.5],
  ['an unselected segment text on the track', idleSegment.color, frame.backgroundColor, 4.5],
]);
await page.locator('#probe-host input:checked').focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
const ringOnSegment = await page
  .locator('#probe-host label:has(input:focus-visible)')
  .evaluate(label => {
    const style = getComputedStyle(label);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  })
  .catch(() => 'no segment has the keyboard');
check('the segment whose radio has the keyboard draws the focus ring', ringOnSegment, 'solid 2px');
await page.keyboard.press('ArrowRight');
check(
  'the right arrow selects the next segment in a real browser',
  await page.locator('#probe-host input:checked').evaluate(radio => radio.value),
  'gusty'
);
await page.keyboard.press('ArrowRight');
check('the arrows wrap from the last segment to the first', await page.locator('#probe-host input:checked').evaluate(radio => radio.value), 'calm');
await unmountPrimitives(page);

// Progress bar
await mountPrimitives(page, (ui, h) =>
  h(
    'div',
    { style: { width: 300 } },
    h(ui.ProgressBar, { value: 40, label: 'Probe six', size: 6, hue: 'sky' }),
    h('div', { style: { height: 12 } }),
    h(ui.ProgressBar, { value: 40, label: 'Probe eight', size: 8, variant: 'gradient', hue: 'sky', toHue: 'green' })
  )
);
const sixTrack = await probe(page, '[aria-label="Probe six"]', ['height', 'width']);
const eightTrack = await probe(page, '[aria-label="Probe eight"]', ['height']);
check('the small bar is 6 pixels', sixTrack.height, '6px');
check('the large bar is 8 pixels', eightTrack.height, '8px');
const sixFill = await probe(page, '[aria-label="Probe six"] div', ['width', 'backgroundColor', 'transitionProperty', 'transitionDuration']);
check('the fill is 40 percent of the track', Math.round(Number.parseFloat(sixFill.width) / Number.parseFloat(sixTrack.width) * 100), 40);
check(
  'a solid fill is the edge step of its hue',
  await paintOf(page, sixFill.backgroundColor),
  await paintOf(page, await tokenValue(page, '--color-sky-edge'))
);
check('the fill animates its width', sixFill.transitionProperty.includes('width'), true);
const gradientFill = await probe(page, '[aria-label="Probe eight"] div', ['backgroundImage']);
check('a gradient fill is a linear gradient', gradientFill.backgroundImage.startsWith('linear-gradient'), true);
for (const hue of ['sky', 'teal', 'green', 'sand', 'coral', 'lavender']) { // NOSONAR javascript:S9382 sequential on purpose: one shared page, and the checks are logged in order
  await reportPairs(page, [ // NOSONAR javascript:S9382
    [`the ${hue} progress fill on its track over white`, `--color-${hue}-edge`, 'rgb(15 27 45 / 0.07)', 3],
    [`the ${hue} progress fill on its track over the ground`, `--color-${hue}-edge`, 'rgb(243 246 249)', 3],
  ]);
}
await unmountPrimitives(page);

// Cover
// The caller sizes a cover. The probe sizes a wrapper and lets the cover fill
// it, since a utility class that only this script names is not in the sheet.
// The image is requested as the cover renders, and the fallback follows its
// failure, so the request is awaited before the fallback is read.
const missingImage = page.waitForResponse(response => response.url().endsWith('/definitely-missing.png'), { timeout: WAIT_MS });
await mountPrimitives(page, (ui, h) => {
  const sized = child => h('div', { style: { width: 192, height: 96, display: 'inline-block' } }, child);
  return h(
    'div',
    null,
    sized(h(ui.Cover, { hue: 'coral', className: 'size-full' })),
    sized(h(ui.Cover, { hue: 'teal', src: '/definitely-missing.png', className: 'size-full' })),
    sized(h(ui.Cover, { hue: 'sky', alt: 'A named cover', className: 'size-full' }))
  );
});
const plainCover = await probe(page, 'div[aria-hidden="true"]', ['height', 'width', 'backgroundImage']);
check('a cover takes its size from the caller', `${plainCover.width} ${plainCover.height}`, '192px 96px');
check('a cover draws its gradient', plainCover.backgroundImage.startsWith('linear-gradient'), true);
await missingImage;
await until(page, 'the cover to drop the image that failed to load', () => document.querySelector('#probe-host img') === null).catch(() => {});
check('a cover whose image is missing falls back to its gradient', await page.locator('#probe-host img').count(), 0);
check('a named cover is an image with that name', await page.locator('#probe-host [role="img"][aria-label="A named cover"]').count(), 1);
await unmountPrimitives(page);

const HUE_NAMES = ['sky', 'teal', 'green', 'sand', 'coral', 'lavender'];

// Avatar: the fill is the hue's mid step and the initials are ink. This is
// where the contrast of that pair is measured, for every hue, on what the
// browser painted.
await mountPrimitives(page, (ui, h) =>
  h(
    'div',
    null,
    ['sky', 'teal', 'green', 'sand', 'coral', 'lavender'].map(hue =>
      h(ui.Avatar, { key: hue, name: `Av ${hue}`, hue, size: 'sm' })
    ),
    h(ui.Avatar, { name: 'Ada Lovelace', size: 'md', ring: 'surface' }),
    h(ui.Avatar, { name: 'Ada Lovelace', size: 'lg', ring: 'ground' }),
    h(ui.Avatar, { name: 'Ada Lovelace', size: 'xl' })
  )
);
for (const hue of HUE_NAMES) { // NOSONAR javascript:S9382 sequential on purpose: the probes share one page, and the checks are logged in order
  const avatar = page.locator(`#probe-host [aria-label="Av ${hue}"]`);
  const painted = await styleOf(avatar, ['backgroundColor', 'color']); // NOSONAR javascript:S9382
  const initials = await styleOf(avatar.locator('span'), ['fontSize', 'fontWeight']); // NOSONAR javascript:S9382
  check(
    `the ${hue} avatar is filled with the mid step`,
    await paintOf(page, painted.backgroundColor), // NOSONAR javascript:S9382
    await paintOf(page, await tokenValue(page, `--color-${hue}-mid`)) // NOSONAR javascript:S9382
  );
  check(`the ${hue} avatar initials are ink`, await paintOf(page, painted.color), await paintOf(page, await tokenValue(page, '--color-ink'))); // NOSONAR javascript:S9382
  check(`the ${hue} avatar initials are 10 pixels and bold`, `${initials.fontSize} ${initials.fontWeight}`, '10px 700');
  await reportPairs(page, [[`avatar initials on the ${hue} mid fill`, painted.color, painted.backgroundColor, 4.5]]); // NOSONAR javascript:S9382
}
const avatarSizes = [];
for (const name of ['Av sky', 'Ada Lovelace']) { // NOSONAR javascript:S9382 sequential on purpose: the sizes are listed in the order of the probes on one page
  for (const box of await page.locator(`#probe-host [aria-label="${name}"]`).evaluateAll(els => els.map(el => `${el.offsetWidth}`))) { // NOSONAR javascript:S9382
    avatarSizes.push(box);
  }
}
check('the avatar sizes are 24, 32, 48 and the profile\'s 116', avatarSizes.join(' '), '24 32 48 116');
const surfaceRing = await page.locator('#probe-host [aria-label="Ada Lovelace"]').nth(0).evaluate(el => getComputedStyle(el).boxShadow);
const groundRing = await page.locator('#probe-host [aria-label="Ada Lovelace"]').nth(1).evaluate(el => getComputedStyle(el).boxShadow);
check('the surface ring is a 2 pixel white ring', surfaceRing.includes('rgb(255, 255, 255) 0px 0px 0px 2px'), true);
check('the ground ring is a 2.5 pixel ring', groundRing.includes('0px 0px 0px 2.5px'), true);
const twin = await page.locator('#probe-host [aria-label="Ada Lovelace"]').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
check('the same person is the same colour wherever they appear', twin[0] === twin[1] && twin[1] === twin[2], true);
await unmountPrimitives(page);

// Swatch picker
await mountPrimitives(page, (ui, h, React) => {
  const Harness = () => {
    const [value, setValue] = React.useState('sky');
    return h(ui.SwatchPicker, {
      name: 'probe-colour',
      legend: 'Probe colour',
      value,
      onChange: setValue,
      options: [
        { id: 'sky', label: 'Sky', color: 'oklch(0.72 0.12 232)', hue: 'sky' },
        { id: 'coral', label: 'Coral', color: 'oklch(0.72 0.12 38)', hue: 'coral' },
        { id: 'plain', label: 'Slate', color: '#475569' },
      ],
    });
  };
  return h(Harness);
});
const swatch = name => page.locator(`#probe-host label:has(input[value="${name}"])`);
const sky = await styleOf(swatch('sky'), ['width', 'height', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'borderTopLeftRadius']);
const coral = await styleOf(swatch('coral'), ['borderTopColor', 'boxShadow']);
const plain = await styleOf(swatch('plain'), ['borderTopColor']);
check('a swatch is a 32 pixel circle', `${sky.width} ${sky.height} ${Number.parseFloat(sky.borderTopLeftRadius) >= 16}`, '32px 32px true');
check('a hue swatch is outlined in its edge step', await paintOf(page, sky.borderTopColor), await paintOf(page, await tokenValue(page, '--color-sky-edge')));
check('another hue swatch is outlined in its own edge step', await paintOf(page, coral.borderTopColor), await paintOf(page, await tokenValue(page, '--color-coral-edge')));
check('a swatch with no hue is outlined in the control border colour', await paintOf(page, plain.borderTopColor), await paintOf(page, await tokenValue(page, '--color-line-control')));
check('the chosen swatch carries the white and ink double ring', sky.boxShadow.includes('0px 0px 0px 4px') && sky.boxShadow.includes('rgb(15, 27, 45)'), true);
check('a swatch that is not chosen carries no ring', !coral.boxShadow.includes('0px 0px 0px 4px'), true);
await swatch('coral').hover();
await settled(page, { within: '#probe-host', label: 'the hovered swatch to finish growing' });
check('a hovered swatch grows by 15 percent', (await styleOf(swatch('coral'), ['scale'])).scale, '1.15');
await page.mouse.move(2, 2);
await page.locator('#probe-host input[value="sky"]').focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
const swatchRing = await styleOf(swatch('sky'), ['outlineStyle', 'outlineWidth', 'outlineOffset']);
check('the swatch whose radio has the keyboard draws the focus ring', `${swatchRing.outlineStyle} ${swatchRing.outlineWidth} ${swatchRing.outlineOffset}`, 'solid 2px 2px');
await page.keyboard.press('ArrowRight');
check('the right arrow chooses the next swatch', await page.locator('#probe-host input:checked').evaluate(radio => radio.value), 'coral');
for (const hue of HUE_NAMES) { // NOSONAR javascript:S9382 sequential on purpose: one shared page, and the checks are logged in order
  await reportPairs(page, [ // NOSONAR javascript:S9382
    [`the ${hue} swatch outline on white`, `--color-${hue}-edge`, '--color-surface', 3],
    [`the ${hue} swatch outline on the ground`, `--color-${hue}-edge`, '--color-ground', 3],
  ]);
}
await unmountPrimitives(page);

// Empty state, stat tile and loading screen
await mountPrimitives(page, (ui, h) =>
  h(
    'div',
    null,
    h(ui.EmptyState, { icon: h('span', null, 'e'), title: 'Still air', description: 'Nothing here.', tone: 'coral' }),
    h(ui.StatTile, { icon: h('span', null, 's'), tone: 'teal', value: 42, label: 'Probe tiles' })
  )
);
const emptyCircle = await probe(page, 'h3 ~ p', ['color']);
const circle = await page.locator('#probe-host h3').locator('xpath=preceding-sibling::*[1]').evaluate(el => {
  const style = getComputedStyle(el);
  return { width: style.width, radius: style.borderTopLeftRadius, background: style.backgroundColor, color: style.color };
});
check('the empty state circle is 64 pixels and round', `${circle.width} ${circle.radius}`.startsWith('64px'), true);
check('the empty state circle is the tint of its tone', await paintOf(page, circle.background), await paintOf(page, await tokenValue(page, '--color-coral-tint')));
check('an icon with no colour takes the deep step of the tone', await paintOf(page, circle.color), await paintOf(page, await tokenValue(page, '--color-coral-deep')));
const emptyTitle = await probe(page, 'h3', ['fontFamily', 'fontSize', 'fontWeight']);
check('the empty state title is set in the display face', leads(emptyTitle.fontFamily, 'Bricolage Grotesque'), true);
check('the empty state title is 26 pixels and bold', `${emptyTitle.fontSize} ${emptyTitle.fontWeight}`, '26px 700');
await reportPairs(page, [
  ['empty state title on white', '--color-ink', '--color-surface', 4.5],
  ['empty state description on white', emptyCircle.color, '--color-surface', 4.5],
  ['an empty state icon on its coral tint', '--color-coral-deep', '--color-coral-tint', 3],
]);
const tile = await page.locator('#probe-host').getByText('Probe tiles').locator('xpath=ancestor::div[contains(@class,"rounded-tile")]').evaluate(el => {
  const style = getComputedStyle(el);
  return { radius: style.borderTopLeftRadius, background: style.backgroundColor, shadow: style.boxShadow, animation: style.animationName };
});
check('a stat tile has the tile radius and is white', `${tile.radius} ${await paintOf(page, tile.background)}`, '22px 255,255,255');
check('a stat tile casts the tile shadow', tile.shadow.includes('0px 14px 34px -24px'), true);
check('a stat tile enters on bbUp', tile.animation, 'bbUp');
const figure = await probeText(page, '42', ['fontFamily', 'fontSize', 'fontWeight']);
check('the stat figure is 28 pixels in the display face', `${figure.fontSize} ${leads(figure.fontFamily, 'Bricolage Grotesque')}`, '28px true');
await unmountPrimitives(page);

await mountPrimitives(page, (ui, h) => h(ui.LoadingScreen, { label: 'Probe loading', showLabel: true }));
const mark = page.locator('#probe-host [role="status"]');
const markStyle = await styleOf(mark, ['width', 'height', 'backgroundImage', 'borderTopLeftRadius']);
check('the loading mark is a 56 pixel tile', `${markStyle.width} ${markStyle.height} ${markStyle.borderTopLeftRadius}`, '56px 56px 16px');
check('the loading mark is a gradient and not a flat fill', markStyle.backgroundImage.startsWith('linear-gradient'), true);
const glyph = await styleOf(mark.locator('svg'), ['animationName', 'animationIterationCount']);
check('the loading glyph sways', `${glyph.animationName} ${glyph.animationIterationCount}`, 'bbSway infinite');
check('nothing on the loading screen spins', await page.locator('#probe-host *').evaluateAll(els => els.every(el => !getComputedStyle(el).animationName.includes('bbSpin') && !getComputedStyle(el).animationName.includes('spin'))), true);
// Both ends of the gradient token, read from the token itself so the check
// follows the stops if they ever move.
const markStops = (await tokenValue(page, '--gradient-mark')).match(/oklch\([^)]*\)/g);
check('the loading mark gradient has two stops', markStops?.length, 2);
await reportPairs(page, markStops.map((stop, index) => [`the white wind glyph on stop ${index + 1} of the loading mark`, '#ffffff', stop, 3]));
await reportPairs(page, [['the loading label on the ground', '--color-ink-secondary', '--color-ground', 4.5]]);
await unmountPrimitives(page);

// Wind layer. The streaks and particles are CSS animations on elements React
// renders once, so what is asserted here is what the browser does with them:
// that they run, that they are drawn over the box and cannot be clicked, and
// that nothing in the page changes while they play.
const windBox = (ui, h, React, { level, tone }) =>
  h(
    'div',
    { id: 'wind-box', style: { position: 'relative', width: 600, height: 300, background: '#0f1b2d' } },
    h('button', { id: 'under-wind', style: { position: 'absolute', left: 20, top: 20, width: 120, height: 40 } }, 'Under the wind'),
    h(ui.WindLayer, { level, tone })
  );
await mountPrimitives(page, windBox, { level: 'breezy', tone: 'light' });
const windLayer = page.locator('#wind-box > div[aria-hidden="true"]');
check('a breezy wind layer draws 6 streaks', await windLayer.locator('svg path').count(), 6);
check('a breezy wind layer draws 9 particles', await windLayer.locator(':scope > span').count(), 9);
const windStyle = await styleOf(windLayer, ['pointerEvents', 'position', 'overflow', 'width', 'height']);
check('the wind layer takes no pointer events', windStyle.pointerEvents, 'none');
check('the wind layer fills the box it is placed in', `${windStyle.position} ${windStyle.width} ${windStyle.height}`, 'absolute 600px 300px');
check('the wind layer clips what leaves the box', windStyle.overflow, 'hidden');
check(
  'a click on a control under the wind layer reaches the control',
  await page.evaluate(() => {
    const box = document.getElementById('under-wind').getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.id;
  }),
  'under-wind'
);
const streak = await styleOf(windLayer.locator('svg path').first(), ['animationName', 'animationDuration', 'animationIterationCount', 'strokeLinecap', 'stroke']);
check('the first streak flows on bbFlow, 9 seconds, forever', `${streak.animationName} ${streak.animationDuration} ${streak.animationIterationCount}`, 'bbFlow 9s infinite');
check('the first streak is a white line with round ends', `${streak.strokeLinecap} ${await paintOf(page, streak.stroke)}`.startsWith('round'), true);
const secondStreak = await styleOf(windLayer.locator('svg path').nth(1), ['animationDuration']);
check('the second streak flows on its own pace', secondStreak.animationDuration, '16s');
const leaf = await styleOf(windLayer.locator(':scope > span').first(), ['animationName', 'animationDuration', 'width', 'height', 'top']);
check('the first particle is a 9 by 5 leaf drifting on bbDrift for 14 seconds', `${leaf.animationName} ${leaf.animationDuration} ${leaf.width} ${leaf.height}`, 'bbDrift 14s 9px 5px');
const dot = await styleOf(windLayer.locator(':scope > span').nth(1), ['width', 'height', 'top']);
check('the second particle is a 6 by 3 dot', `${dot.width} ${dot.height}`, '6px 3px');
check('the animations are running, one for every streak and particle', await page.evaluate(() => {
  const animations = document.getElementById('wind-box').getAnimations({ subtree: true });
  return animations.length === 15 && animations.every(animation => animation.playState === 'running');
}), true);
const driftBefore = await windLayer.locator(':scope > span').nth(1).evaluate(el => getComputedStyle(el).transform);
await until(
  page,
  'the second particle to move',
  before => getComputedStyle(document.querySelectorAll('#wind-box > div[aria-hidden="true"] > span')[1]).transform !== before,
  driftBefore
).catch(() => {});
const driftAfter = await windLayer.locator(':scope > span').nth(1).evaluate(el => getComputedStyle(el).transform);
check('a particle moves while the wind plays', driftBefore !== driftAfter, true);
// An absence over a stretch of time: the window is the claim, so it is the one
// wait here that has nothing to observe. A longer stall only lengthens it.
check(
  'nothing in the page changes while the wind plays',
  await page.evaluate(
    () =>
      new Promise(resolve => {
        let records = 0;
        const observer = new MutationObserver(list => {
          records += list.length;
        });
        observer.observe(document.getElementById('wind-box'), { subtree: true, childList: true, attributes: true, characterData: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(records);
        }, 1200);
      })
  ),
  0
);
await unmountPrimitives(page);

await mountPrimitives(page, windBox, { level: 'breezy', tone: 'dark' });
const darkStreak = await styleOf(page.locator('#wind-box svg path').first(), ['stroke']);
check('the dark tone draws coloured streaks', darkStreak.stroke.startsWith('oklch'), true);
await unmountPrimitives(page);

await mountPrimitives(page, windBox, { level: 'still', tone: 'light' });
check('the still level draws no layer at all', await page.locator('#wind-box > div[aria-hidden="true"]').count(), 0);
check('the still level draws nothing inside the box either', await page.locator('#wind-box svg').count(), 0);
await unmountPrimitives(page);

await mountPrimitives(page, windBox, { level: 'gusty', tone: 'light' });
check('a gusty wind layer draws 11 streaks and 20 particles', `${await page.locator('#wind-box svg path').count()} ${await page.locator('#wind-box > div > span').count()}`, '11 20');
const gustyStreak = await styleOf(page.locator('#wind-box svg path').nth(1), ['animationDuration']);
check('a gusty streak is faster than the same breezy one', Number.parseFloat(gustyStreak.animationDuration) < 16, true);
await unmountPrimitives(page);

log('\n--- the menu, the confirm dialog and the toast, signed in ---');

// A real account, so the surfaces that only exist behind the sign in can be
// measured: the account menu and the board menu, the confirm dialog that
// deleting a board asks, and the toast that offers to undo it.
const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const gateUser = {
  firstName: 'Token',
  lastName: 'Gate',
  email: `tokens-${Date.now()}@example.test`,
  password: 'TokenGate1',
};
const registered = await page.request.post(`${API}/auth/register`, { data: gateUser });
check('the gate account registers', registered.ok(), true);
await page.goto(`${FRONT}/login`);
const loginForm = page.locator('form').first();
await loginForm.getByLabel('Email address', { exact: true }).fill(gateUser.email);
await loginForm.getByLabel('Password', { exact: true }).fill(gateUser.password);
await loginForm.getByRole('button', { name: /sign in/i }).click();
await page.getByText('Your boards').waitFor();

const gateBoard = `Token Board ${Date.now()}`;
await page.getByRole('button', { name: /create board/i }).first().click();
await page.getByLabel(/board name/i).fill(gateBoard);
await page.getByRole('button', { name: /^create board$/i }).last().click();
await page.getByText(gateBoard).first().waitFor();
await settled(page, { label: 'the dashboard to stop animating after the board is created' });

log('\n--- the application shell, signed in at 1440 ---');

// The frame is measured from the rendered page: its size and position are
// layout facts and its surfaces are computed styles, and neither exists below
// a real browser. The boards list has the one board created above.
const shellRoot = page.locator('#app-sidebar').locator('xpath=..');
const rootStyle = await styleOf(shellRoot, ['height', 'overflow', 'backgroundImage', 'backgroundColor', 'display']);
check('the shell is exactly as tall as the screen', rootStyle.height, '900px');
check('the shell clips so the document never scrolls', rootStyle.overflow, 'hidden');
check(
  'the document does not scroll in either direction',
  await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight && document.documentElement.scrollWidth <= window.innerWidth),
  true
);
check('the ground carries three radial gradients', (rootStyle.backgroundImage.match(/radial-gradient\(/g) ?? []).length, 3);
check('the ground lies on the ground colour', await paintOf(page, rootStyle.backgroundColor), await paintOf(page, await tokenValue(page, '--color-ground')));

const sidebar = page.locator('#app-sidebar > aside');
const sidebarBox = await sidebar.boundingBox();
check(
  'the sidebar is 240 wide in a 252 column, 12 from the edges',
  `${sidebarBox.x} ${sidebarBox.y} ${sidebarBox.width} ${sidebarBox.height}`,
  '12 12 240 876'
);
const sidebarStyle = await styleOf(sidebar, ['borderTopLeftRadius', 'backdropFilter', 'backgroundColor', 'boxShadow', 'borderTopWidth']);
check('the sidebar has the panel radius', sidebarStyle.borderTopLeftRadius, '24px');
check('the sidebar blurs by 20 and saturates by 1.5', ['blur(20px)', 'saturate(1.5)'].every(part => sidebarStyle.backdropFilter.includes(part)), true);
check('the sidebar is glass at 62 percent white', sidebarStyle.backgroundColor, 'rgba(255, 255, 255, 0.62)');
check('the sidebar casts the sidebar shadow', sidebarStyle.boxShadow.includes('0px 20px 50px -30px'), true);
check('the sidebar has a one pixel border', sidebarStyle.borderTopWidth, '1px');

const shellHeader = page.getByRole('banner');
const headerBox = await shellHeader.boundingBox();
check('the header is 56 pixels tall', headerBox.height, 56);
check('the content column starts 22 pixels after the sidebar column', headerBox.x, 252 + 22);
const mainStyle = await styleOf(page.getByRole('main'), ['overflowY', 'display']);
check('the content area scrolls on its own', mainStyle.overflowY, 'auto');

const logoTile = sidebar.getByRole('link', { name: 'breezyboard' }).locator('span').first();
const logoStyle = await styleOf(logoTile, ['width', 'height', 'borderTopLeftRadius', 'backgroundImage', 'boxShadow']);
check('the logo tile is 36 pixels with the control radius', `${logoStyle.width} ${logoStyle.height} ${logoStyle.borderTopLeftRadius}`, '36px 36px 12px');
check('the logo tile is the reference gradient', logoStyle.backgroundImage.startsWith('linear-gradient(135deg'), true);
check('the logo tile casts the logo shadow', logoStyle.boxShadow.includes('0px 8px 18px -8px'), true);
const logoStops = (await tokenValue(page, '--gradient-logo')).match(/oklch\([^)]*\)/g);
check('the logo gradient has two stops', logoStops?.length, 2);
// A logo is exempt from 1.4.3 and 1.4.11, and the product owner kept the
// reference gradient. The number is recorded so that the exemption is a
// measurement and not an assumption, and so a change to the stops is seen.
const logoPairs = await measurePairs(page, [['the white glyph on the light stop of the logo', '#ffffff', logoStops[1], 0]]);
check(`the white glyph is about 2.2:1 on the light end of the logo (${logoPairs[0][1]}:1)`, logoPairs[0][1] > 2 && logoPairs[0][1] < 2.5, true);
const wordmark = await sidebar.getByRole('link', { name: 'breezyboard' }).evaluate(link => {
  const [heavy, regular] = link.querySelectorAll('span > span');
  return { heavy: getComputedStyle(heavy).fontWeight, regular: getComputedStyle(regular).fontWeight, size: getComputedStyle(heavy).fontSize, family: getComputedStyle(heavy).fontFamily };
});
check('the wordmark is breezy at 800 and board at 400', `${wordmark.heavy} ${wordmark.regular}`, '800 400');
check('the wordmark is 21 pixels in the display face', `${wordmark.size} ${leads(wordmark.family, 'Bricolage Grotesque')}`, '21px true');

const homeItem = sidebar.getByRole('link', { name: 'Home', exact: true });
const homeStyle = await styleOf(homeItem, ['height', 'borderTopLeftRadius', 'backgroundColor', 'boxShadow', 'fontWeight', 'fontSize']);
check('the active nav item is 40 pixels with the control radius', `${homeStyle.height} ${homeStyle.borderTopLeftRadius}`, '40px 12px');
check('the active nav item is white and lifted', `${await paintOf(page, homeStyle.backgroundColor)} ${homeStyle.boxShadow.includes('0px 6px 16px -10px')}`, '255,255,255 true');
check('a nav item is 14 pixels at 600', `${homeStyle.fontSize} ${homeStyle.fontWeight}`, '14px 600');

const boardLink = sidebar.getByRole('link', { name: gateBoard });
const boardStyle = await styleOf(boardLink, ['height', 'borderTopLeftRadius', 'fontWeight', 'fontSize']);
check('a board item is 38 pixels at 500 and 14 pixels when it is not the open one', `${boardStyle.height} ${boardStyle.fontWeight} ${boardStyle.fontSize}`, '38px 500 14px');
const boardDot = await styleOf(boardLink.locator('span').first(), ['width', 'height', 'rotate', 'borderTopLeftRadius']);
check('a board dot is a 12 pixel square turned 12 degrees with the dot radius', `${boardDot.width} ${boardDot.height} ${boardDot.rotate} ${boardDot.borderTopLeftRadius}`, '12px 12px 12deg 4px');
const eyebrow = await styleOf(sidebar.locator('#sidebar-boards-label'), ['fontFamily', 'fontSize', 'letterSpacing', 'textTransform']);
check('the BOARDS label is mono caps at 11 pixels, tracked 0.1em', `${leads(eyebrow.fontFamily, 'DM Mono')} ${eyebrow.fontSize} ${eyebrow.letterSpacing} ${eyebrow.textTransform}`, 'true 11px 1.1px uppercase');

// Small text on the glass is measured against what is painted behind it: the
// glass is translucent over a gradient, so no token pair says what the ratio
// is. The text is made transparent, the box is photographed, and the darkest
// pixel found is the worst background the text can sit on.
const worstBackdrop = async locator => {
  await locator.evaluate(element => {
    element.dataset.keptColor = element.style.color;
    // A colour transition would leave the text half visible in the photograph.
    element.style.transition = 'none';
    element.style.color = 'transparent';
  });
  const shot = await locator.screenshot();
  await locator.evaluate(element => {
    element.style.color = element.dataset.keptColor;
    element.style.transition = '';
    delete element.dataset.keptColor;
  });
  return page.evaluate(async encoded => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let darkest = [255, 255, 255];
    let lowest = Infinity;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum < lowest) {
        lowest = lum;
        darkest = [data[i], data[i + 1], data[i + 2]];
      }
    }
    return darkest.join(',');
  }, shot.toString('base64'));
};
for (const [label, locator, token] of [
  ['the BOARDS label', sidebar.locator('#sidebar-boards-label'), '--color-ink-tertiary'],
  ['a board name', boardLink.locator('span.truncate'), '--color-ink-secondary'],
  ['the author line', sidebar.getByText(/Kevin Feuerschvenger$/), '--color-ink-tertiary'],
  ['a legal link', sidebar.getByRole('button', { name: 'Privacy policy' }), '--color-ink-secondary'],
]) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the shared page's text colour and puts it back, so the elements cannot be photographed at once
  const behind = await worstBackdrop(locator); // NOSONAR javascript:S9382
  await reportPairs(page, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, 4.5]]); // NOSONAR javascript:S9382
}

log('\n--- the Breeze control and the wind over the shell ---');

const sessionToken = await page.evaluate(() => localStorage.getItem('token'));
const storedBreeze = async () =>
  (await (await page.request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${sessionToken}` } })).json()).data.breeze;
const windOfShell = () =>
  page.evaluate(() => {
    const layer = document.getElementById('app-sidebar').previousElementSibling;
    if (!layer || layer.getAttribute('aria-hidden') !== 'true') return null;
    const under = document.elementFromPoint(
      document.querySelector('#app-sidebar a[href="/"]').getBoundingClientRect().x + 10,
      document.querySelector('#app-sidebar a[href="/"]').getBoundingClientRect().y + 10
    );
    return {
      streaks: layer.querySelectorAll('svg path').length,
      particles: layer.querySelectorAll(':scope > span').length,
      running: layer.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length,
      pointerEvents: getComputedStyle(layer).pointerEvents,
      stroke: layer.querySelector('svg path').getAttribute('stroke'),
      // What is under the sidebar's own link is the link, not the wind.
      linkOnTop: Boolean(under?.closest('#app-sidebar')),
    };
  });

check('a new account reads as breezy', await storedBreeze(), 'breezy');
const breezyWind = await windOfShell();
check('the default wind is 6 streaks and 9 particles', `${breezyWind?.streaks} ${breezyWind?.particles}`, '6 9');
check('every streak and particle is running', breezyWind?.running, 15);
check('the wind is coloured, the dark tone, on the light ground', breezyWind?.stroke.startsWith('oklch('), true);
check('the wind takes no pointer events', breezyWind?.pointerEvents, 'none');
check('the sidebar is above the wind', breezyWind?.linkOnTop, true);

// The radios are visually hidden and a press lands on their segment, which
// is what a pointer does.
// The choice is applied to the page at once and sent in the background, so
// anything read back from the server waits for the request that stores it.
const chooseBreeze = async name => {
  const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/users/'), { timeout: WAIT_MS });
  await sidebar.locator('label', { hasText: new RegExp(`^${name}$`) }).click();
  await saved;
};
const breezeBox = sidebar.getByRole('radiogroup', { name: 'Breeze' });
const boxGeometry = await breezeBox.evaluate(group => {
  const groupBox = group.getBoundingClientRect();
  const asideBox = group.closest('aside').getBoundingClientRect();
  return {
    labels: [...group.querySelectorAll('label')].map(label => {
      const box = label.getBoundingClientRect();
      return { text: label.textContent, left: box.left, right: box.right, height: Math.round(box.height) };
    }),
    insideFrame: [...group.querySelectorAll('label')].every(label => {
      const box = label.getBoundingClientRect();
      return box.left >= groupBox.left - 0.5 && box.right <= groupBox.right + 0.5;
    }),
    insidePanel: groupBox.left >= asideBox.left && groupBox.right <= asideBox.right,
    scrolls: group.scrollWidth > group.clientWidth,
  };
});
check('the four segments are Still, Calm, Breezy and Gusty in a row', boxGeometry.labels.map(l => l.text).join(' '), 'Still Calm Breezy Gusty');
check('every segment is inside the frame of the control', boxGeometry.insideFrame, true);
check('the control does not overflow its own box or the sidebar', `${boxGeometry.scrolls} ${boxGeometry.insidePanel}`, 'false true');
check('every segment is 28 pixels tall', boxGeometry.labels.every(l => l.height === 28), true);
check(
  'the segments touch and none overlaps the next',
  boxGeometry.labels.every((l, i, all) => i === 0 || l.left >= all[i - 1].right - 0.5),
  true
);
check('the box says 38 km/h at the default', await sidebar.getByText('38 km/h').isVisible(), true);

await chooseBreeze('Gusty');
const gustyWind = await poll('the wind layer to follow the Gusty choice', windOfShell, wind => wind?.streaks === 11);
check('gusty is 11 streaks and 20 particles', `${gustyWind?.streaks} ${gustyWind?.particles}`, '11 20');
check('the box says 74 km/h for gusty', await sidebar.getByText('74 km/h').isVisible(), true);
check('the choice is stored on the user', await storedBreeze(), 'gusty');
check('a gusty logo glyph sways', await sidebar.getByRole('link', { name: 'breezyboard' }).locator('svg').evaluate(svg => getComputedStyle(svg).animationName), 'bbSway');

// The stored value is what a new load reads: nothing is kept in the browser.
await page.reload();
await page.getByText('Your boards').waitFor();
await poll('the shell wind to be drawn after the reload', windOfShell, wind => wind !== null).catch(() => {});
check('the choice is still gusty after a reload', (await windOfShell())?.streaks, 11);
check('the control shows the stored choice after a reload', await page.getByRole('radio', { name: 'Gusty' }).isChecked(), true);

await chooseBreeze('Still');
await poll('the wind layer to be removed at Still', windOfShell, wind => wind === null);
check('still removes the wind from the page entirely', await windOfShell(), null);
check('still holds the logo glyph still', await sidebar.getByRole('link', { name: 'breezyboard' }).locator('svg').evaluate(svg => getComputedStyle(svg).animationName), 'none');
// Ambient motion is what runs without end. A transition or an entrance that
// is finishing is not, so only animations that repeat forever are counted.
check(
  'nothing on the page repeats forever at still',
  await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).length),
  0
);
check('still is stored on the user', await storedBreeze(), 'still');
check('the browser keeps a copy of the choice for the signed out screen', await page.evaluate(() => localStorage.getItem('bb.breeze')), 'still');

// The system's preference wins over the stored choice and does not overwrite
// it: the same account, stored at gusty, opened on a device that asks for
// less motion.
await page.request.put(`${API}/users/${await page.evaluate(() => JSON.parse(localStorage.getItem('user'))._id)}`, {
  headers: { Authorization: `Bearer ${sessionToken}` },
  data: { breeze: 'gusty' },
});
const quiet = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const quietPage = await quiet.newPage();
await quietPage.goto(`${FRONT}/login`);
await quietPage.locator('form').first().getByLabel('Email address', { exact: true }).fill(gateUser.email);
await quietPage.locator('form').first().getByLabel('Password', { exact: true }).fill(gateUser.password);
await quietPage.locator('form').first().getByRole('button', { name: /sign in/i }).click();
await quietPage.getByText('Your boards').waitFor();
await settled(quietPage, { label: 'the signed in shell to stop animating under reduced motion' });
check('under reduced motion there is no wind layer in the shell', await quietPage.evaluate(() => document.getElementById('app-sidebar').previousElementSibling?.getAttribute('aria-hidden') === 'true'), false);
check('the speed hint says the motion is reduced', await quietPage.getByText('Reduced motion').isVisible(), true);
check(
  'the group is named for the reduction',
  await quietPage.getByRole('radiogroup', { name: 'Breeze, held still because your system asks for reduced motion' }).isVisible(),
  true
);
check('the stored choice is still the one selected', await quietPage.getByRole('radio', { name: 'Gusty' }).isChecked(), true);
check('nothing was written over the stored choice', await storedBreeze(), 'gusty');
await quiet.close();
await page.reload();
await page.getByText('Your boards').waitFor();
await chooseBreeze('Breezy');
await poll('the wind layer to follow the Breezy choice', windOfShell, wind => wind?.streaks === 6);

// The account menu: it rises in, and while it leaves it is already out of
// reach.
// Recorded on every frame from before the click until the menu is at rest: the
// first frame is its initial values, the last is where it settles, and neither
// depends on how long a frame took.
await armAppearance(page, '[role="menu"]');
await page.locator('button[aria-label^="Account menu for"]').click();
const menuOpening = (await readAppearance(page))[0];
check('a menu fades in', menuOpening.opacity < 1, true);
check('a menu rises and scales in', isIdentity(menuOpening.transform), false);
const menuSurface = await styleOf(page.getByRole('menu'), ['borderTopLeftRadius', 'backgroundColor', 'boxShadow']);
check('a menu has the control radius', menuSurface.borderTopLeftRadius, '12px');
check('a menu is white', await paintOf(page, menuSurface.backgroundColor), '255,255,255');
check('a menu casts the raised tile shadow', menuSurface.boxShadow.includes('0px 26px 44px -24px'), true);
const menuItem = await styleOf(page.getByRole('menuitem').first(), ['borderTopLeftRadius', 'fontWeight']);
check('a menu item is a rounded medium weight row', `${menuItem.borderTopLeftRadius} ${menuItem.fontWeight}`, '10px 500');
await reportPairs(page, [
  ['a menu item on the menu', '--color-ink-secondary', '--color-surface', 4.5],
  ['a hovered menu item on its fill', '--color-ink', '--color-line-06', 4.5],
]);

// Read from the page's own mutations, which report the moment the popup is
// marked or removed, and not from a frame a fixed distance after the key. The
// popup may be gone before it is ever read, which is fine. If it is still
// there, it must not be reachable while it fades. A popup that never becomes
// either is reported as it was after the wait.
const menuLeaving = await page.evaluate(
  limit =>
    new Promise(resolve => {
      const stateOf = () => {
        const still = document.querySelector('[role="menu"]');
        return still ? { hidden: still.getAttribute('aria-hidden'), inert: still.hasAttribute('inert') } : null;
      };
      const unreachable = state => state === null || (state.hidden === 'true' && state.inert);
      const observer = new MutationObserver(() => {
        const state = stateOf();
        if (unreachable(state)) {
          observer.disconnect();
          resolve(state);
        }
      });
      observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
      document.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(() => {
        observer.disconnect();
        resolve(stateOf());
      }, limit);
    }),
  WAIT_MS
);
check(
  'a leaving menu is hidden and inert, or already gone',
  menuLeaving === null || (menuLeaving.hidden === 'true' && menuLeaving.inert),
  true
);
await page.getByRole('menu').waitFor({ state: 'detached', timeout: WAIT_MS }).catch(() => {});
check('the menu is gone from the page after its exit', await page.getByRole('menu').count(), 0);

// The confirm dialog and the toast.
await page.getByRole('button', { name: `Options for ${gateBoard}` }).click();
// The board card's menu is its own component of plain buttons, not the Menu primitive.
await page.getByRole('button', { name: 'Delete', exact: true }).click();
const confirmDialog = page.getByRole('dialog', { name: 'Delete this board?' });
await confirmDialog.waitFor({ state: 'visible' });
await settled(page, { within: '[role="dialog"]', label: 'the confirm dialog to finish opening' });
check(
  'the confirm dialog puts focus on Cancel',
  await confirmDialog.getByRole('button', { name: 'Cancel' }).evaluate(el => el === document.activeElement),
  true
);
const destructive = await styleOf(confirmDialog.getByRole('button', { name: 'Delete board' }), ['backgroundColor', 'height']);
check(
  'the destructive confirm button is the danger fill',
  await paintOf(page, destructive.backgroundColor),
  await paintOf(page, await tokenValue(page, '--color-danger'))
);
check('the destructive confirm button is 44 pixels tall', destructive.height, '44px');
await confirmDialog.getByRole('button', { name: 'Delete board' }).click();

const toast = page.getByTestId('toast');
await toast.waitFor({ state: 'visible' });
const toastStyle = await styleOf(toast, ['backgroundColor', 'borderTopLeftRadius', 'boxShadow', 'animationName']);
check(
  'a toast is a dark ink pill',
  `${await paintOf(page, toastStyle.backgroundColor)} ${toastStyle.borderTopLeftRadius}`,
  `${await paintOf(page, await tokenValue(page, '--color-ink'))} 24px`
);
check('a toast casts the toast shadow', toastStyle.boxShadow.includes('0px 20px 40px -18px'), true);
check('a toast enters on bbToast', toastStyle.animationName, 'bbToast');
// The entrance slides in from the left on a tilt, which moves the box, so the
// position is measured once it has settled.
await settled(page, { within: '[data-testid="toast"]', label: 'the toast to finish sliding in' });
const toastBox = await toast.boundingBox();
const viewport = page.viewportSize();
check('a toast is centred at the bottom of the screen', Math.abs(toastBox.x + toastBox.width / 2 - viewport.width / 2) <= 1, true);
check('a toast sits 28 pixels above the bottom edge', Math.round(viewport.height - (toastBox.y + toastBox.height)), 28);
const windIcon = await styleOf(toast.locator('svg').first(), ['color']);
check(
  'a toast carries the wind icon in the on-ink accent',
  await paintOf(page, windIcon.color),
  await paintOf(page, await tokenValue(page, '--color-on-ink-accent'))
);
const undo = toast.getByRole('button', { name: 'Undo' });
const undoStyle = await styleOf(undo, ['borderTopLeftRadius']);
check('the toast action is a round translucent pill', undoStyle.borderTopLeftRadius, '99px');
await reportPairs(page, [
  ['a toast message on the ink', '#ffffff', '--color-ink', 4.5],
  ['the toast wind icon on the ink', '--color-on-ink-accent', '--color-ink', 3],
  ['the toast action text on its pill', '#ffffff', ['#0f1b2d', 'rgb(255 255 255 / 0.14)'], 4.5],
  ['the toast action text on its hovered pill', '#ffffff', ['#0f1b2d', 'rgb(255 255 255 / 0.26)'], 4.5],
  ['the toast dismiss glyph on the ink', 'rgb(255 255 255 / 0.8)', '--color-ink', 3],
]);
// The toast is first in the tab order, so Tab walks onto its controls.
let reached = false;
for (let press = 0; press < 6 && !reached; press += 1) { // NOSONAR javascript:S9382 sequential on purpose: each Tab moves focus on from where the last one left it
  await page.keyboard.press('Tab'); // NOSONAR javascript:S9382
  reached = await undo.evaluate(el => el === document.activeElement); // NOSONAR javascript:S9382
}
check('the keyboard reaches the toast action', reached, true);
const toastRing = await styleOf(undo, ['outlineStyle', 'outlineWidth', 'outlineColor']);
check(
  'the toast action draws a 2px white ring',
  `${toastRing.outlineStyle} ${toastRing.outlineWidth} ${await paintOf(page, toastRing.outlineColor)}`,
  'solid 2px 255,255,255'
);
await page.getByRole('button', { name: 'Dismiss notification' }).click();

log('\n--- the auth screen, signed out ---');

// The branding column sits on a gradient, so its text cannot be measured from
// two tokens: the background behind each line is whatever the gradient paints
// there. The column is screenshotted with every glyph made transparent and the
// text colour is compared with the lightest pixel behind each text box, which
// is the worst case for light text. Reduced motion keeps the wind layer out of
// the picture: its streaks are moving, translucent white and measured as
// decoration, not as background.
const authCalm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const authPage = await authCalm.newPage();
await authPage.goto(`${FRONT}/login`);
await authPage.waitForSelector('form');

check('the login page has exactly one h1 at 1440', await authPage.locator('h1').count(), 1);
check('the h1 is the form column title, inside main', await authPage.locator('main h1').count(), 1);
check('the branding headline is a paragraph', await authPage.locator('aside p').first().evaluate(el => el.tagName), 'P');

const panel = await authPage.locator('aside').evaluate(el => {
  const style = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const form = document.querySelector('main').getBoundingClientRect();
  return {
    display: style.display,
    margin: style.marginLeft,
    radius: style.borderTopLeftRadius,
    image: style.backgroundImage.startsWith('radial-gradient') ? 'gradient' : style.backgroundImage,
    left: box.left < form.left,
    headlineSize: Number.parseFloat(getComputedStyle(el.querySelector('p')).fontSize),
    headlineFamily: getComputedStyle(el.querySelector('p')).fontFamily.split(',')[0].replaceAll(/["']/g, ''),
  };
});
check('the branding column is on screen beside the form', `${panel.display} ${panel.left}`, 'flex true');
check('the panel is inset by 14px with a 30px radius', `${panel.margin} ${panel.radius}`, '14px 30px');
check('the panel paints the brand gradient', panel.image, 'gradient');
check('the headline is set in the display face at 66px', `${panel.headlineFamily} ${panel.headlineSize}`, 'Bricolage Grotesque Variable 66');

const stillLife = await authPage.locator('aside [aria-hidden="true"].h-80').evaluate(el => {
  const cards = [...el.querySelectorAll('[class*="animate-bb-float"]')];
  return {
    names: cards.map(card => getComputedStyle(card).animationName).join(' '),
    shadows: cards.every(card => getComputedStyle(card).boxShadow !== 'none'),
    postcard: getComputedStyle(el.firstElementChild).rotate !== 'none',
  };
});
// At still the cards lose their animation class, so none is left to match.
check('under reduced motion no card carries a float animation', stillLife.names, '');
check('the floating cards and the postcard are lifted and tilted', `${stillLife.shadows} ${stillLife.postcard}`, 'true true');

// Reduced motion collapses the float to a single play, so the cards rest.
check(
  'under reduced motion the floating cards do not keep moving',
  await authPage.evaluate(() => document.querySelector('aside').getAnimations({ subtree: true }).filter(a => a.effect.getTiming().iterations === Infinity).length),
  0
);

// The signed out screen plays the level this browser last saw for a person,
// kept under `bb.breeze`, and the default, breezy, when there is none.
const authMotion = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const authMotionPage = await authMotion.newPage();
const authWind = async stored => {
  await authMotionPage.goto(`${FRONT}/login`);
  await authMotionPage.evaluate(level => (level === null ? localStorage.removeItem('bb.breeze') : localStorage.setItem('bb.breeze', level)), stored);
  await authMotionPage.reload();
  await authMotionPage.waitForSelector('form');
  return authMotionPage.locator('aside').evaluate(el => ({
    level: el.dataset.breeze,
    streaks: el.querySelectorAll('.pointer-events-none svg path').length,
    floating: [...el.querySelectorAll('[class*="animate-bb-float"]')].map(card => getComputedStyle(card).animationName).join(' '),
    repeating: el.getAnimations({ subtree: true }).filter(a => a.effect.getTiming().iterations === Infinity).length,
  }));
};
const authDefault = await authWind(null);
check('with nothing stored the auth screen plays breezy', `${authDefault.level} ${authDefault.streaks}`, 'breezy 6');
check('with nothing stored the two floating cards run bbFloat', authDefault.floating, 'bbFloat bbFloat');
const authGusty = await authWind('gusty');
check('a stored gusty plays 11 streaks on the auth screen', `${authGusty.level} ${authGusty.streaks}`, 'gusty 11');
const authStill = await authWind('still');
check('a stored still stops every ambient animation on the auth screen', `${authStill.level} ${authStill.streaks} ${authStill.repeating}`, 'still 0 0');
check('a stored still leaves no card with a float animation', authStill.floating, '');
const authJunk = await authWind('hurricane');
check('a stored value that is not a level plays the default', authJunk.level, 'breezy');
await authMotion.close();

await authPage.addStyleTag({ content: 'aside * { color: transparent !important; -webkit-text-fill-color: transparent !important; border-color: transparent !important; background-image: none !important; }' });
const textTargets = [
  ['the paragraph', 'aside p:nth-of-type(2)', 'white', 4.5],
  ['the meta line', 'aside > div:last-child > div > span:last-child', 'white', 4.5],
  ['the badge', 'aside > div:last-child > div > span:first-child', 'white', 4.5],
  ['the wordmark', 'aside span.font-heading', 'white', 4.5],
  ['the headline', 'aside p:nth-of-type(1)', 'white', 3],
  // The warm gradient word: its darker, coral end is the worst case.
  ['the headline word, at its coral end', 'aside p:nth-of-type(1) span', 'oklch(0.78 0.14 38)', 3],
];
for (const [label, selector, rgb, minimum] of textTargets) { // NOSONAR javascript:S9382 sequential on purpose: the glyphs were made transparent on one shared page, and each screenshot reads it
  const clip = await authPage.locator(selector).first().boundingBox(); // NOSONAR javascript:S9382
  const png = (await authPage.screenshot({ clip })).toString('base64'); // NOSONAR javascript:S9382
  const worst = await authPage.evaluate( // NOSONAR javascript:S9382
    async ([data, color]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const channel = c => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const single = new OffscreenCanvas(1, 1).getContext('2d');
      single.fillStyle = color;
      single.fillRect(0, 0, 1, 1);
      const text = lum(...single.getImageData(0, 0, 1, 1).data);
      let lightest = 0;
      for (let i = 0; i < pixels.length; i += 4) lightest = Math.max(lightest, lum(pixels[i], pixels[i + 1], pixels[i + 2]));
      return Math.round(((text + 0.05) / (lightest + 0.05)) * 100) / 100;
    },
    [png, rgb]
  );
  check(`${label} on the brand panel is at least ${minimum}:1 (${worst}:1)`, worst >= minimum, true);
}
await authCalm.close();

await reportPairs(page, [
  ['the error banner text on its tint', '--color-danger-strong', '--color-danger-bg', 4.5],
  ['the reset confirmation text on its tint', '--color-success-strong', '--color-success-bg', 4.5],
  ['the forgot link on the ground', '--color-link', '--color-ground', 4.5],
  ['the postcard caption on white', '--color-ink-secondary', '--color-surface', 4.5],
  ['the note text on the sand note', '--color-ink-body', '--color-note-sand', 4.5],
]);

const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phonePage = await phone.newPage();
await phonePage.goto(`${FRONT}/login`);
await phonePage.waitForSelector('form');
check('on a phone the branding column is not rendered at all', await phonePage.locator('aside').isVisible(), false);
check('on a phone the page still has exactly one visible h1', await phonePage.locator('h1:visible').count(), 1);
check('on a phone a small wordmark stands in for the column', await phonePage.locator('main').getByText('breezy', { exact: false }).first().isVisible(), true);

// A refused submit shakes the form: the animation starts on it. The shake is
// shorter than a stalled page can take to answer a query, so its start is
// heard as an event from before the click and not looked for afterwards.
await phonePage.evaluate(limit => {
  const form = document.querySelector('form');
  window.__shake = new Promise(resolve => {
    form.addEventListener('animationstart', event => resolve(event.animationName), { once: true });
    setTimeout(() => resolve('no animation started'), limit);
  });
}, WAIT_MS);
await phonePage.getByRole('button', { name: /^Sign in/ }).click();
await phonePage.getByText('Email is required').waitFor();
check('a refused submit plays the shake on the form', await phonePage.evaluate(() => window.__shake), 'bbShake');
await until(phonePage, 'the shake to end', () => !document.querySelector('form').classList.contains('animate-bb-shake')).catch(() => {});
check('the shake class comes off when it ends', await phonePage.locator('form').evaluate(form => form.classList.contains('animate-bb-shake')), false);
await phone.close();

const authRoute = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const authRoutePage = await authRoute.newPage();
await authRoutePage.goto(`${FRONT}/login`);
await authRoutePage.waitForSelector('form');
const panelHandle = await authRoutePage.locator('aside').elementHandle();
await authRoutePage.getByRole('link', { name: 'Create an account' }).click();
await authRoutePage.getByRole('heading', { level: 1, name: 'Catch your first breeze' }).waitFor();
check('switching to sign up changes the address', new URL(authRoutePage.url()).pathname, '/register');
check('switching modes keeps the same branding column in the page', await panelHandle.evaluate(el => el.isConnected), true);
check('switching moves focus to the new title', await authRoutePage.evaluate(() => document.activeElement?.tagName), 'H1');
await authRoute.close();

log('\n--- the home page, signed in ---');

// One board in each of the six hues, made through the API for the gate
// account, then the home page opened in a context that asks for reduced
// motion. Reduced motion keeps the wind layer out of the picture: its streaks
// are moving, translucent white and measured as decoration, not as the
// background of the text, and it collapses the entrance animation so every
// box is measured where it settles.
const HUE_ANGLES = { sky: 232, teal: 192, green: 150, sand: 82, coral: 38, lavender: 300 };
const homeAuth = { headers: { Authorization: `Bearer ${sessionToken}` } };
const homePalette = (await (await page.request.get(`${API}/colors?type=board`, homeAuth)).json()).data;
const homeTemplate = (await (await page.request.get(`${API}/templates`, homeAuth)).json()).data[0];
check('the board palette is the six hues, by key', homePalette.map(entry => entry.value).sort((a, b) => a.localeCompare(b)).join(' '), Object.keys(HUE_ANGLES).sort((a, b) => a.localeCompare(b)).join(' '));
for (const [hue] of Object.entries(HUE_ANGLES)) { // NOSONAR javascript:S9382 sequential on purpose: the boards are listed by creation order, and the home page reads that order
  const created = await page.request.post(`${API}/boards`, { // NOSONAR javascript:S9382
    ...homeAuth,
    data: {
      title: `Home ${hue}`,
      description: `A ${hue} board`,
      color: homePalette.find(entry => entry.value === hue)._id,
      template: homeTemplate._id,
    },
  });
  check(`a ${hue} board is created`, created.status(), 201);
}
const refusedHex = await page.request.post(`${API}/boards`, {
  ...homeAuth,
  data: { title: 'Home hex', color: homeTemplate.columns[0].color._id ?? homeTemplate.columns[0].color, template: homeTemplate._id },
});
check('a column colour is refused as a board colour', refusedHex.status(), 400);

const homeContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const homePage = await homeContext.newPage();
await homePage.goto(`${FRONT}/login`);
await homePage.locator('form').first().getByLabel('Email address', { exact: true }).fill(gateUser.email);
await homePage.locator('form').first().getByLabel('Password', { exact: true }).fill(gateUser.password);
await homePage.locator('form').first().getByRole('button', { name: /sign in/i }).click();
await homePage.getByText('Your boards').waitFor();
await homePage.locator('main').getByRole('link', { name: 'Home lavender', exact: true }).waitFor();

// The text behind a box, photographed with the glyphs made transparent: the
// lightest pixel is the worst case for light text and the darkest for dark.
const extremeBehind = async (pg, locator, extreme) => {
  await locator.evaluate(element => {
    element.dataset.keptColor = element.style.color;
    element.style.transition = 'none';
    element.style.color = 'transparent';
    element.style.webkitTextFillColor = 'transparent';
  });
  const shot = await locator.screenshot();
  await locator.evaluate(element => {
    element.style.color = element.dataset.keptColor;
    element.style.webkitTextFillColor = '';
    element.style.transition = '';
    delete element.dataset.keptColor;
  });
  return pg.evaluate(
    async ([encoded, wanted]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      let best = null;
      let bestLum = wanted === 'lightest' ? -1 : Infinity;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (wanted === 'lightest' ? lum > bestLum : lum < bestLum) {
          bestLum = lum;
          best = [data[i], data[i + 1], data[i + 2]];
        }
      }
      return best.join(',');
    },
    [shot.toString('base64'), extreme]
  );
};

const heroHeader = homePage.locator('main header').first();
const homeStructure = await homePage.evaluate(() => ({
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent),
  h2: [...document.querySelectorAll('main h2')].map(h => h.textContent),
  tileTitles: document.querySelectorAll('main h3').length,
  levels: [...document.querySelectorAll('main h1, main h2, main h3')].map(h => h.tagName).join(' '),
}));
check('the home page has exactly one h1, the greeting', `${homeStructure.h1.length} ${/^Good (morning|afternoon|evening), Token\.$/.test(homeStructure.h1[0])}`, '1 true');
check('the one h2 is Your boards', homeStructure.h2.join('|'), 'Your boards');
check('every board title is an h3 under it', homeStructure.tileTitles, 6);
check('the headings never skip a level', /^H1 H2( H3)+$/.test(homeStructure.levels), true);

const heroStyle = await styleOf(heroHeader, ['borderTopLeftRadius', 'backgroundImage', 'boxShadow', 'minHeight', 'color']);
check('the hero has the hero radius and is at least 240 pixels tall', `${heroStyle.borderTopLeftRadius} ${heroStyle.minHeight}`, '28px 240px');
check('the hero paints a radial light over a linear gradient', `${heroStyle.backgroundImage.startsWith('radial-gradient')} ${heroStyle.backgroundImage.includes('linear-gradient')}`, 'true true');
check('the hero casts the hero shadow', heroStyle.boxShadow.includes('0px 30px 60px -36px'), true);
check('the hero text is white', await paintOf(homePage, heroStyle.color), '255,255,255');
const heroStops = /linear-gradient\([^]*$/.exec(await tokenValue(homePage, '--gradient-hero'))[0].match(/oklch\([^)]*\)/g);
check('the hero gradient has three stops', heroStops?.length, 3);
await reportPairs(homePage, [['white on the lightest stop of the hero gradient', '#ffffff', heroStops[2], 4.5]]);

const heroFrame = await homePage.locator('main header > div[aria-hidden="true"]').last().evaluate(el => {
  const style = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  return { width: Math.round(el.offsetWidth), height: Math.round(el.offsetHeight), rotate: style.rotate, radius: style.borderTopLeftRadius, hidden: el.getAttribute('aria-hidden'), box: box.width > 0 };
});
check('the photo frame is a 240 by 164 white frame turned 3 degrees', `${heroFrame.width} ${heroFrame.height} ${heroFrame.rotate} ${heroFrame.radius}`, '240 164 3deg 18px');

// The hero text is measured on the pixels behind each box, at each width the
// layout changes at. White on the lightest pixel behind it, the worst case.
const heroTargets = [
  ['the date', 'main header p.font-mono', 4.5],
  ['the greeting', 'main header h1', 3],
  ['the sentence', 'main header p.text-base', 4.5],
  ['a total label', 'main header dt', 4.5],
  ['a total figure', 'main header dd', 3],
];
for (const width of [1440, 1024, 768, 390, 320]) { // NOSONAR javascript:S9382 sequential on purpose: one shared page whose viewport is resized for each width, so the widths cannot overlap
  await homePage.setViewportSize({ width, height: 900 }); // NOSONAR javascript:S9382
  await settled(homePage, { label: `the home page to lay out at ${width}` }); // NOSONAR javascript:S9382
  for (const [label, selector, minimum] of heroTargets) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the shared page's text colour and puts it back
    for (const [index, handle] of (await homePage.locator(selector).all()).entries()) { // NOSONAR javascript:S9382
      const behind = await extremeBehind(homePage, handle, 'lightest'); // NOSONAR javascript:S9382
      await reportPairs(homePage, [[`${label}${index > 0 ? ` ${index + 1}` : ''} at ${width} on the lightest pixel behind it (${behind})`, '#ffffff', `rgb(${behind})`, minimum]]); // NOSONAR javascript:S9382
    }
  }
}
await homePage.setViewportSize({ width: 1440, height: 900 });
await settled(homePage, { label: 'the home page to lay out at 1440' });

const heroLink = homePage.locator('main header').getByRole('link', { name: /^Open / });
check('the hero button opens the board worked on last', await heroLink.getAttribute('href'), await homePage.locator('main').getByRole('link', { name: 'Home lavender', exact: true }).getAttribute('href'));
await reportPairs(homePage, [
  ['the hero button text on its white fill', '--color-ink', '--color-surface', 4.5],
]);

// The tiles. Each cover is the gradient of its hue, built from the same angle
// the token layer declares, and the dot beside the board in the sidebar is the
// mid step of the same hue.
const tileFor = hue => homePage.locator('main [data-hue]', { has: homePage.getByRole('heading', { name: `Home ${hue}` }) });
for (const [hue, angle] of Object.entries(HUE_ANGLES)) { // NOSONAR javascript:S9382 sequential on purpose: one shared page, and the checks are logged in order
  const hueTile = tileFor(hue);
  check(`the ${hue} tile carries its hue`, await hueTile.evaluate(el => el.dataset.hue), hue); // NOSONAR javascript:S9382
  const cover = await hueTile.locator(':scope > div').first().locator(':scope > div').first().evaluate(el => { // NOSONAR javascript:S9382
    const style = getComputedStyle(el);
    return { image: style.backgroundImage, height: el.offsetHeight, radius: style.borderTopLeftRadius };
  });
  check(
    `the ${hue} cover is its three stop gradient from angle ${angle}`,
    ['120deg', `oklch(0.5 0.13 ${angle})`, `oklch(0.66 0.12 ${(angle + 30) % 360})`, `oklch(0.83 0.09 ${(angle + 60) % 360})`].every(part => cover.image.includes(part)),
    true
  );
  check(`the ${hue} cover is 96 pixels tall with rounded top corners`, `${cover.height} ${cover.radius}`, '96 22px');
  const sidebarDot = await homePage.locator(`#app-sidebar a[href="${await hueTile.getByRole('link').first().getAttribute('href')}"] span[data-hue]`).evaluate(el => ({ hue: el.dataset.hue, color: getComputedStyle(el).backgroundColor })); // NOSONAR javascript:S9382
  check(`the ${hue} sidebar dot is the mid step of the same hue`, `${sidebarDot.hue} ${await paintOf(homePage, sidebarDot.color)}`, `${hue} ${await paintOf(homePage, await tokenValue(homePage, `--color-${hue}-mid`))}`); // NOSONAR javascript:S9382
  const fill = await hueTile.getByTestId('progress-fill').evaluate(el => getComputedStyle(el).backgroundColor); // NOSONAR javascript:S9382
  check(`the ${hue} progress fill is the edge step`, await paintOf(homePage, fill), await paintOf(homePage, await tokenValue(homePage, `--color-${hue}-edge`))); // NOSONAR javascript:S9382
}

const sampleTile = tileFor('sky');
const tileStyle = await styleOf(sampleTile, ['borderTopLeftRadius', 'backdropFilter', 'backgroundColor', 'boxShadow', 'position']);
check('a tile has the tile radius, blurs by 14 and is glass', `${tileStyle.borderTopLeftRadius} ${tileStyle.backdropFilter.includes('blur(14px)')} ${tileStyle.backgroundColor}`, '22px true rgba(255, 255, 255, 0.82)');
check('a tile casts the tile shadow', tileStyle.boxShadow.includes('0px 14px 34px -24px'), true);
const tileTitle = await styleOf(sampleTile.getByRole('heading'), ['fontFamily', 'fontSize', 'fontWeight']);
check('a tile title is 17 pixels at 650 in the display face', `${leads(tileTitle.fontFamily, 'Bricolage Grotesque')} ${tileTitle.fontSize} ${tileTitle.fontWeight}`, 'true 17px 650');

// Hover lifts the tile and turns it, and the shadow deepens.
await sampleTile.hover();
await settled(homePage, { label: 'the hovered tile to finish rising' });
const hovered = await styleOf(sampleTile, ['translate', 'rotate', 'boxShadow']);
check('a hovered tile rises 4 pixels', hovered.translate, '0px -4px');
check('a hovered tile turns by 0.6 degrees', hovered.rotate, '-0.6deg');
check('a hovered tile casts the deeper shadow', hovered.boxShadow.includes('0px 26px 44px -24px'), true);
await homePage.mouse.move(5, 5);

// Keyboard focus on a tile draws a ring around the whole tile, not around the
// words of its title: the tile's own outline, offset from its edge.
await homePage.locator('main').getByRole('link', { name: 'Home sky', exact: true }).focus();
await homePage.keyboard.press('Shift+Tab');
await homePage.keyboard.press('Tab');
const tileRing = await homePage.evaluate(() => {
  const focusedTile = document.activeElement.closest('[data-hue]');
  const style = getComputedStyle(focusedTile);
  return {
    onLink: document.activeElement.tagName,
    style: style.outlineStyle,
    width: style.outlineWidth,
    offset: style.outlineOffset,
    color: style.outlineColor,
  };
});
check('the keyboard lands on the tile title link', tileRing.onLink, 'A');
check('a focused tile draws a 2 pixel ring offset by 2 around the whole tile', `${tileRing.style} ${tileRing.width} ${tileRing.offset}`, 'solid 2px 2px');
check('the tile ring is the focus colour', await paintOf(homePage, tileRing.color), await paintOf(homePage, await tokenValue(homePage, '--color-focus')));
await homePage.locator('main').getByRole('button', { name: /^Options for Home sky$/ }).focus();
await homePage.keyboard.press('Shift+Tab');
await homePage.keyboard.press('Tab');
check(
  'the options button has focus without ringing the tile',
  await homePage.evaluate(() => getComputedStyle(document.activeElement.closest('[data-hue]')).outlineStyle),
  'none'
);

// The text on the glass is measured against the darkest pixel painted behind
// it, which is the worst case for dark text.
for (const [label, locator, token, minimum] of [
  ['a tile title', sampleTile.getByRole('heading'), '--color-ink', 4.5],
  ['a tile description', sampleTile.locator('p').first(), '--color-ink-secondary', 4.5],
  ['the progress figure', sampleTile.locator('span.font-mono'), '--color-ink-tertiary', 4.5],
  ['the task count', sampleTile.getByText(/ tasks$/), '--color-ink-tertiary', 4.5],
  ['the updated date', sampleTile.getByText(/^Updated /), '--color-ink-tertiary', 4.5],
  ['the boards count', homePage.getByText(/^\d+ boards$/), '--color-ink-tertiary', 4.5],
  ['the Your boards heading', homePage.getByRole('heading', { name: 'Your boards' }), '--color-ink', 4.5],
]) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the shared page's text colour and puts it back
  const behind = await extremeBehind(homePage, locator, 'darkest'); // NOSONAR javascript:S9382
  await reportPairs(homePage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, minimum]]); // NOSONAR javascript:S9382
}
await reportPairs(homePage, [
  ...Object.keys(HUE_ANGLES).map(hue => [`the owner initials on the ${hue} avatar fill`, '--color-ink', `--color-${hue}-mid`, 4.5]),
  ...Object.entries(HUE_ANGLES).map(([hue, angle]) => [`the white template glyph on the darkest ${hue} cover stop`, '#ffffff', `oklch(0.5 0.13 ${angle})`, 3]),
]);

// The new board tile.
const newTile = homePage.getByText('Fresh board, ready for take-off.').locator('xpath=ancestor::button');
const newStyle = await styleOf(newTile, ['borderTopStyle', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'minHeight', 'backgroundColor']);
check('the new board tile is a 2 pixel dashed outline with the tile radius', `${newStyle.borderTopStyle} ${newStyle.borderTopWidth} ${newStyle.borderTopLeftRadius}`, 'dashed 2px 22px');
check('the new board tile outline is the control border colour, 3:1 or more', await paintOf(homePage, newStyle.borderTopColor), await paintOf(homePage, await tokenValue(homePage, '--color-line-control')));
check('the new board tile is at least 196 pixels tall', Number.parseFloat(newStyle.minHeight) >= 196, true);
for (const [label, locator, token] of [
  ['the new board title', newTile.getByText('New board', { exact: true }), '--color-ink'],
  ['the new board line', newTile.getByText('Fresh board, ready for take-off.'), '--color-ink-secondary'],
]) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the shared page's text colour and puts it back
  const behind = await extremeBehind(homePage, locator, 'darkest'); // NOSONAR javascript:S9382
  await reportPairs(homePage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, 4.5]]); // NOSONAR javascript:S9382
}
await newTile.hover();
await settled(homePage, { label: 'the hovered new board tile to finish rising' });
const newHovered = await styleOf(newTile, ['translate', 'borderTopColor']);
check('a hovered new board tile rises 3 pixels', newHovered.translate, '0px -3px');
check('a hovered new board tile takes the accent outline', await paintOf(homePage, newHovered.borderTopColor), await paintOf(homePage, await tokenValue(homePage, '--color-accent')));
await homePage.mouse.move(5, 5);
await newTile.click();
await homePage.getByRole('dialog', { name: 'Create new board' }).waitFor();
check('the new board tile opens the create board dialog', await homePage.getByRole('dialog', { name: 'Create new board' }).isVisible(), true);

// The dialog offers the six hues, in the hues' own order, as one named group.
const swatches = homePage.getByRole('group', { name: 'Board Color' }).getByRole('radio');
await swatches.first().waitFor();
check('the create dialog offers exactly the six hues', await swatches.count(), 6);
check('the hues are offered in their own order', (await swatches.evaluateAll(radios => radios.map(r => r.labels[0].textContent.trim()))).join(' '), 'Sky Teal Green Sand Coral Lavender');
check('the first hue is the one chosen for a new board', await swatches.first().isChecked(), true);
const swatchFills = await swatches.evaluateAll(radios => radios.map(r => getComputedStyle(r.labels[0].querySelector('span')).backgroundColor));
const midFills = [];
for (const hue of Object.keys(HUE_ANGLES)) midFills.push(await paintOf(homePage, await tokenValue(homePage, `--color-${hue}-mid`))); // NOSONAR javascript:S9382 sequential on purpose: the colours are listed in hue order and compared with the swatches in that order
const paintedSwatches = [];
for (const fill of swatchFills) paintedSwatches.push(await paintOf(homePage, fill)); // NOSONAR javascript:S9382 sequential on purpose: the colours are listed in swatch order
check('each swatch is filled with the mid step of its hue', paintedSwatches.join(' '), midFills.join(' '));
await homePage.keyboard.press('Escape');

// How many tiles share a row at each width, from the rendered boxes.
const tileColumns = () =>
  homePage.evaluate(() => new Set([...document.querySelectorAll('main [data-hue]')].map(card => Math.round(card.getBoundingClientRect().left))).size);
for (const [width, expected] of [[320, 1], [390, 1], [768, 2], [1024, 3], [1440, 4]]) { // NOSONAR javascript:S9382 sequential on purpose: one shared page whose viewport is resized for each width, so the widths cannot overlap
  await homePage.setViewportSize({ width, height: 900 }); // NOSONAR javascript:S9382
  await settled(homePage, { label: `the tiles to lay out at ${width}` }); // NOSONAR javascript:S9382
  check(`at ${width} the tiles share ${expected} column${expected > 1 ? 's' : ''}`, await tileColumns(), expected); // NOSONAR javascript:S9382
  check(`at ${width} the page does not scroll sideways`, await homePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); // NOSONAR javascript:S9382
}
await homeContext.close();

log('\n--- the board page, signed in ---');

// A board with cards in three of its four columns and the last one holding a
// finished card, made through the API for the gate account: the header, a
// card of each priority, a checklist half done and one complete, an owner on
// the cards, an empty column and the last column drawn as where work lands.
const boardMe = (await (await page.request.get(`${API}/auth/me`, homeAuth)).json()).data;
const boardTaskPalette = (await (await page.request.get(`${API}/colors?type=task`, homeAuth)).json()).data;
const gateBoardCreated = await page.request.post(`${API}/boards`, {
  ...homeAuth,
  data: {
    title: 'Board gate',
    description: 'A board made to be measured',
    color: homePalette.find(entry => entry.value === 'green')._id,
    template: homeTemplate._id,
  },
});
const gateBoardData = (await gateBoardCreated.json()).data;
const gateBoardColumns = [...gateBoardData.columns].sort((a, b) => a.order - b.order);
const makeGateTask = (title, column, extra = {}) =>
  page.request.post(`${API}/tasks/board/${gateBoardData._id}`, {
    ...homeAuth,
    data: { title, status: gateBoardColumns[column]._id, color: boardTaskPalette[0]._id, owner: boardMe._id, ...extra },
  });
await makeGateTask('Gate high task', 0, { priority: 'high', checklist: [{ text: 'a', completed: true }, { text: 'b', completed: false }] });
await makeGateTask('Gate low task', 0, { priority: 'low' });
await makeGateTask('Gate medium task', 1, { priority: 'medium', description: 'Written under the title, and not printed on the card' });
await makeGateTask('Gate landed task', 3, { priority: 'low', checklist: [{ text: 'a', completed: true }] });
const gateBoardUrl = `${FRONT}/board/${gateBoardData._id}`;

const signIn = async browserContext => {
  const pg = await browserContext.newPage();
  await pg.goto(`${FRONT}/login`);
  await pg.locator('form').first().getByLabel('Email address', { exact: true }).fill(gateUser.email);
  await pg.locator('form').first().getByLabel('Password', { exact: true }).fill(gateUser.password);
  await pg.locator('form').first().getByRole('button', { name: /sign in/i }).click();
  await pg.getByText('Your boards').waitFor();
  return pg;
};

// Reduced motion for the measurements: the wind layer is absent, so the text is
// measured against the glass and the ground and not against a moving streak.
const boardContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const boardPage = await signIn(boardContext);
await boardPage.goto(gateBoardUrl);
await boardPage.getByRole('region', { name: 'Board columns' }).waitFor();
await boardPage.getByText('Gate high task', { exact: true }).waitFor();
await settled(boardPage, { label: 'the board to stop animating' });

const boardStructure = await boardPage.evaluate(() => ({
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent),
  columns: [...document.querySelectorAll('[role="region"][aria-label="Board columns"] h2')].map(h => h.textContent),
  cardTitles: [...document.querySelectorAll('[data-task-card] h3')].map(h => h.textContent),
  footers: document.querySelectorAll('footer').length,
}));
check('the board page has exactly one h1, the board name', `${boardStructure.h1.length} ${boardStructure.h1[0]}`, '1 Board gate');
check('the columns are headings in board order', boardStructure.columns.join('|'), gateBoardColumns.map(c => c.title).join('|'));
check('every card is an h3', boardStructure.cardTitles.length, 4);

// The header: cover, name, description, progress, the owner and the menu.
const boardHeader = boardPage.locator('main header[data-board-header]');
const headerCover = await boardHeader.locator('div[aria-hidden="true"]').first().evaluate(el => {
  const style = getComputedStyle(el);
  return { width: Math.round(el.offsetWidth), height: Math.round(el.offsetHeight), radius: style.borderTopLeftRadius, image: style.backgroundImage };
});
check('the cover is a 56 pixel square with the float radius', `${headerCover.width} ${headerCover.height} ${headerCover.radius}`, '56 56 18px');
check('the cover is the gradient of the board hue', headerCover.image.includes('oklch(0.5 0.13 150)'), true);
const boardTitleStyle = await styleOf(boardHeader.getByRole('heading', { level: 1 }), ['fontSize', 'fontWeight', 'fontFamily']);
check('the board name is 36 pixels, bold, in the display face', `${boardTitleStyle.fontSize} ${boardTitleStyle.fontWeight} ${boardTitleStyle.fontFamily.startsWith('"Bricolage Grotesque Variable"')}`, '36px 700 true');
const headerProgress = await boardHeader.getByRole('progressbar').evaluate(el => {
  const fill = el.firstElementChild;
  return { height: Math.round(el.offsetHeight), now: el.getAttribute('aria-valuenow'), max: el.getAttribute('aria-valuemax'), text: el.getAttribute('aria-valuetext'), fill: getComputedStyle(fill).backgroundColor, width: Math.round(el.offsetWidth) };
});
check('the progress bar is 8 pixels tall and 190 wide', `${headerProgress.height} ${headerProgress.width}`, '8 190');
check('one of four cards has landed, and the bar says so in words', `${headerProgress.now}/${headerProgress.max} ${headerProgress.text}`, '1/4 1 of 4 landed');
check('the progress fill is the edge step of the board hue', await paintOf(boardPage, headerProgress.fill), await paintOf(boardPage, await tokenValue(boardPage, '--color-green-edge')));
check('the header names one person, the owner, and no stack of members', `${await boardHeader.getByText('Owner: Token Gate').count()} ${await boardHeader.locator('.rounded-full').count()}`, '1 1');

// Every text colour on the board, against the darkest pixel behind it.
for (const [label, locator, token] of [
  ['the board name', boardHeader.getByRole('heading', { level: 1 }), '--color-ink'],
  ['the board description', boardHeader.getByText('A board made to be measured'), '--color-ink-secondary'],
  ['the progress words', boardHeader.getByText('1 of 4 landed'), '--color-ink-secondary'],
  ['the progress figure', boardHeader.getByText('25%'), '--color-ink-tertiary'],
  ['a column name', boardPage.getByRole('heading', { level: 2, name: gateBoardColumns[0].title }), '--color-ink'],
  ['a column count', boardPage.getByRole('heading', { level: 2, name: gateBoardColumns[0].title }).locator('xpath=following-sibling::span[last()]'), '--color-ink-secondary'],
  ['the Still air title', boardPage.getByText('Still air').first(), '--color-ink-secondary'],
  ['the Still air line', boardPage.getByText('Drop a card here or add one below.').first(), '--color-ink-tertiary'],
  ['the composer button', boardPage.getByRole('button', { name: `Add a card to ${gateBoardColumns[0].title}` }), '--color-ink-secondary'],
  ['the breadcrumb link to Home', boardPage.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Home' }), '--color-ink-secondary'],
  ['the breadcrumb link to Boards', boardPage.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Boards' }), '--color-ink-secondary'],
]) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the shared page's text colour and puts it back
  const behind = await extremeBehind(boardPage, locator, 'darkest'); // NOSONAR javascript:S9382
  await reportPairs(boardPage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, 4.5]]); // NOSONAR javascript:S9382
}

// The cards are white, so their text is measured as pairs.
await reportPairs(boardPage, [
  ['a card title on the card', '--color-ink', '--color-surface', 4.5],
  ['the title of a card that has landed on the card', '--color-ink-secondary', '--color-surface', 4.5],
  ['an unfinished checklist figure on the card', '--color-ink-secondary', '--color-surface', 4.5],
  ['a finished checklist figure on the card', '--color-green-deep', '--color-surface', 4.5],
  // The description marker is a graphic that carries information, so 1.4.11
  // asks 3:1 of it. It is drawn in the secondary ink, which clears 4.5.
  ['the description marker on the card', '--color-ink-secondary', '--color-surface', 3],
  ['the low priority chip', '--color-green-deep', '--color-green-tint', 4.5],
  ['the medium priority chip', '--color-sand-deep', '--color-sand-tint', 4.5],
  ['the high priority chip', '--color-coral-deep', '--color-coral-tint', 4.5],
  ['the column outline while a card is over it, against the ground', '--color-sky-edge', '--color-ground', 3],
  ['the gap outline, against the glass', '--color-sky-edge', ['--color-ground', '--color-glass-column'], 3],
]);

// What a column and a card are made of.
const gateColumn = boardPage.locator('[data-column]').first();
const columnStyle = await styleOf(gateColumn, ['width', 'borderTopLeftRadius', 'backgroundColor', 'backdropFilter', 'boxShadow']);
check('a column is 292 pixels wide with the panel radius', `${columnStyle.width} ${columnStyle.borderTopLeftRadius}`, '292px 24px');
check('a column is glass at half white, blurred 14 pixels', `${await paintOf(boardPage, columnStyle.backgroundColor) === await paintOf(boardPage, await tokenValue(boardPage, '--color-glass-column'))} ${columnStyle.backdropFilter.includes('blur(14px)')}`, 'true true');
check('a column casts the column shadow', columnStyle.boxShadow.includes('0px 16px 40px -32px'), true);
const cardStyle = await styleOf(boardPage.locator('[data-task-card]').first(), ['borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'boxShadow', 'backgroundColor', 'marginBottom']);
check('a card has the card radius and padding 12 by 14', `${cardStyle.borderTopLeftRadius} ${cardStyle.paddingTop} ${cardStyle.paddingLeft}`, '16px 12px 14px');
check('a card is white with the resting shadow', `${await paintOf(boardPage, cardStyle.backgroundColor)} ${cardStyle.boxShadow.includes('0px 8px 20px -16px')}`, '255,255,255 true');
check('cards are 10 pixels apart', cardStyle.marginBottom, '10px');

// The description is never printed, and a card that has one carries a small
// icon in its meta row: decorative to the eye, a hint to assistive technology,
// and not part of the card's name.
const describedCard = boardPage.locator('[data-task-card]', { hasText: 'Gate medium task' });
const marker = describedCard.locator('[data-task-description]');
check('exactly one card on the board has a description marker', await boardPage.locator('[data-task-description]').count(), 1);
check('the marker is a 14 pixel icon hidden from assistive technology, with a hint beside it', await marker.evaluate(el => `${el.querySelector('svg').getAttribute('aria-hidden')} ${el.querySelector('svg').getBoundingClientRect().width} ${el.querySelector('.sr-only').textContent}`), 'true 14 Has a description');
check('the marker is drawn in the secondary ink', await paintOf(boardPage, await marker.evaluate(el => getComputedStyle(el).color)), await paintOf(boardPage, await tokenValue(boardPage, '--color-ink-secondary')));
check('the card is still named by its title alone', await describedCard.getAttribute('aria-labelledby').then(id => boardPage.locator(`[id="${id}"]`).textContent()), 'Gate medium task');
check('the description text is not on the page', await boardPage.getByText('Written under the title').count(), 0);

// The breadcrumb's two links, Home and Boards: each with a keyboard focus ring
// and a target of at least 24 pixels, leaving the board's own name as text.
const crumbNav = boardPage.getByRole('navigation', { name: 'Breadcrumb' });
for (const name of ['Home', 'Boards']) { // NOSONAR javascript:S9382 sequential on purpose: one keyboard, and each link is focused and left in turn
  const crumb = crumbNav.getByRole('link', { name });
  check(`the breadcrumb link to ${name} is 32 pixels tall at a desktop width, above the 24 pixel minimum`, await crumb.evaluate(el => Math.round(el.getBoundingClientRect().height)), 32); // NOSONAR javascript:S9382
  check(`a keyboard focused breadcrumb link to ${name} draws a 2px outline offset by 2px`, await (async () => { // NOSONAR javascript:S9382
    await crumb.focus();
    await boardPage.keyboard.press('Shift+Tab');
    await boardPage.keyboard.press('Tab');
    return crumb.evaluate(el => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineOffset}`; });
  })(), 'solid 2px 2px');
}
check('the two breadcrumb separators are in the tertiary ink', await crumbNav.locator('li[aria-hidden="true"]').evaluateAll(items => items.map(li => getComputedStyle(li).color)).then(async colors => (await Promise.all(colors.map(c => paintOf(boardPage, c)))).join('|')), [await paintOf(boardPage, await tokenValue(boardPage, '--color-ink-tertiary')), await paintOf(boardPage, await tokenValue(boardPage, '--color-ink-tertiary'))].join('|'));
check('the board name in the breadcrumb is text, not a link', await boardPage.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]').evaluate(el => `${el.tagName} ${el.closest('a') === null}`), 'LI true');
const landedColumn = boardPage.locator('[data-column]').nth(3);
check('the last column has the arrival icon and a green dot, and keeps its own name', `${await landedColumn.locator('h2 ~ svg').count()} ${await landedColumn.getByRole('heading', { level: 2 }).textContent()}`, `1 ${gateBoardColumns[3].title}`);
check('the card in the last column is drawn as done, in the secondary text', await paintOf(boardPage, await landedColumn.getByRole('button', { name: 'Gate landed task', exact: true }).evaluate(el => getComputedStyle(el).color)), await paintOf(boardPage, await tokenValue(boardPage, '--color-ink-secondary')));
check('an empty column says Still air', await boardPage.locator('[data-column]').nth(2).getByText('Still air').isVisible(), true);

// The composer, open, is a field like any other: the control border and the
// focus colour.
await boardPage.getByRole('button', { name: `Add a card to ${gateBoardColumns[0].title}` }).click();
const composerField = boardPage.getByRole('textbox', { name: /new card in/i });
await composerField.waitFor();
await settled(boardPage, { label: 'the composer to finish opening' });
const composerStyle = await styleOf(composerField, ['borderTopColor', 'boxShadow', 'borderTopLeftRadius']);
check('the open composer field is focused and draws the focus colour and its halo', `${await paintOf(boardPage, composerStyle.borderTopColor) === await paintOf(boardPage, await tokenValue(boardPage, '--color-focus'))} ${composerStyle.boxShadow.includes('0px 0px 0px 4px')}`, 'true true');
await composerField.fill('x');
await boardPage.getByRole('button', { name: 'Done', exact: true }).click();
await boardPage.getByRole('button', { name: `Add a card to ${gateBoardColumns[0].title}` }).waitFor();
check('closing the composer gives focus back to its button', await boardPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), `Add a card to ${gateBoardColumns[0].title}`);
// The draft only: the session lives in the same storage and the drag below
// needs it.
await boardPage.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) if (key.startsWith('breezyboard:draft:')) window.localStorage.removeItem(key);
});

// Picks a card up with the mouse, carries it to a column and holds it there,
// reading what is on screen, then lets go and reads the landing. The same
// walk is made with motion on and with reduced motion, since the claim is
// about both.
const carry = async (pg, title, toColumn) => {
  // A press while the page is still arriving lands where the handle was and
  // not where it is: the cards are waited for, not a fixed time.
  await pg.waitForFunction(() =>
    [...document.querySelectorAll('[data-task-card]')].every(card => {
      const style = getComputedStyle(card);
      return style.opacity === '1' && style.transform === 'none';
    }),
  );
  const handle = pg.locator('[data-task-card]', { hasText: title }).locator('[aria-label="Drag handle"]');
  const from = await handle.boundingBox();
  const target = await pg.getByRole('heading', { level: 2, name: toColumn }).boundingBox();
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  await pg.mouse.move(cx, cy);
  await pg.mouse.down();
  // Paces the input: the sensor needs the press and the first move apart.
  await pg.waitForTimeout(100); // NOSONAR javascript:S2925 the pause is the input itself, nothing observable says when to send the next move
  await pg.mouse.move(cx + 12, cy + 12);
  // The copy that follows the pointer is what says the card is in the air; the
  // announcement is replaced as soon as the card moves.
  await pg.locator('[data-task-card][aria-hidden="true"]').waitFor({ state: 'attached' });
  for (let step = 1; step <= 25; step += 1) { // NOSONAR javascript:S9382 sequential on purpose: one pointer, and each move is the next point of the path
    await pg.mouse.move(from.x + (target.x + 150 - from.x) * (step / 25), from.y + (target.y + 220 - from.y) * (step / 25), { steps: 2 }); // NOSONAR javascript:S9382
    await pg.waitForTimeout(25); // NOSONAR javascript:S2925 javascript:S9382 paces the pointer, dnd-kit coalesces a burst of moves
  }
  // Held until the target column is the one lit: the card is over it, which is
  // what a person waits for before letting go. A column that never lights is
  // left for the checks to report, with what was on screen.
  const lit = await pg
    .locator('[data-column][data-highlighted] h2', { hasText: toColumn })
    .waitFor({ state: 'attached', timeout: WAIT_MS })
    .then(() => true, () => false);
  // The gap opens and the column brightens over a few hundred milliseconds,
  // and what is read next is where they come to rest.
  if (lit) await settled(pg, { within: '[data-column][data-highlighted]', label: 'the lit column and its gap to come to rest' });
};

const held = pg =>
  pg.evaluate(() => {
    const gap = document.querySelector('[data-drop-gap]');
    const gapStyle = gap && getComputedStyle(gap);
    const lit = [...document.querySelectorAll('[data-column][data-highlighted]')];
    const litStyle = lit[0] && getComputedStyle(lit[0]);
    const overlay = [...document.querySelectorAll('[data-task-card][aria-hidden="true"]')][0];
    const overlayStyle = overlay && getComputedStyle(overlay);
    const noRoom = [...document.querySelectorAll('[data-task-card]:not([aria-hidden])')].filter(card => card.offsetHeight === 0);
    return {
      gap: gap && {
        height: Math.round(gap.getBoundingClientRect().height),
        border: `${gapStyle.borderTopStyle} ${gapStyle.borderTopWidth}`,
        borderColor: gapStyle.borderTopColor,
        background: gapStyle.backgroundColor,
        duration: gapStyle.animationDuration,
        inColumn: gap.closest('[data-column]').querySelector('h2').textContent,
        hidden: gap.getAttribute('aria-hidden'),
      },
      lit: lit.map(column => column.querySelector('h2').textContent),
      litBackground: litStyle?.backgroundColor,
      litBorder: litStyle?.borderTopColor,
      overlay: overlay && { rotate: overlayStyle.rotate, scale: overlayStyle.scale, hidden: overlay.getAttribute('aria-hidden') },
      collapsed: noRoom.map(card => card.querySelector('h3').textContent),
    };
  });

const toMs = value => Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);

{
  const mode = 'reduced motion';
  const pg = boardPage;
  await carry(pg, 'Gate low task', gateBoardColumns[1].title);
  const h = await held(pg);
  check(`${mode}: the column under the card is the one that is lit`, h.lit.join('|'), gateBoardColumns[1].title);
  check(`${mode}: the lit column is brighter glass with the sky edge as its outline`, `${await paintOf(pg, h.litBackground) === await paintOf(pg, await tokenValue(pg, '--color-glass-strong'))} ${await paintOf(pg, h.litBorder) === await paintOf(pg, await tokenValue(pg, '--color-sky-edge'))}`, 'true true');
  check(`${mode}: the gap is 58 pixels tall and a dashed 2 pixel outline, in that column`, `${h.gap?.height} ${h.gap?.border} ${h.gap?.inColumn}`, `58 dashed 2px ${gateBoardColumns[1].title}`);
  check(`${mode}: the gap is outlined in the sky edge`, h.gap && (await paintOf(pg, h.gap.borderColor)), await paintOf(pg, await tokenValue(pg, '--color-sky-edge')));
  check(`${mode}: the gap is hidden from assistive technology`, h.gap?.hidden, 'true');
  check(`${mode}: the card that is held takes no room where it was`, h.collapsed.join('|'), 'Gate low task');
  check(`${mode}: the copy that follows the pointer is tilted, enlarged and hidden from assistive technology`, `${h.overlay?.rotate} ${h.overlay?.scale} ${h.overlay?.hidden}`, '3deg 1.03 true');
  check(`${mode}: the gap's opening animation is collapsed to an instant`, h.gap && toMs(h.gap.duration) < 1, true);
  await pg.mouse.up();
  // The card is read once it has been put in its new column, which the page does
  // before the server answers; a fixed wait reads the frame before that.
  await pg
    .waitForFunction(
      ([title, column]) =>
        [...document.querySelectorAll('[data-task-card]')].some(
          card => card.querySelector('h3')?.textContent === title && card.closest('[data-column]')?.querySelector('h2')?.textContent === column,
        ),
      ['Gate low task', gateBoardColumns[1].title],
      { timeout: 5000 },
    )
    .catch(() => {});
  const landed = await pg.evaluate(title => {
    const card = [...document.querySelectorAll('[data-task-card]')].find(c => c.querySelector('h3')?.textContent === title);
    return { column: card?.closest('[data-column]')?.querySelector('h2').textContent, duration: card && getComputedStyle(card).animationDuration, gaps: document.querySelectorAll('[data-drop-gap]').length, lit: document.querySelectorAll('[data-highlighted]').length };
  }, 'Gate low task');
  check(`${mode}: the card lands in the column it was carried to`, landed.column, gateBoardColumns[1].title);
  check(`${mode}: no gap and no highlight are left behind`, `${landed.gaps} ${landed.lit}`, '0 0');
  await until(pg, 'the landing flag to clear', () => document.querySelector('[data-landed]') === null).catch(() => {});
  check(`${mode}: the landing flag is gone once the card has settled`, await pg.locator('[data-landed]').count(), 0);
  void context;
}

log('\n--- the task modal, signed in at 1440 ---');

// A card with an owner, a priority and a checklist half done, opened in the
// page that has reduced motion, so the wind is absent from the header strip
// and the text on it is measured against the gradient alone.
await boardPage.getByRole('button', { name: 'Gate high task', exact: true }).click();
const taskModal = boardPage.getByRole('dialog', { name: 'Edit task' });
await taskModal.waitFor();
await settled(boardPage, { within: '[role="dialog"]', label: 'the task modal to finish opening' });

const modalStyle = await styleOf(taskModal, ['borderTopLeftRadius', 'boxShadow', 'backgroundColor', 'width']);
check('the panel is white with the modal radius, the modal shadow and the 672 pixel cap', `${modalStyle.borderTopLeftRadius} ${modalStyle.boxShadow.includes('0px 40px 80px -30px')} ${await paintOf(boardPage, modalStyle.backgroundColor) === '255,255,255'} ${modalStyle.width}`, '26px true true 672px');
check('the dialog is named, modal, and has a visually hidden h2 for its sections', `${await taskModal.getAttribute('aria-modal')} ${await taskModal.locator(':scope > div').first().locator('h2.sr-only').count()}`, 'true 1');

const strip = await taskModal.locator(':scope > div').first().evaluate(el => ({
  height: Math.round(el.offsetHeight),
  image: getComputedStyle(el.querySelector('[aria-hidden="true"]')).backgroundImage,
  hiddenChildren: [...el.querySelectorAll('[aria-hidden="true"]')].filter(hidden => hidden.querySelector('button')).length,
}));
check('the header strip is 100 pixels tall', strip.height, 100);
check('the header strip is the gradient of the board hue', strip.image.includes('oklch(0.5 0.13 150)'), true);
check('no control sits inside the hidden gradient', strip.hiddenChildren, 0);
check('without wind under reduced motion the strip draws none', await taskModal.locator(':scope > div').first().locator('div.pointer-events-none').count(), 0);

const place = taskModal.locator('[data-task-place]');
check('the pill names the board and the column', (await place.innerText()).trim(), `Board gate · ${gateBoardColumns[0].title}`);
const placeStyle = await styleOf(place, ['fontSize', 'fontWeight', 'backgroundColor']);
check('the pill is 13 pixels, 600, on white glass at 82 percent', `${placeStyle.fontSize} ${placeStyle.fontWeight} ${placeStyle.backgroundColor}`, '13px 600 rgba(255, 255, 255, 0.82)');

// Text and glyphs on the strip, against the darkest pixel behind them.
for (const [label, locator, token, minimum] of [
  ['the place pill text', place.locator('span').last(), '--color-ink', 4.5],
  ['the close glyph', taskModal.getByRole('button', { name: 'Close' }), '--color-ink-secondary', 3],
]) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the shared page's text colour and puts it back
  const behind = await extremeBehind(boardPage, locator, 'darkest'); // NOSONAR javascript:S9382
  await reportPairs(boardPage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, minimum]]); // NOSONAR javascript:S9382
}

await reportPairs(boardPage, [
  ['a column button that is not pressed, on the panel', '--color-ink-secondary', '--color-surface', 4.5],
  ['its border, on the panel', '--color-line-control', '--color-surface', 3],
  ['the pressed column button, white on ink', '#ffffff', '--color-ink', 4.5],
  ['the chosen priority outline, on the panel', '--color-coral-edge', '--color-surface', 3],
  ['the chosen priority text, on its tint', '--color-coral-deep', '--color-coral-tint', 4.5],
  ['the unchosen priority text, on the panel', '--color-ink-secondary', '--color-surface', 4.5],
  ['the checklist count, on the panel', '--color-ink-secondary', '--color-surface', 4.5],
  ['a finished checklist item, on the panel', '--color-ink-secondary', '--color-surface', 4.5],
  ['the Add an item placeholder, on the panel', '--color-ink-tertiary', '--color-surface', 4.5],
  ['the checklist progress fill, on the track', '--color-green-edge', ['--color-surface', '--color-line-07'], 3],
  ['Blow it away, on the footer', '--color-danger', '--color-surface-subtle', 4.5],
  ['the checklist remove glyph, on the panel', '--color-danger', '--color-surface', 3],
]);

// What the row of columns and the chips are made of.
const pressedStyle = await styleOf(taskModal.getByRole('button', { name: `Move to ${gateBoardColumns[0].title}`, exact: true }), ['backgroundColor', 'color', 'height', 'borderTopLeftRadius']);
check('the pressed column is filled with ink, in white, 34 pixels tall with the small button radius', `${await paintOf(boardPage, pressedStyle.backgroundColor) === await paintOf(boardPage, await tokenValue(boardPage, '--color-ink'))} ${await paintOf(boardPage, pressedStyle.color)} ${pressedStyle.height} ${pressedStyle.borderTopLeftRadius}`, 'true 255,255,255 34px 10px');
const idleColumn = await styleOf(taskModal.getByRole('button', { name: `Move to ${gateBoardColumns[1].title}`, exact: true }), ['borderTopColor', 'borderTopWidth']);
// The border is 1.5 pixels in the source and computes to 1 at a device pixel
// ratio of 1, which is how the browser rounds a border width.
check('a column that is not pressed carries the control border', `${await paintOf(boardPage, idleColumn.borderTopColor) === await paintOf(boardPage, await tokenValue(boardPage, '--color-line-control'))} ${idleColumn.borderTopWidth}`, 'true 1px');
const chosenPriority = await styleOf(taskModal.locator('label:has(input[value="high"])'), ['backgroundColor', 'color', 'borderTopColor', 'height']);
check('the chosen priority is the coral tint, deep text and edge outline', `${await paintOf(boardPage, chosenPriority.backgroundColor) === await paintOf(boardPage, await tokenValue(boardPage, '--color-coral-tint'))} ${await paintOf(boardPage, chosenPriority.color) === await paintOf(boardPage, await tokenValue(boardPage, '--color-coral-deep'))} ${await paintOf(boardPage, chosenPriority.borderTopColor) === await paintOf(boardPage, await tokenValue(boardPage, '--color-coral-edge'))}`, 'true true true');
check('the chosen priority has its check and the others none', `${await taskModal.locator('label:has(input[value="high"]) svg').evaluate(svg => getComputedStyle(svg).display)} ${await taskModal.locator('label:has(input[value="low"]) svg').evaluate(svg => getComputedStyle(svg).display)}`, 'block none');
check('a priority chip is 36 pixels tall from the medium breakpoint', chosenPriority.height, '36px');

const checklistBar = await taskModal.getByRole('progressbar', { name: 'Checklist progress' }).evaluate(el => ({ now: el.getAttribute('aria-valuenow'), max: el.getAttribute('aria-valuemax'), text: el.getAttribute('aria-valuetext'), height: Math.round(el.offsetHeight), image: getComputedStyle(el.firstElementChild).backgroundImage }));
check('the checklist bar is 6 pixels tall, one of two done, in words', `${checklistBar.height} ${checklistBar.now}/${checklistBar.max} ${checklistBar.text}`, '6 1/2 1 of 2 done');
check('the checklist bar runs from the sky edge to the green edge', checklistBar.image.includes('oklch(0.6 0.1 232)') && checklistBar.image.includes('oklch(0.6 0.1 150)'), true);
const doneItem = await taskModal.getByRole('textbox', { name: 'Checklist item 1' }).evaluate(el => ({ decoration: getComputedStyle(el).textDecorationLine, color: getComputedStyle(el).color }));
check('a finished checklist item is struck through in the secondary ink', `${doneItem.decoration} ${await paintOf(boardPage, doneItem.color) === await paintOf(boardPage, await tokenValue(boardPage, '--color-ink-secondary'))}`, 'line-through true');

// Targets and rings, measured at rest.
const targetSizes = await taskModal.evaluate(modal => {
  const size = el => [Math.round(el.offsetWidth), Math.round(el.offsetHeight)].join('x');
  return {
    close: size(modal.querySelector('button[aria-label="Close"]')),
    save: size(modal.querySelector('button[type="submit"]')),
    blow: size([...modal.querySelectorAll('button')].find(b => /blow it away/i.test(b.textContent))),
    owner: size(modal.querySelector('[role="combobox"]')),
  };
});
check('the close button is a 36 pixel disc', targetSizes.close, '36x36');
check('Done and Blow it away are 44 pixels tall', `${targetSizes.save.split('x')[1]} ${targetSizes.blow.split('x')[1]}`, '44 44');
{
  // The footer is a "Blow it away" on the left and one dark "Done" on the right,
  // and nothing else: no Cancel, no Save.
  const footer = await taskModal.evaluate(modal => {
    const done = modal.querySelector('button[type="submit"]');
    const row = done.parentElement;
    const buttons = [...row.querySelectorAll('button')];
    const blow = buttons.find(b => /blow it away/i.test(b.textContent));
    return {
      labels: buttons.map(b => b.textContent.trim()).join('|'),
      blowLeftOfDone: blow.getBoundingClientRect().right < done.getBoundingClientRect().left,
      doneAtRight: Math.round(modal.getBoundingClientRect().right - done.getBoundingClientRect().right),
      bg: getComputedStyle(done).backgroundColor,
      blowBg: getComputedStyle(blow).backgroundColor,
    };
  });
  check('the footer holds Blow it away and Done and nothing else', footer.labels, 'Blow it away|Done');
  check('Blow it away is on the left of Done', footer.blowLeftOfDone, true);
  check('Done is the one dark button, filled with ink', `${await paintOf(boardPage, footer.bg) === await paintOf(boardPage, await tokenValue(boardPage, '--color-ink'))} ${await paintOf(boardPage, footer.blowBg)}`, 'true 255,255,255');
  check('Done is at the right edge of the dialog, inside its padding', footer.doneAtRight > 0 && footer.doneAtRight <= 40, true);
}
check('the field at the foot of the checklist is named Add an item, and is not a button', `${await taskModal.getByRole('textbox', { name: 'Add an item' }).count()} ${await taskModal.getByRole('button', { name: /add item/i }).count()}`, '1 0');
check('the Add an item field is a text input with its own border', await taskModal.getByRole('textbox', { name: 'Add an item' }).evaluate(el => `${el.type} ${getComputedStyle(el).borderTopWidth}`), 'text 1px');
check('the owner field is 48 pixels tall', targetSizes.owner.split('x')[1], '48');
const moveFocus = await focusRing(boardPage, taskModal.getByRole('button', { name: `Move to ${gateBoardColumns[1].title}`, exact: true }));
check('a column button has the 2 pixel focus ring', moveFocus, 'solid 2px 2px');
const blowFocus = await focusRing(boardPage, taskModal.getByRole('button', { name: 'Blow it away' }));
check('Blow it away has the 2 pixel focus ring', blowFocus, 'solid 2px 2px');
await boardPage.keyboard.press('Escape');
await boardPage.getByRole('dialog').waitFor({ state: 'detached' });
await boardPage.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) if (key.startsWith('breezyboard:draft:')) window.localStorage.removeItem(key);
});

await boardContext.close();

// With motion on.
const motionContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const motionPage = await signIn(motionContext);
await motionPage.goto(gateBoardUrl);
await motionPage.getByRole('region', { name: 'Board columns' }).waitFor();
await motionPage.getByText('Gate high task', { exact: true }).waitFor();
await settled(motionPage, { label: 'the board to stop animating with motion on' });
{
  const mode = 'motion on';
  await carry(motionPage, 'Gate medium task', gateBoardColumns[2].title);
  const h = await held(motionPage);
  check(`${mode}: the column under the card is the one that is lit`, h.lit.join('|'), gateBoardColumns[2].title);
  check(`${mode}: the gap is 58 pixels tall and a dashed 2 pixel outline, in that column`, `${h.gap?.height} ${h.gap?.border} ${h.gap?.inColumn}`, `58 dashed 2px ${gateBoardColumns[2].title}`);
  check(`${mode}: the gap opens over 180 milliseconds`, h.gap?.duration, '0.18s');
  check(`${mode}: the copy that follows the pointer is tilted and enlarged`, `${h.overlay?.rotate} ${h.overlay?.scale}`, '3deg 1.03');
  // Where the gap is, between the cards that stay: the card under the held one
  // in this column is the one that was dropped on, so the gap is before it.
  // The landing lasts 550 milliseconds, which a stalled page can outlast before
  // a query reaches it, so its start is heard as an event from before the drop
  // and the card is read at that moment.
  await motionPage.evaluate(
    ([title, limit]) => {
      window.__landing = new Promise(resolve => {
        document.addEventListener(
          'animationstart',
          event => {
            const card = event.target;
            if (event.animationName !== 'bbLand' || !(card instanceof Element) || card.querySelector('h3')?.textContent !== title) return;
            const style = getComputedStyle(card);
            resolve({
              column: card.closest('[data-column]')?.querySelector('h2').textContent,
              animation: style.animationName,
              duration: style.animationDuration,
              easing: style.animationTimingFunction,
              running: card.getAnimations().map(a => a.animationName),
            });
          },
          true
        );
        setTimeout(() => resolve({ column: undefined, animation: 'no animation started', duration: '', easing: '', running: [] }), limit);
      });
    },
    ['Gate medium task', WAIT_MS]
  );
  await motionPage.mouse.up();
  const landing = await motionPage.evaluate(() => window.__landing);
  check(`${mode}: the card lands in the column it was carried to`, landing.column, gateBoardColumns[2].title);
  check(`${mode}: the landing is bbLand over 550 milliseconds`, `${landing.animation} ${landing.duration}`, 'bbLand 0.55s');
  check(`${mode}: the landing is running on the card`, landing.running.includes('bbLand'), true);
  await until(motionPage, 'the landing flag to clear', () => document.querySelector('[data-landed]') === null).catch(() => {});
  check(`${mode}: the landing flag is cleared by the end of the animation`, await motionPage.locator('[data-landed]').count(), 0);
  check(`${mode}: a card that is not landing does not animate (the stored level is breezy)`, await motionPage.evaluate(() => [...document.querySelectorAll('[data-task-card]')].filter(c => getComputedStyle(c).animationName !== 'none').length), 0);
}
await motionContext.close();

// Gusty weather: every card sways, out of step with its neighbours, and a
// system that asks for reduced motion holds them still without touching the
// stored choice.
await page.request.put(`${API}/users/${boardMe._id}`, { ...homeAuth, data: { breeze: 'gusty' } });
const gustyContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const gustyPage = await signIn(gustyContext);
await gustyPage.goto(gateBoardUrl);
await gustyPage.getByText('Gate high task', { exact: true }).waitFor();
await settled(gustyPage, { label: 'the gusty board to stop animating' });
const sway = await gustyPage.evaluate(() => [...document.querySelectorAll('[data-task-card]')].map(c => `${getComputedStyle(c).animationName} ${getComputedStyle(c).animationDuration} ${getComputedStyle(c).animationDelay}`));
check('at gusty every card sways', sway.every(entry => entry.startsWith('bbSway')), true);
check('the sway of two cards is out of step', new Set(sway).size > 1, true);
await gustyContext.close();

const stillContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const stillPage = await signIn(stillContext);
await stillPage.goto(gateBoardUrl);
await stillPage.getByText('Gate high task', { exact: true }).waitFor();
await settled(stillPage, { label: 'the board to stop animating under reduced motion' });
check('reduced motion holds the cards still at the stored gusty', await stillPage.evaluate(() => [...document.querySelectorAll('[data-task-card]')].every(c => getComputedStyle(c).animationName === 'none')), true);
check('and leaves the stored choice alone', (await (await page.request.get(`${API}/auth/me`, homeAuth)).json()).data.breeze, 'gusty');
await stillContext.close();
await page.request.put(`${API}/users/${boardMe._id}`, { ...homeAuth, data: { breeze: 'breezy' } });

log('\n--- the reduced motion policy ---');

// A person who asks the system for less motion gets animations and
// transitions collapsed to an instant. The collapse must not break what
// waits on an animation to finish: a dialog unmounts only after its exit
// completes, so a dialog that opens and then never leaves the page under
// this setting would be the failure to catch.
// The opening is recorded on every frame, from before the click until the panel
// is at rest. Which frame shows what depends on how long frames take, so no
// claim is made about a frame number: the first frame is the panel's initial
// values, and what lies between that and rest says whether it travelled. A
// reduced motion preference drops the transform at once, so the recording holds
// at most the initial transform and rest. A panel that played its entrance
// holds the values in between as well.
const sampleOpening = async pg => {
  await armAppearance(pg, '[role="dialog"]');
  await pg.getByRole('button', { name: 'Forgot it?' }).click();
  return readAppearance(pg);
};

const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const calmPage = await calm.newPage();
await calmPage.goto(`${FRONT}/login`);
await calmPage.waitForSelector('form');

const collapsed = await calmPage.evaluate(() => {
  const sample = document.createElement('div');
  sample.style.transition = 'opacity 2s';
  sample.style.animation = 'spin 3s linear infinite';
  document.body.appendChild(sample);
  const style = getComputedStyle(sample);
  const out = {
    transition: Number.parseFloat(style.transitionDuration) * (style.transitionDuration.endsWith('ms') ? 1 : 1000),
    animation: Number.parseFloat(style.animationDuration) * (style.animationDuration.endsWith('ms') ? 1 : 1000),
    iterations: style.animationIterationCount,
  };
  sample.remove();
  return out;
});
check('a 2s transition collapses to under 1ms', collapsed.transition < 1, true);
check('a 3s animation collapses to under 1ms', collapsed.animation < 1, true);
check('an infinite animation plays once', collapsed.iterations, '1');

// Every named animation of the token layer, not a probe of the rule alone: a
// new `--animate-*` token that reached the page some other way would not be
// caught by the generic probe above.
const animationTokens = await calmPage.evaluate(() =>
  [
    'bb-up',
    'bb-fade',
    'bb-in',
    'bb-land',
    'bb-away',
    'bb-pop',
    'bb-gap',
    'bb-spin',
    'bb-shake',
    'bb-sway',
    'bb-toast',
  ].map(name => {
    const sample = document.createElement('div');
    sample.style.animation = `var(--animate-${name})`;
    document.body.appendChild(sample);
    const style = getComputedStyle(sample);
    const duration = Number.parseFloat(style.animationDuration) * (style.animationDuration.endsWith('ms') ? 1 : 1000);
    const out = [name, style.animationName, duration, style.animationIterationCount];
    sample.remove();
    return out;
  })
);
for (const [name, animationName, duration, iterations] of animationTokens) {
  check(`--animate-${name} names a keyframe set`, animationName !== 'none', true);
  check(`--animate-${name} collapses to under 1ms and plays once`, duration < 1 && iterations === '1', true);
}

await mountPrimitives(calmPage, windBox, { level: 'gusty', tone: 'light' });
check('under reduced motion the wind layer is not rendered at all', await calmPage.locator('#wind-box > div').count(), 0);
check('under reduced motion nothing in the box is animated', await calmPage.evaluate(() => document.getElementById('wind-box').getAnimations({ subtree: true }).length), 0);
await unmountPrimitives(calmPage);
const calmOpening = await sampleOpening(calmPage);
const dialog = calmPage.getByRole('dialog');
await dialog.waitFor({ state: 'visible' });
check('a dialog opens under reduced motion', await dialog.isVisible(), true);
check('under reduced motion the panel does not travel or scale', distinctMidTransforms(calmOpening) <= 1, true);
check('under reduced motion the panel still fades in', calmOpening[0].opacity < 1, true);
await calmPage.keyboard.press('Escape');
await dialog.waitFor({ state: 'detached', timeout: WAIT_MS }).catch(() => {});
check('the dialog unmounts after its exit under reduced motion', await dialog.count(), 0);

await calm.close();

const normal = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const normalPage = await normal.newPage();
await normalPage.goto(`${FRONT}/login`);
await normalPage.waitForSelector('form');
const normalOpening = await sampleOpening(normalPage);
const normalDialog = normalPage.getByRole('dialog');
await normalDialog.waitFor({ state: 'visible' });
check('with motion on the panel rises and scales in', isIdentity(normalOpening[0].transform), false);
check('with motion on the panel fades in', normalOpening[0].opacity < 1, true);
await normalPage.keyboard.press('Escape');
await normalDialog.waitFor({ state: 'detached', timeout: WAIT_MS }).catch(() => {});
check('the dialog unmounts after its exit with motion on', await normalDialog.count(), 0);
await normal.close();

log('\n--- the task modal: its entrance with motion on and reduced, and the layer that leaves ---');

// The board is heavy to paint and a frame can take 100 to 250 milliseconds, so
// a count of frames says nothing about elapsed time here. The opening is
// recorded on every frame from before the click until the dialog is at rest,
// and read from the series: its first frame holds the initial values, where a
// panel that travels starts translated and scaled, and both start transparent.
// Under reduced motion the same initial values are there for that first frame
// and the transform collapses to its rest value, not played over 350
// milliseconds, so the series holds at most the initial transform and rest.
const modalPage = async (reducedMotion, size) => {
  const modalContext = await browser.newContext({ viewport: size, reducedMotion });
  const pg = await signIn(modalContext);
  await pg.goto(gateBoardUrl);
  await pg.getByRole('region', { name: 'Board columns' }).waitFor();
  await pg.getByText('Gate medium task', { exact: true }).waitFor();
  await settled(pg, { label: 'the board to stop animating before the modal opens' });
  return { pg, modalContext };
};

const sampleModalOpening = async pg => {
  await armAppearance(pg, '[role="dialog"]');
  await pg.evaluate(() => document.querySelector('[data-task-open]').click());
  return readAppearance(pg);
};

/** The translation along y of a `matrix(...)`, and the scale along x. */
const matrixOf = transform => {
  const parts = /matrix\(([^)]+)\)/.exec(transform)?.[1].split(',').map(Number);
  return parts ? { scale: parts[0], ty: parts[5] } : { scale: 1, ty: 0 };
};

// Closed from inside the page and read at the moment the wrapper reports that
// it takes no pointer, while the panel is still leaving: the wrapper fixed over
// the screen has to let a pointer through to what is behind it, or the first
// press after a save lands on it. The moment is reported by a mutation
// observer, so it does not depend on which frame a stalled page reaches first.
// If the wrapper is gone before it ever said so, `stillMounted` is false and it
// never made that claim.
const sampleLeaving = pg =>
  pg.evaluate(
    limit =>
      new Promise(resolve => {
        const leavingPanel = document.querySelector('[role="dialog"]');
        const wrapper = leavingPanel.parentElement;
        const scrim = leavingPanel.previousElementSibling;
        const box = document.querySelector('[data-task-card]').getBoundingClientRect();
        const read = () => {
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return {
            stillMounted: wrapper.isConnected,
            wrapper: getComputedStyle(wrapper).pointerEvents,
            scrim: getComputedStyle(scrim).pointerEvents,
            panel: getComputedStyle(leavingPanel).pointerEvents,
            hitIsInsideWrapper: wrapper.contains(hit),
            hitIsTheCard: Boolean(hit?.closest('[data-task-card]')),
          };
        };
        const observer = new MutationObserver(() => {
          if (!wrapper.isConnected || getComputedStyle(wrapper).pointerEvents === 'none') {
            observer.disconnect();
            resolve(read());
          }
        });
        observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        setTimeout(() => {
          observer.disconnect();
          resolve(read());
        }, limit);
      }),
    WAIT_MS
  );

for (const [mode, reducedMotion] of [['motion on', 'no-preference'], ['reduced motion', 'reduce']]) { // NOSONAR javascript:S9382 sequential on purpose: each pass is a page of its own that is closed before the next one opens, and the checks are logged in order
  const { pg, modalContext } = await modalPage(reducedMotion, { width: 1440, height: 900 }); // NOSONAR javascript:S9382
  const frames = await sampleModalOpening(pg); // NOSONAR javascript:S9382
  const opening = frames[0];
  await pg.getByRole('dialog').waitFor({ state: 'visible' }); // NOSONAR javascript:S9382
  check(`${mode}, at 1440: the modal fades in, starting transparent`, opening.opacity < 1, true);
  if (reducedMotion === 'no-preference') {
    check(`${mode}, at 1440: the modal starts raised and scaled down`, isIdentity(opening.transform), false);
  } else {
    check(`${mode}, at 1440: the modal comes to rest without travelling`, distinctMidTransforms(frames) <= 1, true);
  }
  await settled(pg, { within: '[role="dialog"]', label: 'the modal to finish opening at 1440' }); // NOSONAR javascript:S9382
  const leaving = await sampleLeaving(pg); // NOSONAR javascript:S9382
  check(`${mode}, at 1440: it is still mounted while it leaves`, leaving.stillMounted, true);
  check(`${mode}, at 1440: while it leaves the wrapper, the scrim and the panel take no pointer`, `${leaving.wrapper} ${leaving.scrim} ${leaving.panel}`, 'none none none');
  check(`${mode}, at 1440: while it leaves a press lands on the card behind it`, `${leaving.hitIsInsideWrapper} ${leaving.hitIsTheCard}`, 'false true');
  await pg.getByRole('dialog').waitFor({ state: 'detached', timeout: WAIT_MS }); // NOSONAR javascript:S9382
  check(`${mode}, at 1440: the dialog unmounts after its exit`, await pg.getByRole('dialog').count(), 0); // NOSONAR javascript:S9382
  await modalContext.close(); // NOSONAR javascript:S9382
}

for (const [mode, reducedMotion] of [['motion on', 'no-preference'], ['reduced motion', 'reduce']]) { // NOSONAR javascript:S9382 sequential on purpose: each pass is a page of its own that is closed before the next one opens, and the checks are logged in order
  const { pg, modalContext } = await modalPage(reducedMotion, { width: 390, height: 844 }); // NOSONAR javascript:S9382
  const frames = await sampleModalOpening(pg); // NOSONAR javascript:S9382
  await pg.getByRole('dialog').waitFor({ state: 'visible' }); // NOSONAR javascript:S9382
  const { scale, ty } = matrixOf(frames[0].transform);
  if (reducedMotion === 'no-preference') {
    check(`${mode}, at 390: the sheet starts below the bottom edge and does not scale`, `${ty > 0} ${scale}`, 'true 1');
  } else {
    check(`${mode}, at 390: the sheet comes to rest without travelling`, distinctMidTransforms(frames) <= 1, true);
  }
  await settled(pg, { within: '[role="dialog"]', label: 'the sheet to finish opening at 390' }); // NOSONAR javascript:S9382
  const atRest = await pg.getByRole('dialog').evaluate(el => { // NOSONAR javascript:S9382
    const box = el.getBoundingClientRect();
    return { bottom: Math.round(box.bottom), height: Math.round(innerHeight) };
  });
  check(`${mode}, at 390: the sheet comes to rest against the bottom edge`, atRest.bottom, atRest.height);
  const leaving = await sampleLeaving(pg); // NOSONAR javascript:S9382
  check(`${mode}, at 390: while the sheet leaves it takes no pointer`, `${leaving.stillMounted} ${leaving.wrapper} ${leaving.scrim} ${leaving.panel}`, 'true none none none');
  await pg.getByRole('dialog').waitFor({ state: 'detached', timeout: WAIT_MS }); // NOSONAR javascript:S9382
  await modalContext.close(); // NOSONAR javascript:S9382
}

log('\n--- the blown away exit: with motion on, at Still, and under reduced motion ---');

// A card deleted from its modal is blown away for 460 milliseconds before it
// leaves the board. It is interaction motion: it plays at every Breeze level,
// and only the system's own reduced motion preference collapses it. A picture
// of the card plays it, so what is asserted is that picture's computed style,
// frame by frame, and that the card below it does not move until it is gone.
// A frame can take 100 to 250 milliseconds on this page, so the checks read
// what the frames show and never how many there were.
const armExitRecorder = (pg, belowTitle) =>
  pg.evaluate(title => {
    window.__exit = new Promise(resolve => {
      const started = performance.now();
      const frames = [];
      let first = null;
      // The layout position of the card below, in its column's body: a card
      // under the pointer lifts a couple of pixels on hover, and that is a
      // transform and not a move of the layout this reads.
      const belowTop = () =>
        [...document.querySelectorAll('[data-task-card]')].find(card => card.querySelector('h3')?.textContent === title)
          ?.offsetTop;
      // Its own end, and how long it had run when it reported it. Heard on the
      // document from the start, because a frame on this page can take longer
      // than the animation and a listener added when the picture is first seen
      // would miss an end that came before it.
      let ended = null;
      document.addEventListener(
        'animationend',
        event => {
          if (event.target instanceof Element && event.target.hasAttribute('data-task-leaving')) {
            ended = { elapsed: event.elapsedTime, name: event.animationName };
          }
        },
        true
      );
      const step = () => {
        const now = performance.now();
        const picture = document.querySelector('[data-task-leaving]');
        if (picture && !first) {
          const style = getComputedStyle(picture);
          first = {
            at: now,
            name: style.animationName,
            duration: style.animationDuration,
            pointer: style.pointerEvents,
            ariaHidden: picture.getAttribute('aria-hidden'),
            inert: picture.hasAttribute('inert'),
            controls: picture.querySelectorAll('button, a, input').length,
            asCard: Boolean(picture.closest('[data-task-card]')) || picture.hasAttribute('data-task-card'),
            belowTop: belowTop(),
          };
        }
        if (picture) {
          const style = getComputedStyle(picture);
          frames.push({
            opacity: Number(style.opacity),
            transform: style.transform,
            toast: Boolean(document.querySelector('[data-testid="toast"]')),
            belowTop: belowTop(),
          });
        }
        if (first && !picture) {
          return resolve({ first, frames, ended, elapsed: now - first.at, belowTopAfter: belowTop() });
        }
        if (now - started > 15000) return resolve({ first, frames, ended, elapsed: null, belowTopAfter: null });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, belowTitle);

// The titles of the first column's cards, top to bottom.
const columnTitles = pg =>
  pg.evaluate(() =>
    [...document.querySelector('[data-column]').querySelectorAll('[data-task-card] h3')].map(h => h.textContent)
  );

let exitRun = 0;
for (const [mode, reducedMotion, breeze] of [
  ['motion on', 'no-preference', 'breezy'],
  ['at Still', 'no-preference', 'still'],
  ['reduced motion', 'reduce', 'breezy'],
]) { // NOSONAR javascript:S9382 sequential on purpose: the passes change the stored Breeze level of one account, and the cards are made in order on one board
  exitRun += 1;
  await page.request.put(`${API}/users/${boardMe._id}`, { ...homeAuth, data: { breeze } }); // NOSONAR javascript:S9382
  const top = `Away top ${exitRun}`;
  const below = `Away below ${exitRun}`;
  const topCreated = (await (await makeGateTask(top, 0)).json()).data; // NOSONAR javascript:S9382
  await makeGateTask(below, 0); // NOSONAR javascript:S9382

  const exitContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion }); // NOSONAR javascript:S9382
  const pg = await signIn(exitContext); // NOSONAR javascript:S9382
  await pg.goto(gateBoardUrl); // NOSONAR javascript:S9382
  await pg.getByRole('region', { name: 'Board columns' }).waitFor(); // NOSONAR javascript:S9382
  await pg.getByRole('button', { name: below, exact: true }).waitFor(); // NOSONAR javascript:S9382
  await settled(pg, { label: 'the board to stop animating before a card is blown away' }); // NOSONAR javascript:S9382

  const before = await columnTitles(pg); // NOSONAR javascript:S9382
  const topId = await pg.locator('[data-task-card]', { hasText: top }).evaluate(card => card.dataset.taskCard); // NOSONAR javascript:S9382
  check(`${mode}: the card to be blown away is the one the server made`, topId, topCreated._id);

  await pg.getByRole('button', { name: top, exact: true }).click(); // NOSONAR javascript:S9382
  const exitDialog = pg.getByRole('dialog', { name: 'Edit task' });
  await exitDialog.waitFor(); // NOSONAR javascript:S9382
  await settled(pg, { within: '[role="dialog"]', label: 'the task modal to finish opening before the card is blown away' }); // NOSONAR javascript:S9382
  await armExitRecorder(pg, below); // NOSONAR javascript:S9382
  await exitDialog.getByRole('button', { name: 'Blow it away' }).click(); // NOSONAR javascript:S9382
  const exit = await pg.evaluate(() => window.__exit); // NOSONAR javascript:S9382

  check(`${mode}: a picture of the card plays bbAway`, exit.first?.name, 'bbAway');
  check(`${mode}: the picture takes no pointer, is hidden from assistive technology, inert and has no control`, `${exit.first?.pointer} ${exit.first?.ariaHidden} ${exit.first?.inert} ${exit.first?.controls}`, 'none true true 0');
  check(`${mode}: the picture is not found as a card of the board`, exit.first?.asCard, false);
  // The picture is taken off the board by its own animationend and not by the
  // timer that stands in for it, which is what the elapsed time on the event
  // says: it had run the whole animation, or a hundredth of a millisecond of it.
  if (reducedMotion === 'reduce') {
    const seconds = Number.parseFloat(exit.first?.duration) * (String(exit.first?.duration).endsWith('ms') ? 0.001 : 1);
    check(`${mode}: the exit collapses to under a millisecond`, seconds < 0.001, true);
    check(`${mode}: and still reports its end`, `${exit.ended?.name} ${exit.ended?.elapsed < 0.001}`, 'bbAway true');
  } else {
    check(`${mode}: the exit is 460 milliseconds long`, exit.first?.duration, '0.46s');
    check(`${mode}: the picture lifts off and fades while it plays`, exit.frames.some(f => f.opacity < 1 && f.transform !== 'none'), true);
    check(`${mode}: it runs the whole animation before it reports its end`, `${exit.ended?.name} ${exit.ended?.elapsed >= 0.45 && exit.ended?.elapsed <= 0.47}`, 'bbAway true');
    check(`${mode}: the Catch it toast is on screen while the card is still leaving`, exit.frames.some(f => f.toast), true);
  }
  // The picture leaves when its animation ends, however long the page took to
  // start it, so the claim is that it is gone and not how soon.
  check(`${mode}: and the picture is gone once the exit has played`, exit.elapsed !== null, true);
  const stayed = exit.frames.every(f => f.belowTop === exit.first.belowTop);
  const closed = exit.belowTopAfter !== null && exit.belowTopAfter < exit.first.belowTop - 40;
  if (!stayed || !closed) {
    log(`  card below, layout top: first ${exit.first.belowTop}, frames ${JSON.stringify(exit.frames.map(f => f.belowTop))}, after ${exit.belowTopAfter}`);
  }
  check(`${mode}: the card below does not move while the picture plays`, stayed, true);
  check(`${mode}: it closes the gap once the picture is gone`, closed, true);
  check(`${mode}: the board does not hold the card any more`, await pg.locator('[data-task-card]', { hasText: top }).count(), 0); // NOSONAR javascript:S9382

  await pg.getByTestId('toast').getByRole('button', { name: 'Catch it' }).click(); // NOSONAR javascript:S9382
  await pg.getByRole('button', { name: top, exact: true }).waitFor(); // NOSONAR javascript:S9382
  const after = await columnTitles(pg); // NOSONAR javascript:S9382
  check(`${mode}: Catch it puts the card back in place`, after.join('|'), before.join('|'));
  check(`${mode}: and it is the same card, with the same id`, await pg.locator('[data-task-card]', { hasText: top }).evaluate(card => card.dataset.taskCard), topId); // NOSONAR javascript:S9382
  const stored = await page.request.get(`${API}/tasks/${topId}`, homeAuth); // NOSONAR javascript:S9382
  check(`${mode}: the server has the same task, with its own creation date`, `${stored.status()} ${(await stored.json()).data?.createdAt === topCreated.createdAt}`, '200 true'); // NOSONAR javascript:S9382
  await exitContext.close(); // NOSONAR javascript:S9382
}
await page.request.put(`${API}/users/${boardMe._id}`, { ...homeAuth, data: { breeze: 'breezy' } });

log('\n--- the profile ---');

// A block of its own: this section names a lot of locators and boxes, and the
// names it picks are the ones the sections above already hold.
{

const PROFILE_SIZE = { width: 1440, height: 900 };
const profileContext = await browser.newContext({ viewport: PROFILE_SIZE, reducedMotion: 'reduce' });
const profilePage = await signIn(profileContext);
await profilePage.goto(`${FRONT}/profile`);
await profilePage.getByRole('heading', { level: 1 }).waitFor();
await settled(profilePage, { label: 'the profile to stop animating' });

const profileStructure = await profilePage.evaluate(() => ({
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent),
  levels: [...document.querySelectorAll('main h1, main h2, main h3')].map(h => h.tagName).join(' '),
  panels: [...document.querySelectorAll('main section h2')].map(h => h.textContent),
  sections: [...document.querySelectorAll('main section[aria-labelledby]')].length,
}));
check('the profile has exactly one h1, the name', `${profileStructure.h1.length} ${profileStructure.h1[0]}`, '1 Token Gate');
check('the panels are h2 sections in order', profileStructure.panels.join('|'), 'About you|Your breeze|Password|Sign out');
check('the headings never skip a level', profileStructure.levels, 'H1 H2 H2 H2 H2');
check('each panel is a named section', profileStructure.sections, 4);

const profileHeader = profilePage.locator('main header').first();
const profileCover = profileHeader.locator(':scope > div[aria-hidden="true"]');
const coverBox = await profileCover.boundingBox();
const coverStyle = await styleOf(profileCover, ['borderTopLeftRadius', 'backgroundImage']);
check('the cover is 220 pixels tall with the hero radius', `${Math.round(coverBox.height)} ${coverStyle.borderTopLeftRadius}`, '220 28px');
check('the cover is the sky gradient until an image exists', coverStyle.backgroundImage.includes('oklch(0.5 0.13 232)'), true);

const profileAvatar = profileHeader.locator('div.rounded-full').first();
const avatarBox = await profileAvatar.boundingBox();
const avatarStyle = await styleOf(profileAvatar, ['boxShadow', 'fontSize', 'fontFamily']);
check('the avatar is a 116 pixel circle', `${Math.round(avatarBox.width)} ${Math.round(avatarBox.height)}`, '116 116');
check('the avatar overlaps the cover by 58 pixels', Math.round(coverBox.y + coverBox.height - avatarBox.y), 58);
check('the avatar has a 5 pixel ring in the ground colour', avatarStyle.boxShadow.includes('0px 0px 0px 5px') && avatarStyle.boxShadow.includes('rgb(243, 246, 249)'), true);
check('its initials are 40 pixels in the display face', `${avatarStyle.fontSize} ${leads(avatarStyle.fontFamily, 'Bricolage Grotesque')}`, '40px true');

const profileName = profileHeader.getByRole('heading', { level: 1 });
const nameBox = await profileName.boundingBox();
const nameStyle = await styleOf(profileName, ['fontSize', 'fontWeight', 'fontFamily', 'letterSpacing']);
check('the name is 34 pixels, bold, in the display face, tracked -0.03em', `${nameStyle.fontSize} ${nameStyle.fontWeight} ${leads(nameStyle.fontFamily, 'Bricolage Grotesque')} ${nameStyle.letterSpacing}`, '34px 700 true -1.02px');
check('the name sits wholly below the cover, never on the gradient', nameBox.y >= coverBox.y + coverBox.height, true);
const since = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
check('the line under the name says Member and General', await profileHeader.getByText('Member · General').count(), 1);
check('and says since when, as the month and the year', await profileHeader.getByText(`Breezing since ${since}`).count(), 1);

const cameraLabel = profileHeader.locator('label', { has: profilePage.getByLabel('Change avatar') });
const cameraBox = await cameraLabel.boundingBox();
check('the camera button is 44 pixels square', `${Math.round(cameraBox.width)} ${Math.round(cameraBox.height)}`, '44 44');
check('and sits on the avatar, at its lower right edge', cameraBox.x + cameraBox.width <= avatarBox.x + avatarBox.width + 1 && cameraBox.y + cameraBox.height <= avatarBox.y + avatarBox.height + 1, true);
await profilePage.getByLabel('Change avatar').focus();
const cameraRing = await cameraLabel.evaluate(el => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).boxShadow}`);
check('the camera button draws a focus ring while its input has focus', cameraRing.includes('solid') || cameraRing.includes('0px 0px 0px'), true);

const panels = profilePage.locator('main section[aria-labelledby]');
const aboutBox = await panels.nth(0).boundingBox();
const breezeBox = await panels.nth(1).boundingBox();
const panelStyle = await styleOf(panels.nth(0), ['borderTopLeftRadius', 'backgroundColor', 'backdropFilter', 'boxShadow']);
check('the panels have the panel radius', panelStyle.borderTopLeftRadius, '24px');
check('and are frosted: 82 percent white with a 14 pixel blur', `${panelStyle.backgroundColor} ${panelStyle.backdropFilter}`, 'rgba(255, 255, 255, 0.82) blur(14px)');
check('and cast the tile shadow', panelStyle.boxShadow.includes('0px 14px 34px -24px'), true);
check('at 1440 the About panel and the Your breeze column sit side by side, tops aligned', `${breezeBox.x > aboutBox.x + aboutBox.width - 1} ${Math.round(breezeBox.y) === Math.round(aboutBox.y)}`, 'true true');
check('the page is at most 1000 pixels wide', Math.round(await profilePage.locator('main > div').first().evaluate(el => el.getBoundingClientRect().width)) <= 1000, true);

// The Breeze panel: the same four choices as the sidebar, at 38 pixels.
const breezePanel = profilePage.getByRole('region', { name: 'Your breeze' });
const profileBreeze = breezePanel.getByRole('radiogroup', { name: /^Breeze level/ });
const segments = await profileBreeze.locator('label').evaluateAll(labels => labels.map(l => `${l.textContent}:${Math.round(l.getBoundingClientRect().height)}`));
check('the profile control offers Still, Calm, Breezy, Gusty at 38 pixels', segments.join(' '), 'Still:38 Calm:38 Breezy:38 Gusty:38');
check('Breezy is chosen for a new account', await profileBreeze.getByRole('radio', { name: 'Breezy' }).isChecked(), true);
check('there is no switch for card sway', await profilePage.getByRole('switch', { name: /sway/i }).count(), 0);

const switches = await breezePanel.getByRole('switch').evaluateAll(items =>
  items.map(item => ({
    name: document.getElementById(item.getAttribute('aria-labelledby'))?.textContent,
    note: document.getElementById(item.getAttribute('aria-describedby'))?.textContent,
    disabled: item.disabled,
    checked: item.getAttribute('aria-checked'),
    box: `${Math.round(item.getBoundingClientRect().width)}x${Math.round(item.getBoundingClientRect().height)}`,
  }))
);
check('the two coming preferences are switches, off and disabled', switches.map(item => `${item.name} ${item.disabled} ${item.checked}`).join('|'), 'Due-date nudges true false|Weekly digest true false');
check('and each says Coming soon in words', switches.every(item => item.note.startsWith('Coming soon')), true);
check('and each switch is 44 by 26', switches.map(item => item.box).join(' '), '44x26 44x26');

// The save and cancel buttons wait for a change.
check('nothing is offered to save before a change', `${await profilePage.getByRole('button', { name: 'Save changes' }).isDisabled()} ${await panels.nth(0).getByRole('button', { name: 'Cancel' }).isDisabled()}`, 'true true');

// Under a reduced motion preference the wind is held still and the control says
// so, keeping the choice it holds. This context asks for it.
check('reduced motion: the readout says so instead of a speed', await breezePanel.getByText('Reduced motion', { exact: true }).count(), 1);
check('reduced motion: the group is named for it', await breezePanel.getByRole('radiogroup', { name: 'Breeze level, held still because your system asks for reduced motion' }).count(), 1);
check('reduced motion: the stored choice stays selected', await breezePanel.getByRole('radio', { name: 'Breezy' }).isChecked(), true);

// Text on the frosted panels and the ground, against what is painted behind it.
for (const [label, locator, token] of [
  ['the name', profileName, '--color-ink'],
  ['the line under the name', profileHeader.getByText('Member · General'), '--color-ink-body'],
  ['the since line', profileHeader.getByText(`Breezing since ${since}`), '--color-ink-secondary'],
  ['a panel title', panels.nth(1).getByRole('heading', { level: 2 }), '--color-ink'],
  ['a panel description', profilePage.getByText('How much the interface moves, and what it tells you.'), '--color-ink-secondary'],
  ['the speed readout', breezePanel.getByText('Reduced motion', { exact: true }), '--color-ink-tertiary'],
  ['the reduced motion sentence', breezePanel.getByText(/^Your system asks for reduced motion/), '--color-ink-secondary'],
  ['a coming soon note', breezePanel.getByText(/^Coming soon: a reminder/), '--color-ink-secondary'],
  ['a field label', panels.nth(0).getByText('First name', { exact: true }), '--color-ink-secondary'],
  ['the password rule hint', profilePage.getByText(/^At least 8 characters, with a lowercase/), '--color-ink-tertiary'],
]) { // NOSONAR javascript:S9382 sequential on purpose: each photograph borrows the page's text colour and puts it back, so the elements cannot be photographed at once
  const behind = await extremeBehind(profilePage, locator, 'darkest'); // NOSONAR javascript:S9382
  await reportPairs(profilePage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, 4.5]]); // NOSONAR javascript:S9382
}
await profileContext.close();

// With motion allowed the readout is a speed, and the sway follows the level
// and nothing else. At Gusty every card sways; choosing any lower level on the
// profile stops them, with no second switch to disagree with it.
const swayContext = await browser.newContext({ viewport: PROFILE_SIZE, reducedMotion: 'no-preference' });
const swayPage = await signIn(swayContext);
// What the board's cards are doing: "all" when every one of them sways (and
// there is at least one), "none" when no card does.
const swayingCards = () =>
  swayPage.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-task-card]')];
    const swaying = cards.filter(c => getComputedStyle(c).animationName.startsWith('bbSway')).length;
    if (cards.length > 0 && swaying === cards.length) return 'all';
    return swaying === 0 ? 'none' : `${swaying} of ${cards.length}`;
  });
const chooseOnProfile = async name => {
  await swayPage.goto(`${FRONT}/profile`);
  await swayPage.getByRole('heading', { level: 1 }).waitFor();
  const saved = swayPage.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/users/'), { timeout: WAIT_MS });
  await swayPage.getByRole('region', { name: 'Your breeze' }).locator('label', { hasText: new RegExp(`^${name}$`) }).click();
  await saved;
  await swayPage.goto(gateBoardUrl);
  await swayPage.getByText('Gate high task', { exact: true }).waitFor();
  await settled(swayPage, { label: `the board at ${name} to stop animating` });
};
await swayPage.goto(`${FRONT}/profile`);
await swayPage.getByRole('heading', { level: 1 }).waitFor();
check('with motion allowed the readout is a speed', await swayPage.getByRole('region', { name: 'Your breeze' }).getByText('38 km/h').count(), 1);
await chooseOnProfile('Gusty');
check('choosing Gusty on the profile makes every card sway', await swayingCards(), 'all');
for (const level of ['Breezy', 'Calm', 'Still']) { // NOSONAR javascript:S9382 sequential on purpose: each choice is a write to one stored value that the next page load reads back
  await chooseOnProfile(level); // NOSONAR javascript:S9382
  check(`choosing ${level} on the profile stops the sway`, await swayingCards(), 'none'); // NOSONAR javascript:S9382
}
await swayContext.close();
await page.request.put(`${API}/users/${boardMe._id}`, { ...homeAuth, data: { breeze: 'breezy' } });

// A phone: the two columns stack, the cover keeps its height and the name
// stays below it.
const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const phonePage = await signIn(phoneContext);
await phonePage.goto(`${FRONT}/profile`);
await phonePage.getByRole('heading', { level: 1 }).waitFor();
await settled(phonePage, { label: 'the profile to stop animating at 390 pixels' });
const phonePanels = phonePage.locator('main section[aria-labelledby]');
const phoneAbout = await phonePanels.nth(0).boundingBox();
const phoneBreeze = await phonePanels.nth(1).boundingBox();
const phoneCover = await phonePage.locator('main header > div[aria-hidden="true"]').boundingBox();
const phoneName = await phonePage.locator('main header h1').boundingBox();
check('at 390 the panels stack in one column', `${Math.round(phoneBreeze.x) === Math.round(phoneAbout.x)} ${phoneBreeze.y > phoneAbout.y + phoneAbout.height}`, 'true true');
check('at 390 the cover is still 220 pixels tall', Math.round(phoneCover.height), 220);
check('at 390 the name is below the cover', phoneName.y >= phoneCover.y + phoneCover.height, true);
check('at 390 the document does not scroll sideways', await phonePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
await phoneContext.close();
}

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
