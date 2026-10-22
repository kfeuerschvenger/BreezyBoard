import { useEffect } from 'react';

/**
 * Locks body scroll while locked is true and restores the previous
 * inline overflow value once locked becomes false or the component unmounts.
 *
 * @param locked - Whether body scroll should be locked.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}
