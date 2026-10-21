import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import { isDatabaseReachable } from '../src/services/health.service.js';

afterEach(() => {
  vi.restoreAllMocks();
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
