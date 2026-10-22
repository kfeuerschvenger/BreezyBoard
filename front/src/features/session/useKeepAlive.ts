import { useEffect } from 'react';
import { AuthService } from '../../services/auth.service';
import { millisSinceSessionRenewal } from './sessionActivity';

const PING_THROTTLE_MS = 60_000;
const RENEWAL_THROTTLE_MS = 60_000;

// Module-scope, not exported: the last time THIS hook fired a ping. Set
// optimistically the moment a ping is decided on, before the request even
// resolves, so a burst of qualifying events cannot stack concurrent pings.
let lastPingAt = 0;

/**
 * Pings the server to keep the sliding session alive while the user is
 * active, without ever polling on a timer. A ping fires only from inside a
 * real event listener callback (keydown, pointerdown, scroll, tab becoming
 * visible) and only when both throttles are satisfied: at least 60s since
 * this hook's last ping, and at least 60s since the last real renewal from
 * any source. mousemove is deliberately not listened for - it fires far too
 * often to be a meaningful activity signal.
 */
export function useKeepAlive(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const maybePing = () => {
      const now = Date.now();
      if (now - lastPingAt < PING_THROTTLE_MS) return;
      if (millisSinceSessionRenewal() < RENEWAL_THROTTLE_MS) return;

      lastPingAt = now;
      AuthService.ping().catch(error => {
        // Best-effort: a failed ping must never throw unhandled. If the
        // token is genuinely dead, ordinary 401 handling takes over on the
        // user's next real request.
        console.warn('Keep-alive ping failed', error);
      });
    };

    const handleEvent = (event: Event) => {
      if (event.type === 'visibilitychange' && document.visibilityState !== 'visible') {
        // A tab going hidden is not activity; a tab becoming visible again is.
        return;
      }
      maybePing();
    };

    window.addEventListener('keydown', handleEvent);
    window.addEventListener('pointerdown', handleEvent);
    window.addEventListener('scroll', handleEvent, { capture: true, passive: true });
    document.addEventListener('visibilitychange', handleEvent);

    return () => {
      window.removeEventListener('keydown', handleEvent);
      window.removeEventListener('pointerdown', handleEvent);
      window.removeEventListener('scroll', handleEvent, { capture: true });
      document.removeEventListener('visibilitychange', handleEvent);
    };
  }, [enabled]);
}

export default useKeepAlive;
