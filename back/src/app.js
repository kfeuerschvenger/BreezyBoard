import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import env from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import httpLogger from './middleware/logging.middleware.js';
import logger from './utils/logger.js';
import { isDatabaseReachable } from './services/health.service.js';
import { mountApiDocs } from './openapi/docs.js';
import { apiRouters } from './routes/index.js';

const app = express();

// A hop count, never `true`: `true` takes the leftmost X-Forwarded-For entry,
// which is whatever the caller wrote, and every rate limiter keys on req.ip.
// A number trusts only the proxies that really exist and reads the address
// from the right of the header, where each proxy appends what it observed.
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Structured request logging, mounted first so every request gets an id and
// a bound child logger (req.log) before anything else runs, including
// requests helmet or cors ends up rejecting.
app.use(httpLogger);

// Middlewares
app.use(helmet());

// An unconfigured cors() allows every origin on the internet. The allowlist
// comes from CORS_ORIGINS and is required in production; an empty list in
// development reflects the request origin so a local frontend on any port
// still works. X-Auth-Token is exposed because the sliding session renewal
// travels in that response header, and a browser hides unexposed headers
// from JavaScript entirely.
app.use(
  cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    credentials: true,
    exposedHeaders: ['X-Auth-Token', 'X-Request-Id'],
  })
);

// Bounded so a single request cannot exhaust memory with an oversized body.
app.use(express.json({ limit: '1mb' }));

// Swagger UI over the OpenAPI document, in development only. Mounted before
// the API routes so the deprecated unversioned alias below never sees it.
await mountApiDocs(app);

// API versioning without a flag day: /api/v1 and /api mount the exact same
// routers, so a deploy can switch clients over to /api/v1 (see
// front/src/services/api.service.ts and e2e/tests/fixtures.ts) without
// breaking anything still calling the unversioned path mid rollout,
// including the Dockerfile healthcheck, which hits /api/health. The
// unversioned path stays a deprecated alias: using it logs a warning once
// per process, not once per request, so the alias does not flood the logs.
let warnedAboutUnversionedApi = false;

app.use((req, _res, next) => {
  if (!warnedAboutUnversionedApi && req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/')) {
    warnedAboutUnversionedApi = true;
    logger.warn(
      { path: req.originalUrl },
      'Deprecated unversioned /api path used; clients should migrate to /api/v1.'
    );
  }
  next();
});

const mountApiRoutes = prefix => {
  for (const [mountPath, router] of Object.entries(apiRouters)) {
    app.use(`${prefix}${mountPath}`, router);
  }

  // Healthy means the API can serve a request, and every route needs the
  // database, so a dead connection is a 503. The body is the same for every
  // way it can fail and names nothing about the deployment: this route is
  // public.
  app.get(`${prefix}/health`, async (req, res) => {
    if (await isDatabaseReachable()) {
      res.json({ status: 'ok', message: 'Server is running' });
      return;
    }

    req.log?.warn('Health check failed: the database is not reachable');
    res.status(503).json({ status: 'unavailable', message: 'Service unavailable' });
  });
};

mountApiRoutes('/api/v1');
mountApiRoutes('/api');

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Error handling
app.use(errorHandler);

export default app;
