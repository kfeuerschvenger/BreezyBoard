import express from 'express';
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

  test('a freshly started application answers 404 at /api/docs in production, and says nothing about the route', async () => {
    const production = await loadFreshApp({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-production-secret',
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
