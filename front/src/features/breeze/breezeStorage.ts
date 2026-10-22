import { BREEZE_LEVELS, DEFAULT_BREEZE } from './breeze';
import type { BreezeLevel } from './breeze';

/** The browser key that mirrors the signed in person's Breeze level for the screen shown before sign in. */
export const BREEZE_STORAGE_KEY = 'bb.breeze';

/**
 * The last level this browser knew, or the default when there is none.
 *
 * The server value stays the source of truth once someone is signed in. This
 * copy exists only because the signed out screen has no user to ask. Storage
 * can be absent, blocked or throw, and the stored text can be anything, so a
 * value that is not a level reads as the default, and so does a failed read.
 */
export const readStoredBreeze = (): BreezeLevel => {
  try {
    const value = window.localStorage.getItem(BREEZE_STORAGE_KEY);
    return BREEZE_LEVELS.find(level => level === value) ?? DEFAULT_BREEZE;
  } catch {
    return DEFAULT_BREEZE;
  }
};

/** Remembers a level. A browser that refuses to store it simply keeps showing the default next time. */
export const writeStoredBreeze = (level: BreezeLevel): void => {
  try {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, level);
  } catch {
    // Nothing to do: the mirror is a convenience and the server holds the truth.
  }
};
