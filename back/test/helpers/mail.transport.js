import { expect, vi } from 'vitest';
import { setMailTransport } from '../../src/services/mail.service.js';

/**
 * Installs a transport that records every message instead of sending it, and
 * returns the recording. `fail` makes every send reject, to exercise a relay
 * that is down.
 *
 * @param {{ fail?: boolean }} [options]
 */
export function installFakeTransport({ fail = false } = {}) {
  const sent = [];

  setMailTransport({
    sendMail: async message => {
      if (fail) {
        throw new Error('relay unavailable');
      }
      sent.push(message);
    },
  });

  return {
    sent,
    /** Resolves once `count` messages have been captured. The API sends in the background. */
    waitForMail: count => vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(count), { timeout: 5000 }),
  };
}

/** The reset token inside a captured message's text body. */
export function tokenFrom(message) {
  const match = /token=([a-f0-9]+)/.exec(message.text);

  if (!match) {
    throw new Error(`No reset token in message: ${message.text}`);
  }

  return match[1];
}
