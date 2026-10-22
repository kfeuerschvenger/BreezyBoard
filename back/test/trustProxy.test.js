import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import { rateLimitTesting } from '../src/middleware/rateLimit.middleware.js';

// The test setup runs the application with one trusted hop, the production
// topology: a single nginx between the internet and the API.
beforeEach(() => {
  rateLimitTesting.enabled = true;
});

afterEach(() => {
  rateLimitTesting.enabled = false;
  vi.unstubAllEnvs();
  vi.resetModules();
});

// A body the login schema rejects, so the request is refused before any
// database work and still counts as a failure for the login limiter.
const failedLogin = forwardedFor =>
  request(app).post('/api/v1/auth/login').set('X-Forwarded-For', forwardedFor).send({});

describe('rate limiter keys behind a reverse proxy', () => {
  test('the application trusts exactly the configured number of hops', async () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  test('a client rotating the leftmost X-Forwarded-For entry is still counted as one address', async () => {
    // The proxy appends the address it observed, so the entry on the right
    // is the only one infrastructure wrote; everything left of it is the
    // caller's own claim.
    const statuses = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await failedLogin(`198.51.100.${attempt + 1}, 203.0.113.9`);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10).every(status => status === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  test('two clients the proxy saw as different addresses keep separate budgets', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await failedLogin('203.0.113.9');
    }

    const exhausted = await failedLogin('203.0.113.9');
    const other = await failedLogin('203.0.113.10');

    expect(exhausted.status).toBe(429);
    expect(other.status).toBe(400);
  });
});

// env.js reads process.env once, when it is first evaluated, so each case
// stubs the environment and imports a fresh copy.
const loadEnv = async overrides => {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const [name, value] of Object.entries(overrides)) {
    vi.stubEnv(name, value);
  }

  return (await import('../src/config/env.js')).default;
};

describe('TRUST_PROXY_HOPS', () => {
  test('defaults to zero outside production, where the browser reaches the API directly', async () => {
    const env = await loadEnv({ TRUST_PROXY_HOPS: '' });

    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  test('defaults to one in production, where the frontend nginx is the only proxy', async () => {
    const env = await loadEnv({
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS: '',
      JWT_SECRET: 'a-production-secret-of-32-characters',
      CORS_ORIGINS: 'https://breezyboard.example',
      FRONTEND_URL: 'https://breezyboard.example',
      SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'BreezyBoard <no-reply@breezyboard.example>',
    });

    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  test('accepts an explicit count, zero included', async () => {
    expect((await loadEnv({ TRUST_PROXY_HOPS: '2' })).TRUST_PROXY_HOPS).toBe(2);
    expect((await loadEnv({ TRUST_PROXY_HOPS: '0' })).TRUST_PROXY_HOPS).toBe(0);
  });

  test.each(['-1', '1.5', 'many'])('falls back to the default for %s', async value => {
    const env = await loadEnv({ TRUST_PROXY_HOPS: value });

    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });
});
