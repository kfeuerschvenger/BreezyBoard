import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AuthService } from '../../services/auth.service';
import { decodeJwtPayload } from '../../utils/auth.helper';
import { getLastRenewalAt, subscribeSessionRenewed } from './sessionActivity';

const WARNING_WINDOW_MS = 60_000;
const COUNTDOWN_TICK_MS = 1_000;

export interface UseSessionExpiryResult {
  warning: boolean;
  secondsRemaining: number | null;
  extend: () => Promise<void>;
}

/** Reads the current token's exp claim (seconds) as a ms deadline, or null when not applicable. */
const readDeadline = (): number | null => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const payload = decodeJwtPayload(token);
    const exp = payload?.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;

    return exp * 1000;
  } catch {
    return null;
  }
};

/**
 * Tracks the sliding session's inactivity deadline and drives the warning
 * toast. Reacts to renewals (this tab's own traffic, or another tab's,
 * propagated through the broadcast channel) via useSyncExternalStore, which
 * is React's documented way to read the external sessionActivity store
 * without turning it into React state owned elsewhere.
 */
export function useSessionExpiry(enabled: boolean, onExpire: () => void): UseSessionExpiryResult {
  const renewalTick = useSyncExternalStore(subscribeSessionRenewed, getLastRenewalAt);
  const [warning, setWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Schedules the warning flip and the expiry call against the deadline.
  // Rescheduled every time the deadline changes, which happens on every
  // renewal (this tab's or another tab's).
  useEffect(() => {
    if (!enabled) {
      setWarning(false);
      setSecondsRemaining(null);
      return;
    }

    const deadline = readDeadline();
    if (deadline === null) {
      setWarning(false);
      setSecondsRemaining(null);
      return;
    }

    const now = Date.now();
    const msRemaining = deadline - now;

    if (msRemaining <= WARNING_WINDOW_MS) {
      setWarning(true);
      setSecondsRemaining(Math.max(0, Math.ceil(msRemaining / 1000)));
    } else {
      setWarning(false);
    }

    const warnDelay = Math.max(0, msRemaining - WARNING_WINDOW_MS);
    const expireDelay = Math.max(0, msRemaining);

    const warnTimer = window.setTimeout(() => setWarning(true), warnDelay);
    const expireTimer = window.setTimeout(() => onExpireRef.current(), expireDelay);

    return () => {
      window.clearTimeout(warnTimer);
      window.clearTimeout(expireTimer);
    };
  }, [enabled, renewalTick]);

  // Purely-local countdown display while the warning is showing. Never
  // calls the API - only recomputes secondsRemaining from the deadline every
  // second for the visible number.
  useEffect(() => {
    if (!warning) return;

    const deadline = readDeadline();
    if (deadline === null) return;

    const tick = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };

    tick();
    const interval = window.setInterval(tick, COUNTDOWN_TICK_MS);
    return () => window.clearInterval(interval);
  }, [warning, renewalTick]);

  const extend = useCallback(async () => {
    try {
      await AuthService.ping();
    } catch (error) {
      // A failed extend must not throw out of a click handler. If the
      // renewal genuinely failed, the warning simply stays up.
      console.warn('Failed to extend the session', error);
    }
  }, []);

  return { warning, secondsRemaining, extend };
}

export default useSessionExpiry;
