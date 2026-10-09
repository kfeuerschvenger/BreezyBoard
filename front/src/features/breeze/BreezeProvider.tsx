import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useToast } from '@/shared/hooks/useToast';
import { writeStoredBreeze } from './breezeStorage';
import { BreezeContext } from './breezeContext';
import type { BreezeContextValue } from './breezeContext';
import { useBreezeSetting } from './queries';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Tells everything below it how much ambient motion to play.
 *
 * Two things decide it and they are kept apart. The stored choice belongs to
 * the person and follows them across devices. The system's reduced motion
 * preference belongs to the device and wins over it: WCAG 2.2.2 asks for a way
 * to stop motion that runs for more than five seconds, and a person who has
 * asked the system for less must not have to ask again here. The preference
 * forces `level` to still and leaves `stored` alone, so the choice is intact
 * the moment the preference is lifted, and so the control can show both.
 */
export const BreezeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const toast = useToast();
  const reducedBySystem = useMediaQuery(REDUCED_MOTION);
  const setting = useBreezeSetting(user?._id ?? null, user?.breeze);

  const { level: stored, setLevel: save } = setting;
  const signedIn = Boolean(user);

  // Mirrors the level for the signed out screen, on load and on every change.
  // The server value stays the truth; sign out leaves the copy in place.
  useEffect(() => {
    if (signedIn) writeStoredBreeze(stored);
  }, [signedIn, stored]);

  const value = useMemo<BreezeContextValue>(
    () => ({
      stored,
      level: reducedBySystem ? 'still' : stored,
      reducedBySystem,
      setLevel: level => save(level, () => toast.show({ message: 'Your Breeze setting did not save. Try again.' })),
    }),
    [stored, reducedBySystem, save, toast],
  );

  return <BreezeContext.Provider value={value}>{children}</BreezeContext.Provider>;
};

export default BreezeProvider;
