/**
 * The formulas of the wind layer: streak curves, widths, dashes and strokes,
 * and particle positions, shapes and fills, each derived from the index.
 *
 * Every streak and particle is a function of its index and nothing else: no
 * random number is drawn, so the same level always produces the same markup,
 * and a test can pin an element by its index.
 */

export type WindLevel = 'still' | 'calm' | 'breezy' | 'gusty';
export type WindTone = 'light' | 'dark';

export interface Intensity {
  streaks: number;
  particles: number;
  /** Multiplies every duration, so a lower number is faster. */
  speed: number;
}

/** Counts and pace per level. `still` has none because it draws nothing. */
export const INTENSITY: Record<Exclude<WindLevel, 'still'>, Intensity> = {
  calm: { streaks: 3, particles: 3, speed: 1.6 },
  breezy: { streaks: 6, particles: 9, speed: 1 },
  gusty: { streaks: 11, particles: 20, speed: 0.55 },
};

const DARK_STREAK_HUES = [232, 192, 232, 300] as const;
const DARK_PARTICLE_HUES = [38, 82, 150, 300, 232] as const;

/** The path of the streak with index `i`: a long S curve across a 1440 by 900 canvas. */
export const streakPath = (i: number): string => {
  const y = 70 + ((i * 137) % 760);
  const a = 30 + ((i * 53) % 60);
  return `M-80 ${y} C 260 ${y - a}, 520 ${y + a}, 820 ${y - a * 0.4} S 1260 ${y - a}, 1540 ${y + a * 0.3}`;
};

export const streakStroke = (i: number, tone: WindTone): string =>
  tone === 'light'
    ? `rgba(255,255,255,${(0.35 + (i % 3) * 0.12).toFixed(2)})`
    : `oklch(0.62 0.12 ${DARK_STREAK_HUES[i % 4]} / ${(0.22 + (i % 3) * 0.06).toFixed(2)})`;

export const streakWidth = (i: number): number => 1.2 + (i % 3) * 0.6;

export const streakDash = (i: number): string => `${110 + (i % 4) * 45} 1890`;

/** The animation shorthand of a streak: its own duration and a negative delay, so none starts where another does. */
export const streakAnimation = (i: number, speed: number): string =>
  `bbFlow ${((9 + ((i * 7) % 8)) * speed).toFixed(2)}s linear -${((i * 3.1) % 12).toFixed(2)}s infinite`;

/** The animation shorthand of a particle. */
export const particleAnimation = (i: number, speed: number): string =>
  `bbDrift ${((14 + ((i * 5) % 10)) * speed).toFixed(2)}s linear -${((i * 2.3) % 20).toFixed(2)}s infinite`;

/** Even indices are leaves, odd ones are dots. */
export const particleShape = (i: number) =>
  i % 2 === 0
    ? { width: 9, height: 5, borderRadius: '70% 0 70% 0' }
    : { width: 4 + (i % 3) * 2, height: 3, borderRadius: '50%' };

export const particleTop = (i: number): string => `${6 + ((i * 61) % 86)}%`;

export const particleFill = (i: number, tone: WindTone): string =>
  tone === 'light' ? 'rgba(255,255,255,.85)' : `oklch(0.7 0.13 ${DARK_PARTICLE_HUES[i % 5]} / .75)`;
