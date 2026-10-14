import { describe, expect, it } from 'vitest';
import { swayAnimation, swayOf } from './sway';

const IDS = Array.from({ length: 300 }, (_, index) => `6ace${index.toString(16).padStart(20, '0')}`);

describe('swayOf', () => {
  // Worked out by hand: the hash of an empty seed is the FNV offset basis,
  // 2166136261. Its remainder modulo 3 is 1, so a drift of four seconds, and
  // a third of it, 722045420, is a multiple of 20, so no delay.
  it('is the hash of the seed, pinned at the empty seed', () => {
    expect(swayOf('')).toEqual({ seconds: 4, delay: 0 });
  });

  it('gives the same card the same sway every time', () => {
    expect(swayOf('6ace0000000000000000abcd')).toEqual(swayOf('6ace0000000000000000abcd'));
  });

  it('keeps every card to a drift of three to five seconds and a start within the first 13.3', () => {
    for (const id of IDS) {
      const { seconds, delay } = swayOf(id);
      expect([3, 4, 5]).toContain(seconds);
      expect(delay).toBeLessThanOrEqual(0);
      expect(delay).toBeGreaterThanOrEqual(-13.3);
    }
  });

  // The reason the seed is an id and not a position: a row of columns must not
  // drift in step, and a spread over 300 ids shows all three drifts and many
  // different starts.
  it('spreads ids across the drifts and the starts', () => {
    const results = IDS.map(swayOf);

    expect(new Set(results.map(result => result.seconds))).toEqual(new Set([3, 4, 5]));
    expect(new Set(results.map(result => result.delay)).size).toBeGreaterThan(10);
  });

  it('does not give two neighbouring ids the same sway', () => {
    expect(swayOf('6ace000000000000000000a1')).not.toEqual(swayOf('6ace000000000000000000a2'));
  });
});

describe('swayAnimation', () => {
  it('names the bbSway keyframes with the drift and the start, forever', () => {
    expect(swayAnimation({ seconds: 4, delay: -2.1 })).toBe('bbSway 4s ease-in-out -2.1s infinite');
  });

  it('writes a start of zero as a plain 0', () => {
    expect(swayAnimation({ seconds: 3, delay: 0 })).toBe('bbSway 3s ease-in-out 0s infinite');
    expect(swayAnimation({ seconds: 3, delay: -0 })).toBe('bbSway 3s ease-in-out 0s infinite');
  });
});
