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
      ctx.fillStyle = resolve(bg);
      ctx.fillRect(0, 0, 1, 1);
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

await page.getByRole('button', { name: /forgot password/i }).click();
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
await page.keyboard.press('Escape');
await probeDialog.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});

log('\n--- the new primitives, rendered for real ---');

// No page uses the new primitives yet, and a utility class that is not in the
// stylesheet is a silent no-op, so jsdom cannot vouch for them. The page the
// dev server already serves is borrowed instead: the React and ReactDOM it
// loaded are found in the transformed entry module and imported by URL, so the
// primitives are rendered with the same instances, the same stylesheet and the
// same fonts as the application, with nothing added to the repository.
const mountPrimitives = async (target, build) =>
  target.evaluate(async source => {
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
    root.render(new Function('ui', 'h', 'React', `return (${source})(ui, h, React)`)(ui, createElement, react.default ?? react));
    await new Promise(resolve => setTimeout(resolve, 150));
  }, build.toString());

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
