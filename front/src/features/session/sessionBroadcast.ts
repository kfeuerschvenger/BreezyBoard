/**
 * Thin wrapper around BroadcastChannel so every open tab learns about a
 * session renewal immediately, instead of only through the slower/implicit
 * native `storage` event. Not every browser supports BroadcastChannel, so
 * every export feature-detects and falls back to a no-op when it is
 * unavailable.
 */

const CHANNEL_NAME = 'breezyboard-session';

type ActivityListener = (timestamp: number) => void;

const listeners = new Set<ActivityListener>();

let channel: BroadcastChannel | null = null;
let channelInitAttempted = false;

const getChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === 'undefined') return null;

  if (!channel && !channelInitAttempted) {
    channelInitAttempted = true;
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = event => {
      const timestamp = (event?.data as { timestamp?: unknown })?.timestamp;
      if (typeof timestamp === 'number') {
        listeners.forEach(listener => listener(timestamp));
      }
    };
  }

  return channel;
};

/** Tells every other open tab that the session was just renewed. */
export function postSessionActivity(timestamp: number): void {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ timestamp });
}

/** Subscribes to renewals posted by other tabs. Returns an unsubscribe function. */
export function subscribeSessionActivity(listener: ActivityListener): () => void {
  getChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
