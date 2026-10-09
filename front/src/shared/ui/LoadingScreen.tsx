import React from 'react';
import { IconWind } from '@tabler/icons-react';
import { Icon } from './Icon';

export interface LoadingScreenProps {
  /**
   * What is being waited for, announced rather than only drawn.
   * Shown as text below the mark when `showLabel` is set.
   */
  label?: string;
  showLabel?: boolean;
}

/**
 * A page that has nothing to show yet.
 *
 * The wait is drawn as the brand's own mark, the wind glyph on the logo
 * gradient swaying on the spec's `bbSway`, instead of a rotating border that
 * looks like every other application's. The sway is the only motion, and it
 * is collapsed by the reduced motion rule, which leaves a still mark.
 *
 * The mark carries `role="status"` and a name. Without them it is a drawing
 * and nothing else: the page reads as empty to anyone not looking at it.
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({ label = 'Loading', showLabel = false }) => (
  <div className="flex min-h-screen items-center justify-center bg-ground p-6">
    <div className="text-center">
      <div
        role="status"
        aria-label={label}
        style={{ background: 'var(--gradient-mark)' }}
        className="mx-auto flex size-14 items-center justify-center rounded-card text-white shadow-button"
      >
        <Icon as={IconWind} size={28} className="animate-bb-sway" aria-hidden="true" />
      </div>
      {showLabel && <p className="mt-4 text-ink-secondary">{label}</p>}
    </div>
  </div>
);

export default LoadingScreen;
