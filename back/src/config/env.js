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
};

if (isProduction && env.CORS_ORIGINS.length === 0) {
  throw new Error('CORS_ORIGINS is required in production and was not set. Refusing to start.');
}

export default env;
