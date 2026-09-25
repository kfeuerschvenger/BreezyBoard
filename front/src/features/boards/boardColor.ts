import { resolveColorValueSync } from '@/utils/colorUtils';
import type { Board } from '@/models';

/** The neutral a board falls back to when its colour cannot be resolved. */
export const BOARD_COLOR_FALLBACK = '#64748B';

/** The palette as the cards read it: colour id to hex value. */
export type ColorLookup = ReadonlyMap<string, string>;

export const toColorLookup = (colors: { _id: string; value: string }[]): ColorLookup =>
  new Map(colors.map(color => [color._id, color.value]));

/**
 * The colour to paint a board with.
 *
 * A board's colour arrives as a hex value, as a populated colour object or as
 * the id of one, which is why this takes a lookup rather than a value. The
 * lookup comes from the board palette, one request for the whole list, and
 * replaces resolving each board's colour with a request of its own.
 */
export const resolveBoardColor = (color: Board['color'] | undefined, palette: ColorLookup): string => {
  const direct = resolveColorValueSync(color, BOARD_COLOR_FALLBACK);
  if (direct !== BOARD_COLOR_FALLBACK) return direct;

  const id = typeof color === 'string' ? color : (color?._id ?? '');
  return palette.get(id) ?? BOARD_COLOR_FALLBACK;
};
