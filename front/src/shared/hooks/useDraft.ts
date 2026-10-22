import { useCallback, useRef } from 'react';

const PREFIX = 'breezyboard:draft:';

/** Default minimum gap between draft writes, in milliseconds. */
export const DRAFT_THROTTLE_MS = 500;

interface StoredDraft<T> {
  savedAt: number;
  value: T;
}

export interface UseDraftResult<T> {
  /** Reads the stored draft, or null when there is none or it cannot be read. */
  read: () => T | null;
  /** Stores the draft. Throttled, so it is safe to call on every keystroke. */
  write: (value: T) => void;
  /** Removes the draft. Call after a successful save. */
  clear: () => void;
}

/**
 * Keeps an in-progress form in localStorage so that losing the page does not
 * lose the work.
 *
 * This exists because of the session timeout: a user reading or thinking
 * generates no activity, so they can be signed out mid-sentence. A louder
 * warning is the wrong instrument for that. Not losing the data is the right
 * one, and it covers what no warning can: an accidental tab close, a browser
 * crash, and a failed save.
 *
 * Every storage access is guarded. localStorage throws outright in some
 * contexts (a browser set to block site data, a private window in some
 * engines), and a draft is a convenience that must never break the form.
 *
 * @param key stable identifier for the thing being edited, or null to disable
 * @param throttleMs minimum gap between writes
 */
export function useDraft<T>(key: string | null, throttleMs = DRAFT_THROTTLE_MS): UseDraftResult<T> {
  const lastWriteRef = useRef(0);
  const pendingRef = useRef<number | null>(null);

  const storageKey = key ? PREFIX + key : null;

  const read = useCallback((): T | null => {
    if (!storageKey) return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredDraft<T>;
      return parsed && 'value' in parsed ? parsed.value : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const persist = useCallback(
    (value: T) => {
      if (!storageKey) return;
      try {
        const payload: StoredDraft<T> = { savedAt: Date.now(), value };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
        lastWriteRef.current = Date.now();
      } catch {
        // Storage full or blocked. The form keeps working without a draft.
      }
    },
    [storageKey]
  );

  const write = useCallback(
    (value: T) => {
      if (!storageKey) return;

      const sinceLast = Date.now() - lastWriteRef.current;
      if (sinceLast >= throttleMs) {
        persist(value);
        return;
      }

      // Trailing write, so the last keystroke before a pause is never the one
      // that gets dropped.
      if (pendingRef.current !== null) {
        window.clearTimeout(pendingRef.current);
      }
      pendingRef.current = window.setTimeout(() => {
        pendingRef.current = null;
        persist(value);
      }, throttleMs - sinceLast);
    },
    [storageKey, persist, throttleMs]
  );

  const clear = useCallback(() => {
    if (pendingRef.current !== null) {
      window.clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing useful to do; the stale draft will simply be overwritten.
    }
  }, [storageKey]);

  return { read, write, clear };
}

export default useDraft;
