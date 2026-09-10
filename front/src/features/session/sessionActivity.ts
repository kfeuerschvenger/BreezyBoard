/**
 * Plain module (not a React hook) holding the single source of truth for
 * "when was the session last renewed". Deliberately outside React state: the
 * axios response interceptor runs outside any component, and writing state
 * there would trigger renders for something no one renders. A React hook
 * that needs to react to renewals binds to this external store via
 * useSyncExternalStore instead (see useSessionExpiry.ts).
 */
import { postSessionActivity, subscribeSessionActivity } from './sessionBroadcast';

let lastRenewalAt = Date.now();
const listeners = new Set<() => void>();

const notifyLocal = (): void => {
  listeners.forEach(listener => listener());
};

/**
 * Applies a renewal timestamp, whether it came from this tab's own traffic
 * (axios interceptor, a keep-alive ping) or from another tab via the
 * broadcast channel. `broadcast` controls whether this update is re-posted
 * to other tabs: a local renewal must be broadcast so other tabs learn
 * about it, but a renewal just received FROM the broadcast channel must
 * never be posted back out, or two open tabs would echo the same renewal
 * back and forth between each other forever.
 */
const applyRenewal = (timestamp: number, broadcast: boolean): void => {
  lastRenewalAt = timestamp;
  notifyLocal();
  if (broadcast) {
    postSessionActivity(timestamp);
  }
};

/** Called by the axios interceptor (or a keep-alive ping) when this tab sees a renewed token. */
export function markSessionRenewed(): void {
  applyRenewal(Date.now(), true);
}

export function millisSinceSessionRenewal(): number {
  return Date.now() - lastRenewalAt;
}

export function getLastRenewalAt(): number {
  return lastRenewalAt;
}

/** For useSyncExternalStore: add/remove a listener notified on every renewal. */
export function subscribeSessionRenewed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Wired once at module load: a renewal broadcast by another tab updates this
// tab's local state and notifies local subscribers, but is never re-posted
// (broadcast: false above), which is what keeps this a one-hop broadcast
// instead of an infinite tab-to-tab echo.
subscribeSessionActivity(timestamp => applyRenewal(timestamp, false));
