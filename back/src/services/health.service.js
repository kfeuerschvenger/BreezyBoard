import mongoose from 'mongoose';

// Under the 3 second timeout of the Docker healthcheck that calls this, so a
// database that hangs is reported by the application rather than by the
// healthcheck giving up on a request that is still open.
const DEFAULT_PING_TIMEOUT_MS = 2000;

const CONNECTED = 1;

/**
 * Whether the database is usable right now: the driver says the connection is
 * up and a ping is answered within the timeout.
 *
 * The driver's own state is not enough. It lags a database that has gone
 * away, so a check that only reads it can report up for a while after the
 * database is down, and a request sent to a connection that is dead or hung
 * can wait instead of failing. The ping is the proof, and the timeout makes
 * sure a hung one is an answer too.
 *
 * Never throws: a health probe that throws turns "the database is down" into
 * a 500 from the error handler, with whatever message the driver wrote.
 *
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>}
 */
export const isDatabaseReachable = async ({ timeoutMs = DEFAULT_PING_TIMEOUT_MS } = {}) => {
  if (mongoose.connection.readyState !== CONNECTED) {
    return false;
  }

  let timer;

  try {
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('ping timed out')), timeoutMs);
    });

    await Promise.race([mongoose.connection.db.command({ ping: 1 }), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * How long an answer is reused. The route is public, so every request that
 * reached it would otherwise cost the database a ping. One second is far below
 * the 30 second interval of the Docker healthcheck, so a probe never sees a
 * stale answer, and it bounds the pings to one per second however many
 * requests arrive.
 */
const CACHE_TTL_MS = 1000;

/** The newest check: its promise, and when it settled (null while it runs). */
let latest = null;

/**
 * The same answer as isDatabaseReachable, at most one ping per second.
 *
 * Requests that arrive while a ping is running share it, and requests within
 * the window after it settles reuse its result. A failure is cached as well as
 * a success: a flood against a database that is down would otherwise start a
 * new ping, each held open until its timeout, for every request.
 *
 * @param {{ ttlMs?: number, now?: () => number }} [options]
 * @returns {Promise<boolean>}
 */
export const checkDatabaseHealth = ({ ttlMs = CACHE_TTL_MS, now = Date.now } = {}) => {
  if (latest && (latest.settledAt === null || now() - latest.settledAt < ttlMs)) {
    return latest.promise;
  }

  const check = { promise: null, settledAt: null };

  check.promise = isDatabaseReachable().then(reachable => {
    check.settledAt = now();
    return reachable;
  });
  latest = check;

  return check.promise;
};

/** Forgets the cached answer. For tests, which change the database state between requests. */
export const resetHealthCache = () => {
  latest = null;
};
