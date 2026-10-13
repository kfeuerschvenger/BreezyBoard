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
await page.waitForTimeout(400);
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
await page.waitForTimeout(500);
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
await page.waitForTimeout(450);
check('the close glyph turns a quarter on hover', (await styleOf(closeButton.locator('svg'), ['rotate'])).rotate, '90deg');
await page.mouse.move(2, 2);

await page.keyboard.press('Escape');
await probeDialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});

log('\n--- the new primitives, rendered for real ---');

// No page uses the new primitives yet, and a utility class that is not in the
// stylesheet is a silent no-op, so jsdom cannot vouch for them. The page the
// dev server already serves is borrowed instead: the React and ReactDOM it
// loaded are found in the transformed entry module and imported by URL, so the
// primitives are rendered with the same instances, the same stylesheet and the
// same fonts as the application, with nothing added to the repository.
const mountPrimitives = async (target, build, args = {}) =>
  target.evaluate(async ([source, args]) => {
    const entry = await (await fetch('/src/main.tsx')).text();
    const urlOf = name => entry.match(new RegExp(`/node_modules/[.]vite/deps/${name}[.]js[?]v=[a-f0-9]+`))?.[0];
    const react = await import(urlOf('react'));
    const dom = await import(urlOf('react-dom_client'));
    const ui = await import('/src/shared/ui/index.ts');
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
      new Function('ui', 'h', 'React', 'args', `return (${source})(ui, h, React, args)`)(ui, createElement, react.default ?? react, args)
    );
    await new Promise(resolve => setTimeout(resolve, 150));
  }, [build.toString(), args]);

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
for (const hue of ['sky', 'teal', 'green', 'sand', 'coral', 'lavender']) {
  const painted = await probeText(page, `Chip ${hue}`, ['color', 'backgroundColor', 'borderTopLeftRadius', 'fontSize']);
  check(`the ${hue} chip text is its deep step`, await paintOf(page, painted.color), await paintOf(page, await tokenValue(page, `--color-${hue}-deep`)));
  check(`the ${hue} chip fill is its tint`, await paintOf(page, painted.backgroundColor), await paintOf(page, await tokenValue(page, `--color-${hue}-tint`)));
  await reportPairs(page, [[`the ${hue} chip text on its fill`, painted.color, painted.backgroundColor, 4.5]]);
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
await page.waitForTimeout(500);
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
for (const hue of ['sky', 'teal', 'green', 'sand', 'coral', 'lavender']) {
  await reportPairs(page, [
    [`the ${hue} progress fill on its track over white`, `--color-${hue}-edge`, 'rgb(15 27 45 / 0.07)', 3],
    [`the ${hue} progress fill on its track over the ground`, `--color-${hue}-edge`, 'rgb(243 246 249)', 3],
  ]);
}
await unmountPrimitives(page);

// Cover
// The caller sizes a cover. The probe sizes a wrapper and lets the cover fill
// it, since a utility class that only this script names is not in the sheet.
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
await page.waitForTimeout(300);
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
for (const hue of HUE_NAMES) {
  const avatar = page.locator(`#probe-host [aria-label="Av ${hue}"]`);
  const painted = await styleOf(avatar, ['backgroundColor', 'color']);
  const initials = await styleOf(avatar.locator('span'), ['fontSize', 'fontWeight']);
  check(
    `the ${hue} avatar is filled with the mid step`,
    await paintOf(page, painted.backgroundColor),
    await paintOf(page, await tokenValue(page, `--color-${hue}-mid`))
  );
  check(`the ${hue} avatar initials are ink`, await paintOf(page, painted.color), await paintOf(page, await tokenValue(page, '--color-ink')));
  check(`the ${hue} avatar initials are 10 pixels and bold`, `${initials.fontSize} ${initials.fontWeight}`, '10px 700');
  await reportPairs(page, [[`avatar initials on the ${hue} mid fill`, painted.color, painted.backgroundColor, 4.5]]);
}
const avatarSizes = [];
for (const name of ['Av sky', 'Ada Lovelace']) {
  for (const box of await page.locator(`#probe-host [aria-label="${name}"]`).evaluateAll(els => els.map(el => `${el.offsetWidth}`))) {
    avatarSizes.push(box);
  }
}
check('the avatar sizes are 24, 32, 48 and 96', avatarSizes.join(' '), '24 32 48 96');
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
await page.waitForTimeout(350);
check('a hovered swatch grows by 15 percent', (await styleOf(swatch('coral'), ['scale'])).scale, '1.15');
await page.mouse.move(2, 2);
await page.locator('#probe-host input[value="sky"]').focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
const swatchRing = await styleOf(swatch('sky'), ['outlineStyle', 'outlineWidth', 'outlineOffset']);
check('the swatch whose radio has the keyboard draws the focus ring', `${swatchRing.outlineStyle} ${swatchRing.outlineWidth} ${swatchRing.outlineOffset}`, 'solid 2px 2px');
await page.keyboard.press('ArrowRight');
check('the right arrow chooses the next swatch', await page.locator('#probe-host input:checked').evaluate(radio => radio.value), 'coral');
for (const hue of HUE_NAMES) {
  await reportPairs(page, [
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
await page.waitForTimeout(700);
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
await page.waitForTimeout(500);
const driftAfter = await windLayer.locator(':scope > span').nth(1).evaluate(el => getComputedStyle(el).transform);
check('a particle has moved half a second later', driftBefore !== driftAfter, true);
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
await page.waitForTimeout(600);

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
]) {
  const behind = await worstBackdrop(locator);
  await reportPairs(page, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, 4.5]]);
}

log('\n--- the Breeze control and the wind over the shell ---');

const sessionToken = await page.evaluate(() => localStorage.getItem('token'));
const storedBreeze = async () =>
  (await (await page.request.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${sessionToken}` } })).json()).data.breeze;
const windOfShell = () =>
  page.evaluate(() => {
    const layer = document.getElementById('app-sidebar').previousElementSibling;
    if (!layer || layer.getAttribute('aria-hidden') !== 'true') return null;
    const probe = document.elementFromPoint(
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
      linkOnTop: Boolean(probe?.closest('#app-sidebar')),
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
const chooseBreeze = name => sidebar.locator('label', { hasText: new RegExp(`^${name}$`) }).click();
const breezeBox = sidebar.getByRole('radiogroup', { name: 'Breeze' });
const boxGeometry = await breezeBox.evaluate(group => {
  const frame = group.getBoundingClientRect();
  const panel = group.closest('aside').getBoundingClientRect();
  return {
    labels: [...group.querySelectorAll('label')].map(label => {
      const box = label.getBoundingClientRect();
      return { text: label.textContent, left: box.left, right: box.right, height: Math.round(box.height) };
    }),
    insideFrame: [...group.querySelectorAll('label')].every(label => {
      const box = label.getBoundingClientRect();
      return box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5;
    }),
    insidePanel: frame.left >= panel.left && frame.right <= panel.right,
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
await page.waitForTimeout(400);
const gustyWind = await windOfShell();
check('gusty is 11 streaks and 20 particles', `${gustyWind?.streaks} ${gustyWind?.particles}`, '11 20');
check('the box says 74 km/h for gusty', await sidebar.getByText('74 km/h').isVisible(), true);
check('the choice is stored on the user', await storedBreeze(), 'gusty');
check('a gusty logo glyph sways', await sidebar.getByRole('link', { name: 'breezyboard' }).locator('svg').evaluate(svg => getComputedStyle(svg).animationName), 'bbSway');

// The stored value is what a new load reads: nothing is kept in the browser.
await page.reload();
await page.getByText('Your boards').waitFor();
check('the choice is still gusty after a reload', (await windOfShell())?.streaks, 11);
check('the control shows the stored choice after a reload', await page.getByRole('radio', { name: 'Gusty' }).isChecked(), true);

await chooseBreeze('Still');
await page.waitForTimeout(400);
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
await quietPage.waitForTimeout(600);
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
await page.waitForTimeout(400);

// The account menu: it rises in, and while it leaves it is already out of
// reach.
const menuOpening = await page.evaluate(
  () =>
    new Promise(resolve => {
      document.querySelector('button[aria-label^="Account menu for"]').click();
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const style = getComputedStyle(document.querySelector('[role="menu"]'));
            resolve({ opacity: Number(style.opacity), transform: style.transform });
          })
        )
      );
    })
);
check('a menu fades in', menuOpening.opacity < 1, true);
check('a menu rises and scales in', isIdentity(menuOpening.transform), false);
await page.waitForTimeout(500);
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

const menuLeaving = await page.evaluate(
  () =>
    new Promise(resolve => {
      const menu = document.querySelector('[role="menu"]');
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      requestAnimationFrame(() => {
        const still = document.querySelector('[role="menu"]');
        resolve(still ? { hidden: still.getAttribute('aria-hidden'), inert: still.hasAttribute('inert') } : null);
      });
    })
);
// The popup may already be gone, which is fine. If it is not, it must not be
// reachable while it fades.
check(
  'a leaving menu is hidden and inert, or already gone',
  menuLeaving === null || (menuLeaving.hidden === 'true' && menuLeaving.inert),
  true
);
await page.waitForTimeout(500);
check('the menu is gone from the page after its exit', await page.getByRole('menu').count(), 0);

// The confirm dialog and the toast.
await page.getByRole('button', { name: `Options for ${gateBoard}` }).click();
// The board card's menu is its own component of plain buttons, not the Menu primitive.
await page.getByRole('button', { name: 'Delete', exact: true }).click();
const confirmDialog = page.getByRole('dialog', { name: 'Delete this board?' });
await confirmDialog.waitFor({ state: 'visible' });
await page.waitForTimeout(500);
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
await page.waitForTimeout(700);
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
for (let press = 0; press < 6 && !reached; press += 1) {
  await page.keyboard.press('Tab');
  reached = await undo.evaluate(el => el === document.activeElement);
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
    headlineSize: parseFloat(getComputedStyle(el.querySelector('p')).fontSize),
    headlineFamily: getComputedStyle(el.querySelector('p')).fontFamily.split(',')[0].replace(/["']/g, ''),
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
    level: el.getAttribute('data-breeze'),
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
for (const [label, selector, rgb, minimum] of textTargets) {
  const clip = await authPage.locator(selector).first().boundingBox();
  const png = (await authPage.screenshot({ clip })).toString('base64');
  const worst = await authPage.evaluate(
    async ([data, color]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const channel = c => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      const probe = new OffscreenCanvas(1, 1).getContext('2d');
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      const text = lum(...probe.getImageData(0, 0, 1, 1).data);
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

// A refused submit shakes the form: the animation is running on it.
await phonePage.getByRole('button', { name: /^Sign in/ }).click();
await phonePage.getByText('Email is required').waitFor();
check('a refused submit plays the shake on the form', await phonePage.locator('form').evaluate(form => getComputedStyle(form).animationName), 'bbShake');
await phonePage.locator('form').evaluate(form => Promise.all(form.getAnimations().map(a => a.finished)));
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
check('the board palette is the six hues, by key', homePalette.map(entry => entry.value).sort().join(' '), Object.keys(HUE_ANGLES).sort().join(' '));
for (const [hue] of Object.entries(HUE_ANGLES)) {
  const created = await page.request.post(`${API}/boards`, {
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
const heroStops = (await tokenValue(homePage, '--gradient-hero')).match(/linear-gradient\([^]*$/)[0].match(/oklch\([^)]*\)/g);
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
for (const width of [1440, 1024, 768, 390, 320]) {
  await homePage.setViewportSize({ width, height: 900 });
  await homePage.waitForTimeout(250);
  for (const [label, selector, minimum] of heroTargets) {
    for (const [index, handle] of (await homePage.locator(selector).all()).entries()) {
      const behind = await extremeBehind(homePage, handle, 'lightest');
      await reportPairs(homePage, [[`${label}${index > 0 ? ` ${index + 1}` : ''} at ${width} on the lightest pixel behind it (${behind})`, '#ffffff', `rgb(${behind})`, minimum]]);
    }
  }
}
await homePage.setViewportSize({ width: 1440, height: 900 });
await homePage.waitForTimeout(250);

const heroLink = homePage.locator('main header').getByRole('link', { name: /^Open / });
check('the hero button opens the board worked on last', await heroLink.getAttribute('href'), await homePage.locator('main').getByRole('link', { name: 'Home lavender', exact: true }).getAttribute('href'));
await reportPairs(homePage, [
  ['the hero button text on its white fill', '--color-ink', '--color-surface', 4.5],
]);

// The tiles. Each cover is the gradient of its hue, built from the same angle
// the token layer declares, and the dot beside the board in the sidebar is the
// mid step of the same hue.
const tileFor = hue => homePage.locator('main [data-hue]', { has: homePage.getByRole('heading', { name: `Home ${hue}` }) });
for (const [hue, angle] of Object.entries(HUE_ANGLES)) {
  const tile = tileFor(hue);
  check(`the ${hue} tile carries its hue`, await tile.getAttribute('data-hue'), hue);
  const cover = await tile.locator(':scope > div').first().locator(':scope > div').first().evaluate(el => {
    const style = getComputedStyle(el);
    return { image: style.backgroundImage, height: el.offsetHeight, radius: style.borderTopLeftRadius };
  });
  check(
    `the ${hue} cover is its three stop gradient from angle ${angle}`,
    ['120deg', `oklch(0.5 0.13 ${angle})`, `oklch(0.66 0.12 ${(angle + 30) % 360})`, `oklch(0.83 0.09 ${(angle + 60) % 360})`].every(part => cover.image.includes(part)),
    true
  );
  check(`the ${hue} cover is 96 pixels tall with rounded top corners`, `${cover.height} ${cover.radius}`, '96 22px');
  const dot = await homePage.locator(`#app-sidebar a[href="${await tile.getByRole('link').first().getAttribute('href')}"] span[data-hue]`).evaluate(el => ({ hue: el.dataset.hue, color: getComputedStyle(el).backgroundColor }));
  check(`the ${hue} sidebar dot is the mid step of the same hue`, `${dot.hue} ${await paintOf(homePage, dot.color)}`, `${hue} ${await paintOf(homePage, await tokenValue(homePage, `--color-${hue}-mid`))}`);
  const fill = await tile.getByTestId('progress-fill').evaluate(el => getComputedStyle(el).backgroundColor);
  check(`the ${hue} progress fill is the edge step`, await paintOf(homePage, fill), await paintOf(homePage, await tokenValue(homePage, `--color-${hue}-edge`)));
}

const sampleTile = tileFor('sky');
const tileStyle = await styleOf(sampleTile, ['borderTopLeftRadius', 'backdropFilter', 'backgroundColor', 'boxShadow', 'position']);
check('a tile has the tile radius, blurs by 14 and is glass', `${tileStyle.borderTopLeftRadius} ${tileStyle.backdropFilter.includes('blur(14px)')} ${tileStyle.backgroundColor}`, '22px true rgba(255, 255, 255, 0.82)');
check('a tile casts the tile shadow', tileStyle.boxShadow.includes('0px 14px 34px -24px'), true);
const tileTitle = await styleOf(sampleTile.getByRole('heading'), ['fontFamily', 'fontSize', 'fontWeight']);
check('a tile title is 17 pixels at 650 in the display face', `${leads(tileTitle.fontFamily, 'Bricolage Grotesque')} ${tileTitle.fontSize} ${tileTitle.fontWeight}`, 'true 17px 650');

// Hover lifts the tile and turns it, and the shadow deepens.
await sampleTile.hover();
await homePage.waitForTimeout(400);
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
  const tile = document.activeElement.closest('[data-hue]');
  const style = getComputedStyle(tile);
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
]) {
  const behind = await extremeBehind(homePage, locator, 'darkest');
  await reportPairs(homePage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, minimum]]);
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
]) {
  const behind = await extremeBehind(homePage, locator, 'darkest');
  await reportPairs(homePage, [[`${label} on the darkest pixel behind it (${behind})`, token, `rgb(${behind})`, 4.5]]);
}
await newTile.hover();
await homePage.waitForTimeout(400);
const newHovered = await styleOf(newTile, ['translate', 'borderTopColor']);
check('a hovered new board tile rises 3 pixels', newHovered.translate, '0px -3px');
check('a hovered new board tile takes the accent outline', await paintOf(homePage, newHovered.borderTopColor), await paintOf(homePage, await tokenValue(homePage, '--color-accent')));
await homePage.mouse.move(5, 5);
await newTile.click();
await homePage.getByRole('dialog', { name: 'Create New Board' }).waitFor();
check('the new board tile opens the create board dialog', await homePage.getByRole('dialog', { name: 'Create New Board' }).isVisible(), true);

// The dialog offers the six hues, in the hues' own order, as one named group.
const swatches = homePage.getByRole('group', { name: 'Board Color' }).getByRole('radio');
await swatches.first().waitFor();
check('the create dialog offers exactly the six hues', await swatches.count(), 6);
check('the hues are offered in their own order', (await swatches.evaluateAll(radios => radios.map(r => r.labels[0].textContent.trim()))).join(' '), 'Sky Teal Green Sand Coral Lavender');
check('the first hue is the one chosen for a new board', await swatches.first().isChecked(), true);
const swatchFills = await swatches.evaluateAll(radios => radios.map(r => getComputedStyle(r.labels[0].querySelector('span')).backgroundColor));
const midFills = [];
for (const hue of Object.keys(HUE_ANGLES)) midFills.push(await paintOf(homePage, await tokenValue(homePage, `--color-${hue}-mid`)));
const paintedSwatches = [];
for (const fill of swatchFills) paintedSwatches.push(await paintOf(homePage, fill));
check('each swatch is filled with the mid step of its hue', paintedSwatches.join(' '), midFills.join(' '));
await homePage.keyboard.press('Escape');

// How many tiles share a row at each width, from the rendered boxes.
const tileColumns = () =>
  homePage.evaluate(() => new Set([...document.querySelectorAll('main [data-hue]')].map(tile => Math.round(tile.getBoundingClientRect().left))).size);
for (const [width, expected] of [[320, 1], [390, 1], [768, 2], [1024, 3], [1440, 4]]) {
  await homePage.setViewportSize({ width, height: 900 });
  await homePage.waitForTimeout(250);
  check(`at ${width} the tiles share ${expected} column${expected > 1 ? 's' : ''}`, await tileColumns(), expected);
  check(`at ${width} the page does not scroll sideways`, await homePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}
await homeContext.close();

log('\n--- the reduced motion policy ---');

// A person who asks the system for less motion gets animations and
// transitions collapsed to an instant. The collapse must not break what
// waits on an animation to finish: a dialog unmounts only after its exit
// completes, so a dialog that opens and then never leaves the page under
// this setting would be the failure to catch.
// Three animation frames after the click: late enough for the panel to exist
// and for a reduced motion preference to have dropped its transform (the
// first frame still carries the initial one), early enough that a 350
// millisecond entrance has barely started.
const sampleOpening = pg =>
  pg.evaluate(
    () =>
      new Promise(resolve => {
        const trigger = [...document.querySelectorAll('button')].find(b => /forgot it/i.test(b.textContent));
        trigger.click();
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const style = getComputedStyle(document.querySelector('[role="dialog"]'));
              resolve({ opacity: Number(style.opacity), transform: style.transform });
            })
          )
        );
      })
  );

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
    const probe = document.createElement('div');
    probe.style.animation = `var(--animate-${name})`;
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const duration = Number.parseFloat(style.animationDuration) * (style.animationDuration.endsWith('ms') ? 1 : 1000);
    const out = [name, style.animationName, duration, style.animationIterationCount];
    probe.remove();
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
check('under reduced motion the panel does not travel or scale', isIdentity(calmOpening.transform), true);
check('under reduced motion the panel still fades in', calmOpening.opacity < 1, true);
await calmPage.keyboard.press('Escape');
await dialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
check('the dialog unmounts after its exit under reduced motion', await dialog.count(), 0);

await calm.close();

const normal = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const normalPage = await normal.newPage();
await normalPage.goto(`${FRONT}/login`);
await normalPage.waitForSelector('form');
const normalOpening = await sampleOpening(normalPage);
const normalDialog = normalPage.getByRole('dialog');
await normalDialog.waitFor({ state: 'visible' });
check('with motion on the panel rises and scales in', isIdentity(normalOpening.transform), false);
check('with motion on the panel fades in', normalOpening.opacity < 1, true);
await normalPage.keyboard.press('Escape');
await normalDialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
check('the dialog unmounts after its exit with motion on', await normalDialog.count(), 0);
await normal.close();

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
