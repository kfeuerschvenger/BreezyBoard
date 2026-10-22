import type { Board, Color } from '@/models';
import { DEFAULT_HUE, HUES, isHue } from '@/shared/ui';
import type { Hue } from '@/shared/ui';

/**
 * The hue a board is drawn in: the cover of its tile and the dot beside it in
 * the sidebar.
 *
 * A board's colour is an entry of the board palette, and the value of every
 * such entry is the key of one of the six hues. The API sends the entry
 * populated, so the hue is read off it directly. A colour that arrives as a
 * bare id, or whose value is not a hue, says nothing about one and takes the
 * default, so a board is never left unpainted.
 */
export const boardHueOf = (color: Board['color'] | null | undefined): Hue => {
  if (color && typeof color === 'object' && isHue(color.value)) return color.value;
  return DEFAULT_HUE;
};

/** One choice in the board colour picker. */
export interface BoardHueOption {
  id: string;
  label: string;
  /** The swatch fill, the hue's mid step as a CSS variable. */
  color: string;
  hue: Hue;
}

const labelOf = (color: Color, hue: Hue): string => color.name?.trim() || hue[0].toUpperCase() + hue.slice(1);

/**
 * The palette as the picker offers it: the entries that name one of the six
 * hues, in the hues' own order and not the order the server happened to list
 * them. An entry that names no hue is left out, which is what keeps a palette
 * that was never migrated from offering a colour a board cannot be saved with.
 */
export const boardHueOptions = (palette: readonly Color[]): BoardHueOption[] =>
  HUES.flatMap(hue => {
    const entry = palette.find(color => color.value === hue);
    return entry ? [{ id: entry._id, label: labelOf(entry, hue), color: `var(--color-${hue}-mid)`, hue }] : [];
  });
