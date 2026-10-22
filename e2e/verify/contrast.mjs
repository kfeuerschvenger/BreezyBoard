// Contrast of every text colour on a page, measured on the pixels painted
// behind it.
//
// A hand picked list of colour pairs proves the pairs somebody thought of. It
// cannot prove a pair nobody listed: a chip on a tint, a label on frosted glass
// over a gradient, a placeholder, a count in the corner of a card. Axe cannot
// settle those either, because it reads a background colour from the cascade and
// answers "incomplete" for a translucent surface over a blurred gradient, which
// is most of this interface.
//
// So the page is photographed instead. Every glyph is made transparent, one
// screenshot is taken of what is left, and each piece of text is compared with
// the pixels that were behind its box. A text colour that is translucent, or
// inside an element that is, is composited over those pixels first, which is
// how it reaches the eye. The worst case is taken, the lightest and the
// darkest pixel of the box, so a gradient under a line of text is judged at its
// least favourable end.
//
// What is measured: text, the value typed in a field, a placeholder, and the
// glyph of a control that has no words of its own (WCAG 1.4.11 asks 3:1 for it).
// What is not: a disabled control, which 1.4.3 exempts, text under an inert
// layer or behind an open dialog, text clipped away by a scrolling ancestor, and
// text painted with a gradient fill, which has no single colour to compare.

/** The minimums of WCAG 2.2: 1.4.3 for text, with its large text relief, and 1.4.11 for a glyph. */
export const MINIMUM = { text: 4.5, large: 3, glyph: 3 };

const HIDE_GLYPHS = `
  *, *::before, *::after { -webkit-text-fill-color: transparent !important; -webkit-text-stroke: 0 !important; text-shadow: none !important; caret-color: transparent !important; }
  ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; opacity: 1 !important; }
  svg, svg * { stroke: transparent !important; }
  [data-testid="wind-layer"] { visibility: hidden !important; }
`;

/**
 * Everything on the page that has a colour to measure, read from the live DOM.
 * It runs inside the page and returns plain data.
 */
const collectBoxes = () => {
  const OVERLAYS = '[role="dialog"], [role="menu"], [data-testid="toast"], [role="alert"]';
  const visibleDialogs = [...document.querySelectorAll('[role="dialog"]')].filter(
    dialog => dialog.getClientRects().length > 0 && getComputedStyle(dialog).visibility !== 'hidden',
  );
  const scope = visibleDialogs.at(-1) ?? null;

  const disabledOwners = new Set();
  for (const control of document.querySelectorAll(':disabled, [aria-disabled="true"]')) {
    for (const id of (control.getAttribute('aria-labelledby') ?? '').split(/\s+/)) {
      if (id) disabledOwners.add(id);
    }
  }

  const opacityOf = element => {
    let product = 1;
    for (let node = element; node; node = node.parentElement) {
      product *= Number.parseFloat(getComputedStyle(node).opacity);
    }
    return product;
  };

  const clipped = (element, rect) => {
    let { left, top, right, bottom } = rect;
    // The element's own overflow clips its text as much as an ancestor's does:
    // `truncate` cuts a line at the element's edge and leaves the rest of the
    // text's box lying over whatever is beside it.
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const box = node.getBoundingClientRect();
      left = Math.max(left, box.left);
      top = Math.max(top, box.top);
      right = Math.min(right, box.right);
      bottom = Math.min(bottom, box.bottom);
    }
    left = Math.max(left, 0);
    top = Math.max(top, 0);
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);
    return right - left >= 2 && bottom - top >= 2 ? { left, top, right, bottom } : null;
  };

  // Text that is turned has an axis aligned box that takes in pixels it is not
  // on, so its box says nothing about what is behind its glyphs. It is judged
  // by the pairs design-tokens.mjs lists for the turned compositions.
  const isTurned = element => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      // A tilt under about a degree, such as a lifted tile's, moves the corners
      // of a line's box by a pixel or two over a flat surface and is measured.
      if (style.rotate !== 'none' && Math.abs(Number.parseFloat(style.rotate)) > 1) return true;
      const matrix = /^matrix\(([^)]*)\)$/.exec(style.transform);
      if (matrix && Math.abs(Number.parseFloat(matrix[1].split(',')[1])) > 0.02) return true;
    }
    return false;
  };

  // The visually hidden idiom: a box a pixel square that clips its own text.
  // The text is for assistive technology and has no colour on screen.
  const isScreenReaderOnly = element => {
    for (let node = element; node; node = node.parentElement) {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (box.width <= 1 && box.height <= 1 && style.overflow !== 'visible') return true;
    }
    return false;
  };

  const skipReason = (element, rect) => {
    if (getComputedStyle(element).visibility === 'hidden') return 'hidden';
    // A control that appears under a pointer, or a focus, is measured in the
    // state it appears in: the scans that need it hover or focus it first.
    if (opacityOf(element) < 0.02) return 'transparent';
    if (isScreenReaderOnly(element)) return 'screen reader only';
    if (isTurned(element)) return 'turned';
    if (element.closest('[inert]')) return 'inert';
    if (element.closest(':disabled, [aria-disabled="true"]')) return 'disabled';
    for (let node = element; node; node = node.parentElement) {
      if (node.id && disabledOwners.has(node.id)) return 'disabled';
    }
    if (scope && !scope.contains(element)) {
      const overlay = element.closest(OVERLAYS);
      if (!overlay) return 'behind a dialog';
    }
    const centre = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
    const top = document.elementFromPoint(centre[0], centre[1]);
    if (!top) return 'off screen';
    if (!element.contains(top) && !top.contains(element)) {
      // A link stretched over its card with an absolutely positioned
      // pseudo element catches the point without covering anything: the text
      // under it is still what the eye sees.
      const stretched = getComputedStyle(top, '::after').position === 'absolute';
      if (!stretched) return 'covered';
    }
    return null;
  };

  const boxes = [];
  const skipped = {};
  const skip = reason => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };
  const describe = element => {
    const name = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const cls = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    return `${name}${role ? `[${role}]` : ''}${cls ? `.${cls}` : ''}`;
  };
  const isLarge = style => {
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    return size >= 24 || (size >= 18.66 && weight >= 700);
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const element = node.parentElement;
    if (!element || !node.nodeValue.trim()) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'OPTION'].includes(element.tagName)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // One box per line: the union of a wrapped paragraph takes in the pixels
    // beside and between its lines, which are not behind any glyph.
    for (const line of range.getClientRects()) {
      if (line.width < 2 || line.height < 2) continue;
      const rect = clipped(element, line);
      if (!rect) continue;
      const reason = skipReason(element, rect);
      if (reason) {
        skip(reason);
        continue;
      }
      const style = getComputedStyle(element);
      if (/^(rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent)$/.test(style.webkitTextFillColor)) {
        skip('gradient fill');
        continue;
      }
      boxes.push({
        kind: isLarge(style) ? 'large' : 'text',
        label: node.nodeValue.trim().slice(0, 36),
        where: describe(element),
        color: style.webkitTextFillColor,
        opacity: opacityOf(element),
        rect,
      });
    }
  }

  for (const field of document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), textarea')) {
    const style = getComputedStyle(field);
    // The text is drawn inside the border and the padding. The border and the
    // focus ring are the field's own boundary, measured as a pair elsewhere,
    // and are not what the text sits on.
    const px = name => Number.parseFloat(style[name]);
    const box = field.getBoundingClientRect();
    // One more pixel in, because the photograph is read in whole pixels and the
    // border's anti aliased edge would otherwise be taken for the background.
    const raw = {
      left: box.left + px('borderLeftWidth') + px('paddingLeft') + 1,
      top: box.top + px('borderTopWidth') + px('paddingTop') + 1,
      right: box.right - px('borderRightWidth') - px('paddingRight') - 1,
      bottom: box.bottom - px('borderBottomWidth') - px('paddingBottom') - 1,
    };
    const rect = clipped(field, raw);
    if (!rect) continue;
    const reason = skipReason(field, rect);
    if (reason) {
      skip(reason);
      continue;
    }
    if (field.value) {
      boxes.push({ kind: 'text', label: `value of ${field.getAttribute('aria-label') ?? field.name ?? field.type}`, where: describe(field), color: style.color, opacity: opacityOf(field), rect });
    } else if (field.placeholder) {
      boxes.push({ kind: 'text', label: `placeholder "${field.placeholder.slice(0, 24)}"`, where: describe(field), color: getComputedStyle(field, '::placeholder').color, opacity: opacityOf(field), rect });
    }
  }

  // A glyph with no words beside it is the whole of what a control says. A
  // glyph next to text is decoration and is judged by the text.
  for (const glyph of document.querySelectorAll('svg')) {
    const control = glyph.closest('button, a, [role="menuitem"], [role="radio"], [role="switch"], [role="tab"]');
    if (!control || control.textContent.trim()) continue;
    const raw = glyph.getBoundingClientRect();
    if (raw.width < 2) continue;
    const rect = clipped(glyph, raw);
    if (!rect) continue;
    const reason = skipReason(glyph, rect);
    if (reason) {
      skip(reason);
      continue;
    }
    const style = getComputedStyle(glyph);
    if (style.stroke === 'none' && style.fill === 'none') continue;
    boxes.push({ kind: 'glyph', label: `glyph in ${control.getAttribute('aria-label') ?? 'a control'}`, where: describe(control), color: style.stroke === 'none' ? style.fill : style.stroke, opacity: opacityOf(glyph), rect });
  }

  return { boxes, skipped };
};

/** The photograph, decoded in the page, and every box compared with its worst pixel. */
const compare = async ({ png, boxes }) => {
  const image = new Image();
  image.src = `data:image/png;base64,${png}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const resolve = css => {
    pctx.clearRect(0, 0, 1, 1);
    pctx.fillStyle = css;
    pctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const channel = c => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  return boxes.map(box => {
    // Rounded inward: the pixel a glyph's box only grazes belongs to the
    // neighbour beside it, and a neighbour in another colour is not the
    // background of this text.
    const x = Math.ceil(box.rect.left);
    const y = Math.ceil(box.rect.top);
    const w = Math.max(1, Math.floor(box.rect.right) - x);
    const h = Math.max(1, Math.floor(box.rect.bottom) - y);
    const { data } = ctx.getImageData(x, y, w, h);
    let light = { l: -1, rgb: [0, 0, 0] };
    let dark = { l: 2, rgb: [0, 0, 0] };
    for (let i = 0; i < data.length; i += 4) {
      const l = luminance(data[i], data[i + 1], data[i + 2]);
      if (l > light.l) light = { l, rgb: [data[i], data[i + 1], data[i + 2]] };
      if (l < dark.l) dark = { l, rgb: [data[i], data[i + 1], data[i + 2]] };
    }
    const fg = resolve(box.color);
    const alpha = fg.a * box.opacity;
    const against = ({ rgb }) => {
      const mixed = [fg.r, fg.g, fg.b].map((c, index) => c * alpha + rgb[index] * (1 - alpha));
      return ratio(luminance(...mixed), luminance(...rgb));
    };
    const worst = Math.min(against(light), against(dark));
    return { ...box, ratio: Math.round(worst * 100) / 100, behind: worst === against(light) ? light.rgb.join(',') : dark.rgb.join(',') };
  });
};

/**
 * Measures every colour pair currently on screen.
 *
 * @param page a Playwright page, settled
 * @returns `measured` (every box with its ratio and its minimum), `failures`,
 *   `lowest` (the box closest to its minimum) and `skipped` (a count per reason)
 */
export const measureContrast = async page => {
  const { boxes, skipped } = await page.evaluate(collectBoxes);
  const style = await page.addStyleTag({ content: HIDE_GLYPHS });
  let png;
  try {
    png = (await page.screenshot({ type: 'png', animations: 'allow' })).toString('base64');
  } finally {
    await style.evaluate(node => node.remove());
  }
  const compared = await page.evaluate(compare, { png, boxes });
  const measured = compared.map(box => ({ ...box, minimum: MINIMUM[box.kind] }));
  const failures = measured.filter(box => box.ratio < box.minimum);
  const lowest = measured.reduce((worst, box) => (!worst || box.ratio - box.minimum < worst.ratio - worst.minimum ? box : worst), null);
  return { measured, failures, lowest, skipped };
};
