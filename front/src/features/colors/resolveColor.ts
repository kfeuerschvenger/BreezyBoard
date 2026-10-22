import type { Color } from '@/models';

/** The neutral anything unresolvable falls back to. */
export const COLOR_FALLBACK = '#64748B';

/** A palette as the components read it: colour id to hex value. */
export type ColorLookup = ReadonlyMap<string, string>;

export const toColorLookup = (colors: { _id: string; value: string }[]): ColorLookup =>
  new Map(colors.map(color => [color._id, color.value]));

const HEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

/**
 * The hex value to paint something with.
 *
 * A stored colour arrives as a hex value, as a populated colour object, or as
 * the id of one, which is why this takes a lookup rather than resolving on its
 * own. The lookup comes from one request for the whole palette, and replaces
 * asking the colour endpoint once per board or once per card.
 */
export const resolveColor = (color: Color | string | null | undefined, palette: ColorLookup): string => {
  if (!color) return COLOR_FALLBACK;

  if (typeof color === 'string') {
    const trimmed = color.trim();
    return HEX.test(trimmed) ? trimmed : (palette.get(trimmed) ?? COLOR_FALLBACK);
  }

  return color.value || palette.get(color._id) || COLOR_FALLBACK;
};
