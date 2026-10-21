import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import { rateLimitTesting } from '../src/middleware/rateLimit.middleware.js';
import { checkDatabaseHealth, isDatabaseReachable, resetHealthCache } from '../src/services/health.service.js';

// Each case changes what the database answers, and an answer is cached for a
// second, so a case must not inherit the previous one's.
afterEach(() => {
  vi.restoreAllMocks();
  resetHealthCache();
  rateLimitTesting.enabled = false;
});

const UNAVAILABLE = { status: 'unavailable', message: 'Service unavailable' };

describe('GET /api/v1/health', () => {
  test('answers 200 ok while the database is connected and answers a ping', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', message: 'Server is running' });
  });

  test('answers on the unversioned path the Docker healthcheck calls, in both states', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);

    resetHealthCache();
    vi.spyOn(mongoose.connection.db, 'command').mockRejectedValue(new Error('connection refused'));

    expect((await request(app).get('/api/health')).status).toBe(503);
  });

  test('actually pings the database', async () => {
    const command = vi.spyOn(mongoose.connection.db, 'command');

    await request(app).get('/api/v1/health');

    expect(command).toHaveBeenCalledWith({ ping: 1 });
  });

  test('answers 503 when the connection is not up, without asking the database anything', async () => {
    const state = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
    const command = vi.spyOn(mongoose.connection.db, 'command');

    try {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(503);
      expect(res.body).toEqual(UNAVAILABLE);
      expect(command).not.toHaveBeenCalled();
    } finally {
      // A spy on an accessor is not undone by restoreAllMocks, and a
      // connection left reading as down would fail every test after this one.
      state.mockRestore();
    }
  });

  test('answers 503 when the connection says it is up and the ping fails', async () => {
    vi.spyOn(mongoose.connection.db, 'command').mockRejectedValue(new Error('MongoNetworkError: mongo:27017 ECONNREFUSED'));

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual(UNAVAILABLE);
  });

  test('names no internal in the 503: not the error, the host, the driver or the database', async () => {
    vi.spyOn(mongoose.connection.db, 'command').mockRejectedValue(new Error('MongoNetworkError: mongo:27017 ECONNREFUSED'));

    const res = await request(app).get('/api/v1/health');

    expect(res.text).not.toMatch(/mongo|econnrefused|27017|error/i);
    expect(Object.keys(res.body).sort()).toEqual(['message', 'status']);
  });
});

describe('isDatabaseReachable', () => {
  test('is false when the ping never answers, once the timeout has passed', async () => {
    vi.spyOn(mongoose.connection.db, 'command').mockReturnValue(new Promise(() => {}));

    const started = Date.now();
    const reachable = await isDatabaseReachable({ timeoutMs: 50 });

    expect(reachable).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('is true for a ping that answers inside the timeout', async () => {
    expect(await isDatabaseReachable({ timeoutMs: 1000 })).toBe(true);
  });
});

describe('checkDatabaseHealth', () => {
  const pings = () => vi.spyOn(mongoose.connection.db, 'command');

  test('shares one ping between requests that arrive while it is running', async () => {
    let finish;
    const command = pings().mockReturnValue(new Promise(resolve => (finish = resolve)));

    const answers = Array.from({ length: 20 }, () => checkDatabaseHealth());

    finish({ ok: 1 });

    expect(await Promise.all(answers)).toEqual(Array(20).fill(true));
    expect(command).toHaveBeenCalledTimes(1);
  });

  test('answers from the cache inside the window and pings again once it has passed', async () => {
    let clock = 10_000;
    const now = () => clock;
    const command = pings();

    expect(await checkDatabaseHealth({ now })).toBe(true);
    clock += 999;
    expect(await checkDatabaseHealth({ now })).toBe(true);
    expect(command).toHaveBeenCalledTimes(1);

    clock += 1;
    expect(await checkDatabaseHealth({ now })).toBe(true);
    expect(command).toHaveBeenCalledTimes(2);
  });

  test('caches a failure too, so a flood against a dead database starts one ping', async () => {
    const command = pings().mockRejectedValue(new Error('connection refused'));

    const answers = await Promise.all(Array.from({ length: 10 }, () => checkDatabaseHealth()));
    const later = await checkDatabaseHealth();

    expect(answers).toEqual(Array(10).fill(false));
    expect(later).toBe(false);
    expect(command).toHaveBeenCalledTimes(1);
  });

  test('sees the database come back once the window has passed', async () => {
    let clock = 0;
    const now = () => clock;
    const command = pings().mockRejectedValueOnce(new Error('connection refused'));

    expect(await checkDatabaseHealth({ now })).toBe(false);
    clock += 1000;
    expect(await checkDatabaseHealth({ now })).toBe(true);
    expect(command).toHaveBeenCalledTimes(2);
  });
});

describe('the health route under load', () => {
  test('sends one ping for a burst of concurrent requests', async () => {
    const command = vi.spyOn(mongoose.connection.db, 'command');

    const responses = await Promise.all(Array.from({ length: 15 }, () => request(app).get('/api/v1/health')));

    expect(responses.map(res => res.status)).toEqual(Array(15).fill(200));
    expect(command).toHaveBeenCalledTimes(1);
  });

  test('answers 429 with the shared error body once a client is past the limit', async () => {
    rateLimitTesting.enabled = true;

    // The limiter keeps its count between cases, so the budget is spent here
    // and no case after this one is run with it enabled.
    let limited;

    for (let sent = 0; sent < 200 && !limited; sent += 1) {
      const res = await request(app).get('/api/v1/health');

      if (res.status === 429) {
        limited = { res, sent };
      }
    }

    expect(limited, 'the limiter never answered 429').toBeDefined();
    expect(limited.sent).toBe(120);
    expect(limited.res.body).toEqual({
      success: false,
      message: 'Too many attempts. Please wait before trying again.',
      code: 'RATE_LIMITED',
    });
  });

  test('is not limited under test unless a case turns the limiter on', async () => {
    for (let sent = 0; sent < 130; sent += 1) {
      expect((await request(app).get('/api/v1/health')).status).toBe(200);
    }
  });
});
