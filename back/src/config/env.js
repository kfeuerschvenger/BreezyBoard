import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables before anything else
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Secrets must never fall back to a literal. JWT_SECRET used to default to the
 * string 'secret-key', so an environment that simply forgot to set it signed
 * and verified tokens with a value published in this repository, and anyone
 * could mint a token for any user. Outside development the process refuses to
 * start instead.
 */
const requireSecret = (name, developmentFallback) => {
  const value = process.env[name];

  if (value && value.trim() !== '') {
    return value;
  }

  if (isProduction) {
    throw new Error(`${name} is required in production and was not set. Refusing to start.`);
  }

  logger.warn(`[env] ${name} is not set. Using an insecure development value. Never do this outside development.`);
  return developmentFallback;
};

const parseOrigins = raw =>
  (raw ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

// Both windows of the sliding session must be settable to tiny values so
// tests can exercise expiry without waiting minutes or hours, so a plain
// Number(...) with a warning replaces a bad value rather than throwing.
const parseDurationMs = (name, raw, fallbackMs) => {
  if (raw === undefined || raw.trim() === '') {
    return fallbackMs;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`[env] ${name} is not a valid positive number. Using the default of ${fallbackMs}ms.`);
    return fallbackMs;
  }

  return parsed;
};

// A whole positive count, with a warning and the default rather than a throw
// when it is nonsense, matching how the duration windows above behave.
const parseCount = (name, raw, fallback) => {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    logger.warn(`[env] ${name} is not a positive whole number. Using the default of ${fallback}.`);
    return fallback;
  }

  return parsed;
};

// A whole number of zero or more. Zero is meaningful for a proxy hop count,
// where it means no proxy is trusted, so parseCount's positive rule does not fit.
const parseHopCount = (name, raw, fallback) => {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0) {
    logger.warn(`[env] ${name} is not a whole number of zero or more. Using the default of ${fallback}.`);
    return fallback;
  }

  return parsed;
};

/**
 * Settings that have a sensible local value but no safe default anywhere
 * else. Same rule as a secret: production refuses to start without them,
 * because a deployment that silently pointed its reset links at localhost
 * or its mail at a catcher nobody reads would look healthy and never
 * deliver a working link.
 */
const requireInProduction = (name, developmentFallback) => {
  const value = process.env[name];

  if (value && value.trim() !== '') {
    return value.trim();
  }

  if (isProduction) {
    throw new Error(`${name} is required in production and was not set. Refusing to start.`);
  }

  return developmentFallback;
};

/**
 * The origin of the frontend, used to build links that leave the system in
 * an email. It is configuration, never the request's Host header: that
 * header is chosen by whoever sends the request, so a link built from it
 * would let an attacker have a victim's reset token delivered to a host the
 * attacker controls.
 */
const parseFrontendUrl = raw => {
  let url;

  try {
    url = new URL(raw);
  } catch {
    throw new Error('FRONTEND_URL must be an absolute URL such as https://breezyboard.example. Refusing to start.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use http or https. Refusing to start.');
  }

  return url.origin;
};

const ONE_MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const env = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost/boards-db',
  JWT_SECRET: requireSecret('JWT_SECRET', 'insecure-development-secret'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SALT: Number(process.env.SALT) || 10,

  // The signing and verification algorithm is pinned rather than inferred from
  // the token header, so a token claiming a different algorithm is rejected.
  JWT_ALGORITHM: 'HS256',

  // Comma separated list. Empty in development means "reflect any origin",
  // which is convenient locally; in production an empty list is a hard error
  // because the previous behavior was a wildcard for the whole internet.
  CORS_ORIGINS: parseOrigins(process.env.CORS_ORIGINS),

  // How many reverse proxies sit between the internet and this process, and
  // therefore how many entries from the right of X-Forwarded-For are trusted
  // to be written by infrastructure rather than by the caller. Every rate
  // limiter is keyed on the address derived from it, so trusting more hops
  // than exist lets a client choose its own key. Production runs behind the
  // one nginx of the frontend image, so the default is 1; in development the
  // browser talks to the API directly, so it is 0, which ignores the header.
  TRUST_PROXY_HOPS: parseHopCount('TRUST_PROXY_HOPS', process.env.TRUST_PROXY_HOPS, isProduction ? 1 : 0),

  // The sliding session's two independent clocks. JWT_INACTIVITY_TTL_MS is
  // the exp window, rewritten on every renewal. JWT_ABSOLUTE_TTL_MS is the
  // hard cap measured from sessionStartedAt, which is never rewritten.
  JWT_INACTIVITY_TTL_MS: parseDurationMs('JWT_INACTIVITY_TTL_MS', process.env.JWT_INACTIVITY_TTL_MS, FIFTEEN_MINUTES_MS),
  JWT_ABSOLUTE_TTL_MS: parseDurationMs('JWT_ABSOLUTE_TTL_MS', process.env.JWT_ABSOLUTE_TTL_MS, FOUR_HOURS_MS),

  // Accounts a single client IP address may register in an hour. The default is the
  // production value, so a deployment that sets nothing is strict; only
  // docker-compose.yml raises it, for the standing scripts. See
  // rateLimit.middleware.js for why this one is tunable and the login
  // limiter beside it is not.
  REGISTRATION_LIMIT_PER_HOUR: parseCount('REGISTRATION_LIMIT_PER_HOUR', process.env.REGISTRATION_LIMIT_PER_HOUR, 20),

  // Where the frontend is served. The password reset email links to
  // `${FRONTEND_URL}/reset-password`. Only the origin is kept, so a trailing
  // path or slash in the setting cannot corrupt the link.
  FRONTEND_URL: parseFrontendUrl(requireInProduction('FRONTEND_URL', 'http://localhost:5173')),

  // Outgoing mail over SMTP. In development the defaults point at a local
  // catcher (Mailpit, port 1025, no authentication) so nothing leaves the
  // machine. SMTP_USER and SMTP_PASSWORD are optional together: a relay
  // that authenticates needs both, a catcher needs neither.
  SMTP_HOST: requireInProduction('SMTP_HOST', 'localhost'),
  SMTP_PORT: parseCount('SMTP_PORT', process.env.SMTP_PORT, isProduction ? 587 : 1025),
  SMTP_SECURE: (process.env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true',
  SMTP_USER: (process.env.SMTP_USER ?? '').trim(),
  SMTP_PASSWORD: process.env.SMTP_PASSWORD ?? '',
  MAIL_FROM: requireInProduction('MAIL_FROM', 'BreezyBoard <no-reply@breezyboard.local>'),

  // How long a password reset link works. Long enough for a message to
  // cross a slow mail relay and be read, short enough that a link left in a
  // mailbox, a forwarded message or a backup is worth nothing by the time
  // anyone finds it. Tunable so tests can exercise expiry without waiting.
  PASSWORD_RESET_TTL_MS: parseDurationMs('PASSWORD_RESET_TTL_MS', process.env.PASSWORD_RESET_TTL_MS, THIRTY_MINUTES_MS),

  // The shortest gap between two reset emails to the same address. Requests
  // inside it get the usual answer and send nothing. The tests shorten it so
  // they can ask for several links in a row.
  PASSWORD_RESET_COOLDOWN_MS: parseDurationMs(
    'PASSWORD_RESET_COOLDOWN_MS',
    process.env.PASSWORD_RESET_COOLDOWN_MS,
    ONE_MINUTE_MS
  ),

  // Password recovery requests (asking for a link and using one) a single
  // client IP address may make in fifteen minutes. The default is the production
  // value, and only docker-compose.yml raises it. See
  // rateLimit.middleware.js for why it counts successful requests too.
  PASSWORD_RECOVERY_LIMIT_PER_15_MIN: parseCount(
    'PASSWORD_RECOVERY_LIMIT_PER_15_MIN',
    process.env.PASSWORD_RECOVERY_LIMIT_PER_15_MIN,
    10
  ),

  // How long a deleted board stays restorable before the purge job removes
  // it and its tasks for good, and how often that job looks. The interface
  // offers undo for a few seconds only, so the window exists for an owner
  // who reaches out afterwards or a mistake spotted over a weekend, and is
  // short because the board holds data its owner asked to be rid of.
  BOARD_RETENTION_MS: parseDurationMs('BOARD_RETENTION_MS', process.env.BOARD_RETENTION_MS, SEVEN_DAYS_MS),
  BOARD_PURGE_INTERVAL_MS: parseDurationMs('BOARD_PURGE_INTERVAL_MS', process.env.BOARD_PURGE_INTERVAL_MS, ONE_HOUR_MS),
};

if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
  throw new Error('SMTP_USER and SMTP_PASSWORD must be set together or not at all. Refusing to start.');
}

if (isProduction && env.CORS_ORIGINS.length === 0) {
  throw new Error('CORS_ORIGINS is required in production and was not set. Refusing to start.');
}

export default env;
