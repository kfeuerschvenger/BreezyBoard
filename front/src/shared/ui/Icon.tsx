import type { Icon as TablerGlyph, IconProps as TablerIconProps } from '@tabler/icons-react';

/** The one stroke width every glyph is drawn with, so the set reads as a family. */
const ICON_STROKE = 1.75;

export interface IconProps extends Omit<TablerIconProps, 'ref' | 'stroke'> {
  /** The Tabler glyph to draw, for example `IconPlus`. */
  as: TablerGlyph;
  /** Overrides the shared stroke width. Leave unset unless a glyph is drawn very small. */
  stroke?: number;
}

/**
 * Draws a Tabler glyph with the application's defaults.
 *
 * Tabler marks nothing as decorative and has no global stroke setting, so both
 * are decided here once. An icon is hidden from assistive technology unless it
 * is given an `aria-label` or a `title`, because almost every icon in the
 * interface sits next to a visible word or inside a button that is named by its
 * own `aria-label`, and an unhidden empty graphic would be announced as noise.
 */
export function Icon({ as: Glyph, stroke = ICON_STROKE, ...rest }: IconProps) {
  const named =
    rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined || rest.title !== undefined;
  return <Glyph stroke={stroke} aria-hidden={named ? undefined : true} {...rest} />;
}
