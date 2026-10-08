import { describe, expect, it } from 'vitest';
import { coverGradient, hueFromSeed, HUES, HUE_ANGLE } from './hue';

describe('hueFromSeed', () => {
  it('gives the same hue for the same seed, every time', () => {
    expect(hueFromSeed('64f1c0ffee')).toBe(hueFromSeed('64f1c0ffee'));
    expect(hueFromSeed('Ada Lovelace')).toBe(hueFromSeed('Ada Lovelace'));
  });

  // Pinned on purpose. Changing the hash recolours every avatar in every
  // session, so a change to it has to be a decision and not a refactor.
  it.each([
    ['Ada Lovelace', 'sky'],
    ['64f1c0ffee00112233445566', 'lavender'],
    ['Kevin Feuerschvenger', 'coral'],
    ['a', 'coral'],
    ['', 'teal'],
  ])('maps %j to %s', (seed, expected) => {
    expect(hueFromSeed(seed)).toBe(expected);
  });

  it('always answers with one of the six hues', () => {
    for (const seed of ['', 'a', 'Ada Lovelace', '64f1c0ffee', '日本語', 'x'.repeat(500)]) {
      expect(HUES).toContain(hueFromSeed(seed));
    }
  });

  it('does not throw for an empty seed and lands on a defined hue', () => {
    expect(HUES).toContain(hueFromSeed(''));
  });

  it('spreads a set of ids across all six hues rather than piling up on one', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 120; index += 1) seen.add(hueFromSeed(`user-${index}`));

    expect(seen.size).toBe(6);
  });

  it('is sensitive to a one character difference', () => {
    const hues = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(hueFromSeed));

    expect(hues.size).toBeGreaterThan(1);
  });
});

describe('coverGradient', () => {
  it('walks 0, 30 and 60 degrees round the wheel from the hue', () => {
    expect(coverGradient('sky')).toBe(
      'linear-gradient(120deg, oklch(0.5 0.13 232) 0%, oklch(0.66 0.12 262) 60%, oklch(0.83 0.09 292) 100%)'
    );
  });

  it('wraps past 360 instead of producing an out of range hue', () => {
    expect(HUE_ANGLE.lavender).toBe(300);
    expect(coverGradient('lavender')).toContain('oklch(0.83 0.09 0)');
    expect(coverGradient('lavender')).toContain('oklch(0.66 0.12 330)');
  });

  it('is different for every hue', () => {
    expect(new Set(HUES.map(coverGradient)).size).toBe(6);
  });
});
