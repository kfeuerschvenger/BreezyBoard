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
const level = nodeEnv === 'test' ? 'silent' : nodeEnv === 'production' ? 'info' : 'debug';

const logger = pino({
  level,
  serializers: {
    err: pino.stdSerializers.err,
  },
});

export default logger;
