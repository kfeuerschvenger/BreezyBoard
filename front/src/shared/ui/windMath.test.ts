import { describe, expect, it } from 'vitest';
import {
  INTENSITY,
  particleAnimation,
  particleFill,
  particleShape,
  particleTop,
  streakAnimation,
  streakDash,
  streakPath,
  streakStroke,
  streakWidth,
} from './windMath';

/**
 * The expected strings are worked out by hand from the formulas in
 * windMath.ts, not copied from the output, so a slip in either place shows as
 * a difference.
 */

describe('streak formulas', () => {
  // i = 1: y = 70 + 137 = 207, a = 30 + 53 = 83, y - 0.4a = 173.8, y + 0.3a = 231.9.
  it.each([
    [0, 'M-80 70 C 260 40, 520 100, 820 58 S 1260 40, 1540 79'],
    [1, 'M-80 207 C 260 124, 520 290, 820 173.8 S 1260 124, 1540 231.9'],
    [5, 'M-80 755 C 260 700, 520 810, 820 733 S 1260 700, 1540 771.5'],
    // 6 * 137 = 822, and 822 mod 760 = 62, so the streak wraps back to the top.
    [6, 'M-80 132 C 260 84, 520 180, 820 112.8 S 1260 84, 1540 146.4'],
  ])('draws streak %i as %s', (index, expected) => {
    expect(streakPath(index)).toBe(expected);
  });

  it('keeps every start of the first eleven streaks inside the canvas height', () => {
    for (let i = 0; i < 11; i += 1) {
      const y = Number(streakPath(i).split(' ')[1]);
      expect(y).toBeGreaterThanOrEqual(70);
      expect(y).toBeLessThan(830);
    }
  });

  it.each([
    [0, 1.2],
    [1, 1.8],
    [2, 2.4],
    [3, 1.2],
  ])('gives streak %i a stroke width of %s', (index, expected) => {
    expect(streakWidth(index)).toBeCloseTo(expected, 5);
  });

  it.each([
    [0, '110 1890'],
    [1, '155 1890'],
    [2, '200 1890'],
    [3, '245 1890'],
    [4, '110 1890'],
  ])('gives streak %i the dash pattern %s', (index, expected) => {
    expect(streakDash(index)).toBe(expected);
  });

  it.each([
    [0, 'rgba(255,255,255,0.35)'],
    [1, 'rgba(255,255,255,0.47)'],
    [2, 'rgba(255,255,255,0.59)'],
    [3, 'rgba(255,255,255,0.35)'],
  ])('draws the light streak %i in %s', (index, expected) => {
    expect(streakStroke(index, 'light')).toBe(expected);
  });

  it.each([
    [0, 'oklch(0.62 0.12 232 / 0.22)'],
    [1, 'oklch(0.62 0.12 192 / 0.28)'],
    [2, 'oklch(0.62 0.12 232 / 0.34)'],
    [3, 'oklch(0.62 0.12 300 / 0.22)'],
    [4, 'oklch(0.62 0.12 232 / 0.28)'],
  ])('draws the dark streak %i in %s', (index, expected) => {
    expect(streakStroke(index, 'dark')).toBe(expected);
  });

  // Duration is (9 + (i * 7) mod 8) times the speed; the delay is minus (i * 3.1) mod 12.
  it.each([
    [0, 1, 'bbFlow 9.00s linear -0.00s infinite'],
    [1, 1, 'bbFlow 16.00s linear -3.10s infinite'],
    [2, 1, 'bbFlow 15.00s linear -6.20s infinite'],
    [5, 1, 'bbFlow 12.00s linear -3.50s infinite'],
    [1, 0.55, 'bbFlow 8.80s linear -3.10s infinite'],
    [1, 1.6, 'bbFlow 25.60s linear -3.10s infinite'],
  ])('animates streak %i at speed %s as %s', (index, speed, expected) => {
    expect(streakAnimation(index, speed)).toBe(expected);
  });
});

describe('particle formulas', () => {
  it.each([
    [0, '6%'],
    [1, '67%'],
    // 61 * 2 = 122 and 122 mod 86 = 36; 61 * 3 = 183 and 183 mod 86 = 11. Each is six more.
    [2, '42%'],
    [3, '17%'],
  ])('puts particle %i at %s from the top', (index, expected) => {
    expect(particleTop(index)).toBe(expected);
  });

  it('draws even particles as 9 by 5 leaves with a leaf shaped radius', () => {
    expect(particleShape(0)).toEqual({ width: 9, height: 5, borderRadius: '70% 0 70% 0' });
    expect(particleShape(4)).toEqual({ width: 9, height: 5, borderRadius: '70% 0 70% 0' });
  });

  it('draws odd particles as round dots 3 high and 4, 6 or 8 wide', () => {
    expect(particleShape(1)).toEqual({ width: 6, height: 3, borderRadius: '50%' });
    expect(particleShape(3)).toEqual({ width: 4, height: 3, borderRadius: '50%' });
    expect(particleShape(5)).toEqual({ width: 8, height: 3, borderRadius: '50%' });
  });

  it('fills light particles white at 85 percent and dark ones from the five hue cycle', () => {
    expect(particleFill(0, 'light')).toBe('rgba(255,255,255,.85)');
    expect(particleFill(0, 'dark')).toBe('oklch(0.7 0.13 38 / .75)');
    expect(particleFill(1, 'dark')).toBe('oklch(0.7 0.13 82 / .75)');
    expect(particleFill(4, 'dark')).toBe('oklch(0.7 0.13 232 / .75)');
    expect(particleFill(5, 'dark')).toBe('oklch(0.7 0.13 38 / .75)');
  });

  // Duration is (14 + (i * 5) mod 10) times the speed; the delay is minus (i * 2.3) mod 20.
  it.each([
    [0, 1, 'bbDrift 14.00s linear -0.00s infinite'],
    [1, 1, 'bbDrift 19.00s linear -2.30s infinite'],
    [8, 1, 'bbDrift 14.00s linear -18.40s infinite'],
    [19, 1, 'bbDrift 19.00s linear -3.70s infinite'],
    [1, 0.55, 'bbDrift 10.45s linear -2.30s infinite'],
  ])('animates particle %i at speed %s as %s', (index, speed, expected) => {
    expect(particleAnimation(index, speed)).toBe(expected);
  });
});

describe('intensity', () => {
  it('calm is 3 streaks and 3 particles at 1.6 times the duration', () => {
    expect(INTENSITY.calm).toEqual({ streaks: 3, particles: 3, speed: 1.6 });
  });

  it('breezy is 6 and 9 at normal pace', () => {
    expect(INTENSITY.breezy).toEqual({ streaks: 6, particles: 9, speed: 1 });
  });

  it('gusty is 11 and 20 at 0.55 times the duration, which is faster', () => {
    expect(INTENSITY.gusty).toEqual({ streaks: 11, particles: 20, speed: 0.55 });
  });

  it('has no entry for still, which draws nothing', () => {
    expect('still' in INTENSITY).toBe(false);
  });
});
