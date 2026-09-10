import dotenv from 'dotenv';

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

  console.warn(`[env] ${name} is not set. Using an insecure development value. Never do this outside development.`);
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
    console.warn(`[env] ${name} is not a valid positive number. Using the default of ${fallbackMs}ms.`);
    return fallbackMs;
  }

  return parsed;
};

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

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
};

if (isProduction && env.CORS_ORIGINS.length === 0) {
  throw new Error('CORS_ORIGINS is required in production and was not set. Refusing to start.');
}

export default env;
