import React, { useMemo } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
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
import type { WindLevel, WindTone } from './windMath';

export type { WindLevel, WindTone } from './windMath';

export interface WindLayerProps {
  /** `light` is white on a dark surface, `dark` is coloured on a light one. */
  tone?: WindTone;
  /** `still` draws nothing at all. */
  level?: WindLevel;
  className?: string;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The ambient wind: streaks that travel across the surface and particles that
 * drift over it.
 *
 * It is decoration and says so. It is hidden from assistive technology, takes
 * no pointer events, and is absolutely positioned over the box it is placed
 * in, which the caller must make positioned.
 *
 * Every streak and particle is drawn from its index with fixed formulas (see
 * `windMath.ts`), so two renders of the same props are identical markup and
 * nothing is random. It is also pure CSS: each element carries one
 * `animation` and the browser runs them, so React renders it once and never
 * again until the level or the tone changes. There is no timer, no animation
 * frame and no state.
 *
 * `still` renders nothing, because WCAG 2.2.2 asks for a way to stop motion
 * that runs for more than five seconds, and nothing at all is the only
 * version of "stopped" that cannot be undone by an animation that failed to
 * pause. A reduced motion preference renders nothing as well. The global
 * reduced motion rule would collapse these animations to one play of an
 * instant, which leaves the streaks frozen mid page rather than gone.
 */
export const WindLayer: React.FC<WindLayerProps> = ({ tone = 'light', level = 'breezy', className = '' }) => {
  const reduced = useMediaQuery(REDUCED_MOTION);

  const layer = useMemo(() => {
    if (level === 'still') return null;
    const { streaks, particles, speed } = INTENSITY[level];

    return (
      <>
        <svg viewBox="0 0 1440 900" preserveAspectRatio="none" className="absolute inset-0 size-full">
          {Array.from({ length: streaks }, (_, i) => (
            <path
              key={i}
              d={streakPath(i)}
              pathLength={1000}
              fill="none"
              strokeLinecap="round"
              stroke={streakStroke(i, tone)}
              strokeWidth={streakWidth(i)}
              strokeDasharray={streakDash(i)}
              style={{ animation: streakAnimation(i, speed) }}
            />
          ))}
        </svg>
        {Array.from({ length: particles }, (_, i) => (
          <span
            key={i}
            className="absolute left-0 will-change-transform"
            style={{
              top: particleTop(i),
              ...particleShape(i),
              background: particleFill(i, tone),
              animation: particleAnimation(i, speed),
            }}
          />
        ))}
      </>
    );
  }, [level, tone]);

  if (reduced || !layer) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="wind-layer"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {layer}
    </div>
  );
};

export default WindLayer;
