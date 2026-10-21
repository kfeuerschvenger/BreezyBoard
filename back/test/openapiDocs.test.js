import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import { mountApiDocs } from '../src/openapi/docs.js';

describe('Swagger UI is development only', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.doUnmock('../src/utils/logger.js');
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  test('mounts at /api/docs and serves a page that embeds the document, in development', async () => {
    const docsApp = express();

    expect(await mountApiDocs(docsApp, 'development')).toBe(true);

    const page = await request(docsApp).get('/api/docs/');
    const init = await request(docsApp).get('/api/docs/swagger-ui-init.js');

    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/html/);
    expect(init.status).toBe(200);
    expect(init.text).toContain('BreezyBoard API');
    expect(init.text).toContain('/auth/login');
  });

  // Helmet's default policy tells the browser to rewrite every http request of
  // the page to https. Safari applies it to http://localhost too, where there
  // is no TLS, so the page loads and its script never does.
  test('serves the docs page without upgrade-insecure-requests and keeps the rest of the policy', async () => {
    const docsApp = express();

    // The previous test reset the module registry, so the spec module compiles
    // the models again and mongoose refuses a model twice.
    mongoose.deleteModel(/.*/);
    docsApp.use(helmet());
    docsApp.get('/other', (_req, res) => res.send('other'));
    await mountApiDocs(docsApp, 'development');

    const docsPolicy = (await request(docsApp).get('/api/docs/')).headers['content-security-policy'];
    const scriptPolicy = (await request(docsApp).get('/api/docs/swagger-ui-init.js')).headers['content-security-policy'];
    const otherPolicy = (await request(docsApp).get('/other')).headers['content-security-policy'];

    for (const policy of [docsPolicy, scriptPolicy]) {
      expect(policy).not.toContain('upgrade-insecure-requests');
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("script-src 'self'");
      expect(policy).toContain("object-src 'none'");
    }

    expect(otherPolicy).toContain('upgrade-insecure-requests');
  });

  test.each(['production', 'test', '', undefined, 'staging', 'Development'])(
    'is not mounted when NODE_ENV is %j',
    async nodeEnv => {
      const docsApp = express();

      expect(await mountApiDocs(docsApp, nodeEnv)).toBe(false);
      expect((await request(docsApp).get('/api/docs/')).status).toBe(404);
      expect((await request(docsApp).get('/api/docs')).status).toBe(404);
    }
  );

  test('the application itself answers 404 at /api/docs under test', async () => {
    expect((await request(app).get('/api/docs/')).status).toBe(404);
  });

  // The application module is evaluated again, and mongoose, which lives
  // outside the module registry, refuses to compile a model twice.
  const loadFreshApp = async environment => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mongoose.deleteModel(/.*/);

    // Outside the test environment the logger writes every request to stdout.
    vi.doMock('../src/utils/logger.js', async () => {
      const actual = await vi.importActual('../src/utils/logger.js');

      return { ...actual, default: actual.createLogger({ level: 'silent' }) };
    });

    for (const [name, value] of Object.entries(environment)) {
      vi.stubEnv(name, value);
    }

    return (await import('../src/app.js')).default;
  };

  test('a freshly started application serves /api/docs in development', async () => {
    const development = await loadFreshApp({ NODE_ENV: 'development' });

    expect((await request(development).get('/api/docs/')).status).toBe(200);
    // The document it serves is the one the generator writes.
    expect((await request(development).get('/api/docs/swagger-ui-init.js')).text).toContain('operationId');
  });

  test('a freshly started development application drops the upgrade directive on the docs only', async () => {
    const development = await loadFreshApp({ NODE_ENV: 'development' });

    const docs = await request(development).get('/api/docs/');
    const health = await request(development).get('/api/v1/health');

    expect(docs.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(health.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });

  test('a freshly started application answers 404 at /api/docs in production, and says nothing about the route', async () => {
    const production = await loadFreshApp({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-production-secret-of-32-characters',
      CORS_ORIGINS: 'https://breezyboard.example',
      FRONTEND_URL: 'https://breezyboard.example',
      SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'BreezyBoard <no-reply@breezyboard.example>',
    });

    for (const path of ['/api/docs', '/api/docs/', '/api/docs/swagger-ui-init.js', '/api/v1/docs']) {
      const res = await request(production).get(path);

      expect(res.status, path).toBe(404);
      expect(res.text).not.toContain('BreezyBoard API');
    }
  });
});
