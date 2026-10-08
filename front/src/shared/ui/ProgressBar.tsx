import React from 'react';
import { EDGE_BACKGROUND, EDGE_VAR } from './hue';
import type { Hue } from './hue';

export type ProgressSize = 6 | 8;
export type ProgressVariant = 'solid' | 'gradient';

export interface ProgressBarProps {
  value: number;
  /** The value that means done. Defaults to 100. */
  max?: number;
  /** Names what is progressing. Required: a bar with no name is announced as a bare percentage. */
  label: string;
  /** Spoken in place of the percentage, for example "3 of 8 landed". */
  valueText?: string;
  /** Height in pixels, 6 for a tile or a checklist and 8 for a board header. */
  size?: ProgressSize;
  /** `gradient` runs from `hue` to `toHue`. */
  variant?: ProgressVariant;
  hue?: Hue;
  toHue?: Hue;
  className?: string;
}

const SIZE_CLASSES: Record<ProgressSize, string> = {
  6: 'h-1.5 bg-line-07',
  8: 'h-2 bg-line-08',
};

const FILL_DURATION: Record<ProgressSize, string> = {
  6: 'duration-600',
  8: 'duration-700',
};

/** Between 0 and 100, with a missing, infinite or negative value drawn as empty. */
const percentOf = (value: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
};

/**
 * A progress bar with the semantics of one: `role="progressbar"`, the value
 * and its bounds, and a name.
 *
 * The fill is the hue's edge step, not its mid. The mid measures about 2:1
 * against the track and 2.4:1 against white, too faint for a shape that is
 * the whole message. The edge is 3.46:1 or better on the ground for every
 * hue. The figure is still worth writing beside the bar, for a person who
 * wants the number, which is why `valueText` exists.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  valueText,
  size = 6,
  variant = 'solid',
  hue = 'sky',
  toHue = 'green',
  className = '',
}) => {
  const percent = percentOf(value, max);
  const gradient = variant === 'gradient';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0))}
      aria-valuetext={valueText}
      className={`w-full overflow-hidden rounded-pill ${SIZE_CLASSES[size]} ${className}`}
    >
      <div
        data-testid="progress-fill"
        className={`h-full rounded-pill transition-[width] ease-standard ${FILL_DURATION[size]} ${gradient ? '' : EDGE_BACKGROUND[hue]}`}
        style={{
          width: `${percent}%`,
          ...(gradient ? { background: `linear-gradient(90deg, ${EDGE_VAR[hue]}, ${EDGE_VAR[toHue]})` } : {}),
        }}
      />
    </div>
  );
};

export default ProgressBar;
