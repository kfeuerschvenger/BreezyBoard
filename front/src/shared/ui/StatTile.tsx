import React from 'react';
import { DEEP_TEXT, TINT_BACKGROUND } from './hue';
import type { Hue } from './hue';

export type StatTileTone = Hue;

export interface StatTileProps {
  /** Decorative. The tile hides it from assistive technology. */
  icon: React.ReactNode;
  tone: StatTileTone;
  value: React.ReactNode;
  label: string;
  /** Seconds to stagger the entrance by, when several are shown as a row. */
  delay?: number;
}

/**
 * One figure with the word for what it counts.
 *
 * The icon is decoration: it repeats what the label already says, so it is
 * hidden rather than announced a second time under a name guessed from the
 * file it came from. It sits on the hue's tint and an icon with no colour of
 * its own takes the hue's deep step.
 *
 * The tone picks whole class names out of the hue maps rather than building
 * them, because Tailwind cannot see a class that only exists once the
 * component runs.
 *
 * The tile arrives on `bbUp`, staggered by `delay` through the animation's own
 * delay, with the fill mode that holds it invisible until it starts.
 */
export const StatTile: React.FC<StatTileProps> = ({ icon, tone, value, label, delay = 0 }) => (
  <div
    style={delay > 0 ? { animationDelay: `${delay}s` } : undefined}
    className="animate-bb-up rounded-tile border border-line-05 bg-surface p-6 shadow-tile"
  >
    <div className="flex items-center gap-3">
      <div
        className={`rounded-control p-2.5 ${TINT_BACKGROUND[tone]} ${DEEP_TEXT[tone]}`}
        aria-hidden="true"
      >
        {icon}
      </div>
      <div>
        <p className="font-heading text-[28px] font-bold leading-none tracking-tight text-ink">{value}</p>
        <p className="mt-1 text-sm text-ink-secondary">{label}</p>
      </div>
    </div>
  </div>
);

export default StatTile;
