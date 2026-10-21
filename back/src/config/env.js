import dotenv from 'dotenv';
import { z } from 'zod';
import logger from '../utils/logger.js';

// Load environment variables before anything else
dotenv.config();

const ENVIRONMENTS = ['development', 'test', 'production'];

const ONE_MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The shortest JWT secret production accepts. Tokens are signed with HS256,
 * and RFC 7518 section 3.2 requires an HMAC key at least as long as the hash
 * output, 256 bits. Thirty-two characters of text are at least 32 bytes, so
 * the rule is the standard's floor and a generated secret (for example
 * `openssl rand -base64 48`) clears it with room to spare.
 */
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

const REQUIRED_IN_PRODUCTION = 'is required in production and was not set';

/** A variable that is set to nothing but spaces is not set. */
const read = name => {
  const value = process.env[name];

  return value === undefined || value.trim() === '' ? undefined : value;
};

/**
 * Turns a failed parse into one message that names every offending variable
 * and never carries a value. Only the message of each issue is used, and every
 * message is written here as a statement about the variable, so a secret that
 * was rejected cannot reach the log, a terminal or a container's status.
 */
const refuse = issues => {
  const lines = issues.map(issue => `- ${issue.path.length ? `${issue.path.join('.')} ` : ''}${issue.message}`);

  throw new Error(`Invalid environment configuration. Refusing to start:\n${lines.join('\n')}`);
};

/**
 * NODE_ENV decides which rules apply to every other variable, so it is
 * checked first and on its own. Only the three known values are accepted: a
 * typo such as `prod` would otherwise be treated as "not production" and let
 * a deployment run with the development fallbacks.
 */
const parseNodeEnv = () => {
  const result = z
    .enum(ENVIRONMENTS, { error: `must be one of ${ENVIRONMENTS.join(', ')}` })
    .safeParse((read('NODE_ENV') ?? 'development').trim());

  if (!result.success) {
    refuse([{ path: ['NODE_ENV'], message: result.error.issues[0].message }]);
  }

  return result.data;
};

/**
 * A whole-text setting that production must provide and development may
 * leave to a local value. Same rule as a secret: a deployment that silently
 * pointed its reset links at localhost or its mail at a catcher nobody reads
 * would look healthy and never deliver a working link.
 */
const buildSchema = isProduction => {
  const text = (devDefault, check = z.string()) =>
    z.preprocess(
      value => (value === undefined && !isProduction ? devDefault : value),
      z.string({ error: REQUIRED_IN_PRODUCTION }).trim().pipe(check)
    );

  const withDefault = (fallback, schema) => z.preprocess(value => value ?? fallback, schema);

  // A number that production refuses when it is wrong and development
  // replaces with its default and a warning. The windows and limits must be
  // settable to tiny values so tests can exercise expiry, so they are numbers
  // and not bounded ranges; what a typo costs in development is a log line,
  // and in production a refusal to start rather than a default nobody chose.
  const numeric = (name, fallback, { whole = false, allowZero = false } = {}) => {
    const kind = `${whole ? 'a whole number' : 'a number'}${allowZero ? ' of zero or more' : ' greater than zero'}`;

    return z.string().optional().transform((raw, ctx) => {
      if (raw === undefined) {
        return fallback;
      }

      const parsed = Number(raw);
      const valid = Number.isFinite(parsed) && (!whole || Number.isInteger(parsed)) && (allowZero ? parsed >= 0 : parsed > 0);

      if (valid) {
        return parsed;
      }

      if (isProduction) {
        ctx.addIssue({ code: 'custom', message: `must be ${kind}` });
        return z.NEVER;
      }

      logger.warn(`[env] ${name} is not ${kind}. Using the default of ${fallback}.`);
      return fallback;
    });
  };

  // A number with a fixed range, refused everywhere when it is outside it:
  // the value is a port or a hashing cost, where a wrong number is a mistake
  // and never a convenience.
  const ranged = (fallback, min, max) => {
    const message = `must be a whole number from ${min} to ${max}`;

    return withDefault(
      String(fallback),
      z
        .string({ error: message })
        .trim()
        .regex(/^\d+$/, message)
        .transform(Number)
        .refine(value => value >= min && value <= max, message)
    );
  };

  // Only the words true and false, in any case. `yes` or `1` is a mistake to
  // report, not a way to say false.
  const flag = withDefault(
    'false',
    z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.enum(['true', 'false'], { error: 'must be true or false' }))
      .transform(value => value === 'true')
  );

  // Comma separated origins. Each entry has to be an origin, scheme and host
  // with an optional port and nothing else: the browser's Origin header never
  // carries a path, so an entry with one could not match and would block every
  // request without saying why.
  const origins = z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const entries = (raw ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);

      if (entries.length === 0 && isProduction) {
        ctx.addIssue({ code: 'custom', message: REQUIRED_IN_PRODUCTION });
        return z.NEVER;
      }

      const parsed = [];

      for (const entry of entries) {
        let url;

        try {
          url = new URL(entry);
        } catch {
          url = null;
        }

        const isOrigin = url && (url.protocol === 'http:' || url.protocol === 'https:') && entry.replace(/\/$/, '') === url.origin;

        if (!isOrigin) {
          ctx.addIssue({
            code: 'custom',
            message: 'must list origins such as https://breezyboard.example, each with a scheme and without a path',
          });
          return z.NEVER;
        }

        parsed.push(url.origin);
      }

      return parsed;
    });

  // The origin of the frontend, used to build links that leave the system in
  // an email. It is configuration, never the request's Host header: that
  // header is chosen by whoever sends the request, so a link built from it
  // would let an attacker have a victim's reset token delivered to a host the
  // attacker controls. Only the origin is kept, so a trailing path or slash
  // cannot corrupt the link.
  const frontendUrl = text(
    'http://localhost:5173',
    z.string().transform((raw, ctx) => {
      let url;

      try {
        url = new URL(raw);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be an absolute URL such as https://breezyboard.example' });
        return z.NEVER;
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', message: 'must use http or https' });
        return z.NEVER;
      }

      return url.origin;
    })
  );

  // Secrets must never fall back to a literal in production. The development
  // value is published in this repository, so an environment that forgot to
  // set the secret would sign and verify tokens with a value anyone could
  // use to mint a token for any user.
  const jwtSecret = isProduction
    ? z
        .string({ error: REQUIRED_IN_PRODUCTION })
        .min(
          MIN_PRODUCTION_JWT_SECRET_LENGTH,
          `must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters long in production`
        )
    : z.string().default('insecure-development-secret');

  const mongoUri = text(
    'mongodb://localhost/boards-db',
    z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a MongoDB connection string starting with mongodb:// or mongodb+srv://')
  );

  return z
    .object({
      NODE_ENV: z.enum(ENVIRONMENTS),
      PORT: ranged(5000, 1, 65535),
      MONGODB_URI: mongoUri,
      JWT_SECRET: jwtSecret,
      SALT: ranged(10, 4, 31),

      // Comma separated list. Empty in development means "reflect any origin",
      // which is convenient locally; in production an empty list is a hard
      // error because the alternative is a wildcard for the whole internet.
      CORS_ORIGINS: origins,

      // How many reverse proxies sit between the internet and this process, and
      // therefore how many entries from the right of X-Forwarded-For are trusted
      // to be written by infrastructure rather than by the caller. Every rate
      // limiter is keyed on the address derived from it, so trusting more hops
      // than exist lets a client choose its own key. Production runs behind the
      // one nginx of the frontend image, so the default is 1; in development the
      // browser talks to the API directly, so it is 0, which ignores the header.
      // Zero is meaningful, so it is allowed.
      TRUST_PROXY_HOPS: numeric('TRUST_PROXY_HOPS', isProduction ? 1 : 0, { whole: true, allowZero: true }),

      // The sliding session's two independent clocks. JWT_INACTIVITY_TTL_MS is
      // the exp window, rewritten on every renewal. JWT_ABSOLUTE_TTL_MS is the
      // hard cap measured from sessionStartedAt, which is never rewritten.
      JWT_INACTIVITY_TTL_MS: numeric('JWT_INACTIVITY_TTL_MS', FIFTEEN_MINUTES_MS),
      JWT_ABSOLUTE_TTL_MS: numeric('JWT_ABSOLUTE_TTL_MS', FOUR_HOURS_MS),

      // Accounts a single client IP address may register in an hour. The default is the
      // production value, so a deployment that sets nothing is strict; only
      // docker-compose.yml raises it, for the standing scripts. See
      // rateLimit.middleware.js for why this one is tunable and the login
      // limiter beside it is not.
      REGISTRATION_LIMIT_PER_HOUR: numeric('REGISTRATION_LIMIT_PER_HOUR', 20, { whole: true }),

      // Where the frontend is served. The password reset email links to
      // `${FRONTEND_URL}/reset-password`.
      FRONTEND_URL: frontendUrl,

      // Outgoing mail over SMTP. In development the defaults point at a local
      // catcher (Mailpit, port 1025, no authentication) so nothing leaves the
      // machine. SMTP_USER and SMTP_PASSWORD are optional together: a relay
      // that authenticates needs both, a catcher needs neither.
      SMTP_HOST: text('localhost'),
      SMTP_PORT: numeric('SMTP_PORT', isProduction ? 587 : 1025, { whole: true }),
      SMTP_SECURE: flag,
      // Opt-out of the TLS requirement on the SMTP connection, for the local mail
      // catcher only. Never true by default, and refused in production below.
      SMTP_ALLOW_PLAINTEXT: flag,
      SMTP_USER: withDefault('', z.string().trim()),
      SMTP_PASSWORD: withDefault('', z.string()),
      MAIL_FROM: text('BreezyBoard <no-reply@breezyboard.local>'),

      // How long a password reset link works. Long enough for a message to
      // cross a slow mail relay and be read, short enough that a link left in a
      // mailbox, a forwarded message or a backup is worth nothing by the time
      // anyone finds it. Tunable so tests can exercise expiry without waiting.
      PASSWORD_RESET_TTL_MS: numeric('PASSWORD_RESET_TTL_MS', THIRTY_MINUTES_MS),
      // How many reset links may be outstanding for one account at once. Asking
      // for a new link keeps the earlier ones alive, so this bounds the list and
      // the number of live tokens an attacker could ever have to guess against.
      // Past it the oldest link is dropped.
      PASSWORD_RESET_MAX_OUTSTANDING: numeric('PASSWORD_RESET_MAX_OUTSTANDING', 5, { whole: true }),
      // The shortest gap between two reset emails to the same address. Requests
      // inside it get the usual answer and send nothing. The tests shorten it so
      // they can ask for several links in a row.
      PASSWORD_RESET_COOLDOWN_MS: numeric('PASSWORD_RESET_COOLDOWN_MS', ONE_MINUTE_MS),
      // Password recovery requests (asking for a link and using one) a single
      // client IP address may make in fifteen minutes. The default is the production
      // value, and only docker-compose.yml raises it. See rateLimit.middleware.js
      // for why it counts successful requests too.
      PASSWORD_RECOVERY_LIMIT_PER_15_MIN: numeric('PASSWORD_RECOVERY_LIMIT_PER_15_MIN', 10, { whole: true }),

      // How long a deleted board stays restorable before the purge job removes
      // it and its tasks for good, and how often that job looks. The interface
      // offers undo for a few seconds only, so the window exists for an owner
      // who reaches out afterwards or a mistake spotted over a weekend, and is
      // short because the board holds data its owner asked to be rid of.
      BOARD_RETENTION_MS: numeric('BOARD_RETENTION_MS', SEVEN_DAYS_MS),
      BOARD_PURGE_INTERVAL_MS: numeric('BOARD_PURGE_INTERVAL_MS', ONE_HOUR_MS),
    })
    .superRefine((config, ctx) => {
      // A relay that authenticates needs both, a catcher needs neither.
      if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD)) {
        ctx.addIssue({ code: 'custom', message: 'SMTP_USER and SMTP_PASSWORD must be set together or not at all' });
      }

      // The plain text opt-out is for the local mail catcher only.
      if (isProduction && config.SMTP_ALLOW_PLAINTEXT) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_ALLOW_PLAINTEXT'],
          message: 'is not allowed in production: mail must be sent over TLS',
        });
      }
    });
};

const nodeEnv = parseNodeEnv();
const isProduction = nodeEnv === 'production';

const result = buildSchema(isProduction).safeParse({
  NODE_ENV: nodeEnv,
  PORT: read('PORT'),
  MONGODB_URI: read('MONGODB_URI'),
  JWT_SECRET: read('JWT_SECRET'),
  SALT: read('SALT'),
  CORS_ORIGINS: read('CORS_ORIGINS'),
  TRUST_PROXY_HOPS: read('TRUST_PROXY_HOPS')?.trim(),
  JWT_INACTIVITY_TTL_MS: read('JWT_INACTIVITY_TTL_MS')?.trim(),
  JWT_ABSOLUTE_TTL_MS: read('JWT_ABSOLUTE_TTL_MS')?.trim(),
  REGISTRATION_LIMIT_PER_HOUR: read('REGISTRATION_LIMIT_PER_HOUR')?.trim(),
  FRONTEND_URL: read('FRONTEND_URL'),
  SMTP_HOST: read('SMTP_HOST'),
  SMTP_PORT: read('SMTP_PORT')?.trim(),
  SMTP_SECURE: read('SMTP_SECURE'),
  SMTP_ALLOW_PLAINTEXT: read('SMTP_ALLOW_PLAINTEXT'),
  SMTP_USER: read('SMTP_USER'),
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  MAIL_FROM: read('MAIL_FROM'),
  PASSWORD_RESET_TTL_MS: read('PASSWORD_RESET_TTL_MS')?.trim(),
  PASSWORD_RESET_MAX_OUTSTANDING: read('PASSWORD_RESET_MAX_OUTSTANDING')?.trim(),
  PASSWORD_RESET_COOLDOWN_MS: read('PASSWORD_RESET_COOLDOWN_MS')?.trim(),
  PASSWORD_RECOVERY_LIMIT_PER_15_MIN: read('PASSWORD_RECOVERY_LIMIT_PER_15_MIN')?.trim(),
  BOARD_RETENTION_MS: read('BOARD_RETENTION_MS')?.trim(),
  BOARD_PURGE_INTERVAL_MS: read('BOARD_PURGE_INTERVAL_MS')?.trim(),
});

if (!result.success) {
  refuse(result.error.issues);
}

if (!isProduction && read('JWT_SECRET') === undefined) {
  logger.warn('[env] JWT_SECRET is not set. Using an insecure development value. Never do this outside development.');
}

const env = {
  ...result.data,

  // The signing and verification algorithm is pinned rather than inferred from
  // the token header, so a token claiming a different algorithm is rejected.
  JWT_ALGORITHM: 'HS256',
};

export default env;
