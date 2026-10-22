/**
 * The sway of a card in gusty weather: how long one drift takes and how far
 * into it the card already is.
 *
 * Both come from the card's id and not from where it stands in its column.
 * The reference design uses the index, which gives the first card of every
 * column the same phase, so a row of columns drifts in step, and which changes
 * whenever a card is dropped above another, so a card that has just landed
 * would also jump to a different part of its drift. An id never changes and
 * does not repeat, so each card keeps its own rhythm wherever it is put.
 *
 * FNV-1a over the UTF-16 code units, the same hash `hueFromSeed` uses for a
 * colour. It is not cryptographic and does not need to be: it has to be stable
 * and spread ids over the range.
 */
export interface Sway {
  /** One drift, in seconds: 3, 4 or 5. */
  seconds: number;
  /** Negative, so the card starts part way through its drift: 0 to 13.3 seconds in. */
  delay: number;
}

const fnv1a = (seed: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const swayOf = (seed: string): Sway => {
  const hash = fnv1a(seed);
  const steps = Math.floor(hash / 3) % 20;
  // Zero is written as zero: negating it would give -0, which reads the same
  // and is not equal to it.
  return { seconds: 3 + (hash % 3), delay: steps === 0 ? 0 : -Number((steps * 0.7).toFixed(1)) };
};

/** The CSS `animation` value for a sway. The keyframes are `bbSway` in the token layer. */
export const swayAnimation = ({ seconds, delay }: Sway): string =>
  `bbSway ${seconds}s ease-in-out ${delay === 0 ? '0' : delay}s infinite`;
