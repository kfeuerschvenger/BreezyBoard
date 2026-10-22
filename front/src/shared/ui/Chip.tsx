import React from 'react';
import { DEEP_TEXT, TINT_BACKGROUND } from './hue';
import type { Hue } from './hue';

export type ChipVariant = 'label' | 'status';

export interface ChipProps {
  /** The hue of the chip, or `neutral` for the plain grey one. */
  hue?: Hue | 'neutral';
  /**
   * `label` is the round tag on a card, 11.5 pixels. `status` is the squarer
   * one that carries an icon and a fact such as a due date, 12 pixels.
   */
  variant?: ChipVariant;
  /** Decorative, drawn before the text and hidden from assistive technology. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The text is the chip's `deep` step on its own `tint`, 6.3 to 7.2:1 across
 * the six hues. The tertiary text colour is never used here: it does not
 * clear 4.5:1 on a chip tint (4.29:1 on coral), which is why a chip carries
 * its own deep step instead.
 *
 * Neutral is secondary text on a navy at 6 percent, 6.44:1.
 */
const NEUTRAL_CLASSES = 'bg-line-06 text-ink-secondary';

const VARIANT_CLASSES: Record<ChipVariant, string> = {
  label: 'rounded-pill px-[9px] py-[3px] text-[11.5px]',
  status: 'rounded-chip px-2 py-[3px] text-xs',
};

/**
 * A small coloured fact: a label on a card, a due date, a priority.
 *
 * The meaning is always in the words. The hue only groups and decorates, so a
 * person who cannot tell the hues apart loses nothing.
 */
export const Chip: React.FC<ChipProps> = ({ hue = 'neutral', variant = 'label', icon, children, className = '' }) => {
  const colour = hue === 'neutral' ? NEUTRAL_CLASSES : `${TINT_BACKGROUND[hue]} ${DEEP_TEXT[hue]}`;

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold leading-tight ${VARIANT_CLASSES[variant]} ${colour} ${className}`}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
};

export default Chip;
