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

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
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

  // The sliding session's two independent clocks. JWT_INACTIVITY_TTL_MS is
  // the exp window, rewritten on every renewal. JWT_ABSOLUTE_TTL_MS is the
  // hard cap measured from sessionStartedAt, which is never rewritten.
  JWT_INACTIVITY_TTL_MS: parseDurationMs('JWT_INACTIVITY_TTL_MS', process.env.JWT_INACTIVITY_TTL_MS, FIFTEEN_MINUTES_MS),
  JWT_ABSOLUTE_TTL_MS: parseDurationMs('JWT_ABSOLUTE_TTL_MS', process.env.JWT_ABSOLUTE_TTL_MS, FOUR_HOURS_MS),

  // Accounts a single address may register in an hour. The default is the
  // production value, so a deployment that sets nothing is strict; only
  // docker-compose.yml raises it, for the standing scripts. See
  // rateLimit.middleware.js for why this one is tunable and the login
  // limiter beside it is not.
  REGISTRATION_LIMIT_PER_HOUR: parseCount('REGISTRATION_LIMIT_PER_HOUR', process.env.REGISTRATION_LIMIT_PER_HOUR, 20),

  // How long a deleted board stays restorable before the purge job removes
  // it and its tasks for good, and how often that job looks. The interface
  // offers undo for a few seconds only, so the window exists for an owner
  // who reaches out afterwards or a mistake spotted over a weekend, and is
  // short because the board holds data its owner asked to be rid of.
  BOARD_RETENTION_MS: parseDurationMs('BOARD_RETENTION_MS', process.env.BOARD_RETENTION_MS, SEVEN_DAYS_MS),
  BOARD_PURGE_INTERVAL_MS: parseDurationMs('BOARD_PURGE_INTERVAL_MS', process.env.BOARD_PURGE_INTERVAL_MS, ONE_HOUR_MS),
};

if (isProduction && env.CORS_ORIGINS.length === 0) {
  throw new Error('CORS_ORIGINS is required in production and was not set. Refusing to start.');
}

export default env;
