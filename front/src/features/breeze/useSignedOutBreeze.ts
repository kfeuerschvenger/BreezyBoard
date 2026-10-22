import { useState } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { readStoredBreeze } from './breezeStorage';
import type { BreezeLevel } from './breeze';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The wind for a screen with no signed in user.
 *
 * `stored` is the level this browser last saw for someone, and `level` is what
 * to play: the same choice, held at still while the system asks for reduced
 * motion. The preference never touches the stored copy, as in the shell.
 * Storage is read once, when the screen mounts.
 */
export const useSignedOutBreeze = (): { stored: BreezeLevel; level: BreezeLevel } => {
  const [stored] = useState(readStoredBreeze);
  const reducedBySystem = useMediaQuery(REDUCED_MOTION);

  return { stored, level: reducedBySystem ? 'still' : stored };
};

export default useSignedOutBreeze;
