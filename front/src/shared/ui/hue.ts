/**
 * The six hues of the interface and everything derived from them.
 *
 * Every coloured thing is one of these, in the steps declared in `index.css`:
 * a tint for a background, a deep for text on that tint, a mid for a fill and
 * an edge for an outline. The class names below are whole literals, never
 * composed from the hue at runtime: Tailwind reads the source for complete
 * class names, and `bg-${hue}-tint` would produce an unstyled element while
 * every assertion about it passed.
 */

export const HUES = ['sky', 'teal', 'green', 'sand', 'coral', 'lavender'] as const;

export type Hue = (typeof HUES)[number];

/** The angle each hue has in the token layer, for gradients built from the number. */
export const HUE_ANGLE: Record<Hue, number> = {
  sky: 232,
  teal: 192,
  green: 150,
  sand: 82,
  coral: 38,
  lavender: 300,
};

export const TINT_BACKGROUND: Record<Hue, string> = {
  sky: 'bg-sky-tint',
  teal: 'bg-teal-tint',
  green: 'bg-green-tint',
  sand: 'bg-sand-tint',
  coral: 'bg-coral-tint',
  lavender: 'bg-lavender-tint',
};

export const DEEP_TEXT: Record<Hue, string> = {
  sky: 'text-sky-deep',
  teal: 'text-teal-deep',
  green: 'text-green-deep',
  sand: 'text-sand-deep',
  coral: 'text-coral-deep',
  lavender: 'text-lavender-deep',
};

export const MID_BACKGROUND: Record<Hue, string> = {
  sky: 'bg-sky-mid',
  teal: 'bg-teal-mid',
  green: 'bg-green-mid',
  sand: 'bg-sand-mid',
  coral: 'bg-coral-mid',
  lavender: 'bg-lavender-mid',
};

export const EDGE_BORDER: Record<Hue, string> = {
  sky: 'border-sky-edge',
  teal: 'border-teal-edge',
  green: 'border-green-edge',
  sand: 'border-sand-edge',
  coral: 'border-coral-edge',
  lavender: 'border-lavender-edge',
};

export const EDGE_BACKGROUND: Record<Hue, string> = {
  sky: 'bg-sky-edge',
  teal: 'bg-teal-edge',
  green: 'bg-green-edge',
  sand: 'bg-sand-edge',
  coral: 'bg-coral-edge',
  lavender: 'bg-lavender-edge',
};

/** The CSS variable holding a hue's edge step, for a gradient between two hues. */
export const EDGE_VAR: Record<Hue, string> = {
  sky: 'var(--color-sky-edge)',
  teal: 'var(--color-teal-edge)',
  green: 'var(--color-green-edge)',
  sand: 'var(--color-sand-edge)',
  coral: 'var(--color-coral-edge)',
  lavender: 'var(--color-lavender-edge)',
};

/**
 * Picks a hue from any string, the same one every time.
 *
 * FNV-1a over the UTF-16 code units, reduced to an index. It is not a
 * cryptographic hash and does not need to be: all it owes the caller is that
 * one id or one name never changes colour between renders, sessions or
 * devices, and that a set of ids spreads across all six rather than piling up
 * on one. An empty seed lands on a fixed hue instead of throwing.
 */
export const hueFromSeed = (seed: string): Hue => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return HUES[(hash >>> 0) % HUES.length];
};

/**
 * The cover gradient of a hue, as a CSS `background` value: three stops that
 * walk 30 and then 60 degrees round the colour wheel from the hue, dark to
 * light, so a cover reads as a sky and not as a flat swatch.
 */
export const coverGradient = (hue: Hue): string => {
  const angle = HUE_ANGLE[hue];
  return (
    `linear-gradient(120deg, oklch(0.5 0.13 ${angle}) 0%, ` +
    `oklch(0.66 0.12 ${(angle + 30) % 360}) 60%, ` +
    `oklch(0.83 0.09 ${(angle + 60) % 360}) 100%)`
  );
};
