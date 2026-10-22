// The board palette: six hues of the design system, and nothing else.
//
// A board's colour is stored as a reference to a `board` entry of the colour
// palette, as it always has been. What changed is what those entries hold: the
// `value` of a board colour is a hue key from this list, not a hex string, and
// the interface turns the key into the hue's tint, mid and edge steps itself.
// The task and column palettes keep hex values.
//
// The angles are the hue angles the interface declares in its token layer
// (`front/src/shared/ui/hue.ts`, `HUE_ANGLE`), which is what makes "nearest
// hue" a statement about the design system and not about this file.

export const BOARD_HUES = Object.freeze(['sky', 'teal', 'green', 'sand', 'coral', 'lavender']);

export const BOARD_HUE_NAMES = Object.freeze({
  sky: 'Sky',
  teal: 'Teal',
  green: 'Green',
  sand: 'Sand',
  coral: 'Coral',
  lavender: 'Lavender',
});

const HUE_ANGLES = Object.freeze({
  sky: 232,
  teal: 192,
  green: 150,
  sand: 82,
  coral: 38,
  lavender: 300,
});

/** The hue a board falls back to when its stored colour says nothing about one. */
export const DEFAULT_BOARD_HUE = 'sky';

/** Below this OKLCH chroma a colour is grey, and a grey has no hue to be near. */
const ACHROMATIC_CHROMA = 0.02;

export const isBoardHue = value => BOARD_HUES.includes(value);

const toLinear = channel => {
  const normalised = channel / 255;
  return normalised <= 0.04045 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
};

/**
 * The OKLCH hue angle in degrees, and the chroma, of a `#RRGGBB` or `#RGB`
 * colour. Null for anything else.
 */
export const hueAngleOf = hex => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!match) return null;

  const digits = match[1].length === 3 ? [...match[1]].map(digit => digit + digit).join('') : match[1];
  const [red, green, blue] = [0, 2, 4].map(offset => toLinear(parseInt(digits.slice(offset, offset + 2), 16)));

  // Linear sRGB to OKLab, from Björn Ottosson's reference matrices.
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

  return {
    hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    chroma: Math.hypot(a, b),
  };
};

const circularDistance = (from, to) => {
  const difference = Math.abs(from - to) % 360;
  return Math.min(difference, 360 - difference);
};

/**
 * The design hue closest to a stored colour, measured round the colour wheel.
 *
 * A hue key maps to itself. A hex value maps to the hue whose angle is nearest
 * to its own, ties going to the hue listed first. A grey, or anything that is
 * not a colour at all, maps to the default, because it is not near any hue.
 */
export const nearestBoardHue = value => {
  if (isBoardHue(value)) return value;

  const measured = hueAngleOf(value);
  if (!measured || measured.chroma < ACHROMATIC_CHROMA) return DEFAULT_BOARD_HUE;

  let nearest = DEFAULT_BOARD_HUE;
  let nearestDistance = Infinity;

  for (const hue of BOARD_HUES) {
    const distance = circularDistance(measured.hue, HUE_ANGLES[hue]);
    if (distance < nearestDistance) {
      nearest = hue;
      nearestDistance = distance;
    }
  }

  return nearest;
};
