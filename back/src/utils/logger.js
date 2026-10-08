import pino from 'pino';

// Read directly from process.env rather than importing config/env.js: env.js
// itself logs a couple of startup warnings, and importing it here would
// create a circular dependency between the two modules for no real benefit,
// since only NODE_ENV is needed to choose a level.
const nodeEnv = process.env.NODE_ENV || 'development';

// Silent under test. Pino writes straight to stdout, bypassing the
// per-test console buffering Vitest already applies to console.*, so an
// unfiltered level here would flood every test run whether it passes or
// not, and the suite is noisy enough already.
const defaultLevel = nodeEnv === 'test' ? 'silent' : nodeEnv === 'production' ? 'info' : 'debug';

// Credentials that travel in headers, on the request or the response. The
// request logger serialises both header sets in full, and a log is read by
// more people and kept longer than a session: a bearer token written to it
// is a session anyone with log access can replay until it expires. The
// renewed session token leaves in the X-Auth-Token response header, so it is
// as sensitive as the Authorization header that carried the old one.
export const REDACTED_HEADERS = ['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-auth-token'];

export const redactPaths = REDACTED_HEADERS.flatMap(header => [
  `req.headers["${header}"]`,
  `res.headers["${header}"]`,
]);

/**
 * Builds the application's logger. The default instance below is made by the
 * same function, so a test that passes its own destination exercises exactly
 * the redaction production runs with.
 *
 * @param {{ level?: string, destination?: import('pino').DestinationStream }} [options]
 */
export const createLogger = ({ level = defaultLevel, destination } = {}) =>
  pino(
    {
      level,
      serializers: {
        err: pino.stdSerializers.err,
      },
      redact: { paths: redactPaths, censor: '[Redacted]' },
    },
    destination
  );

const logger = createLogger();

export default logger;
