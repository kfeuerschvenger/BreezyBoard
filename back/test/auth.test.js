import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { registerUser } from './helpers/user.factory.js';

const basePayload = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  email: `jane.${Date.now()}.${Math.random()}@example.com`,
  password: 'Password123!',
});

describe('auth', () => {
  describe('POST /api/auth/register', () => {
    test('succeeds and returns a token', async () => {
      const payload = basePayload();

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.user.email).toBe(payload.email);
      expect(res.body.data.user.password).toBeUndefined();
    });

    test('rejects a duplicate email', async () => {
      const payload = basePayload();

      const first = await request(app).post('/api/auth/register').send(payload);
      expect(first.status).toBe(201);

      const second = await request(app).post('/api/auth/register').send(payload);

      expect(second.status).toBe(400);
      expect(second.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    test('returns a token with correct credentials', async () => {
      const payload = basePayload();
      await request(app).post('/api/auth/register').send(payload);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: payload.email, password: payload.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.user.email).toBe(payload.email);
    });

    test('fails with a wrong password', async () => {
      const payload = basePayload();
      await request(app).post('/api/auth/register').send(payload);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: payload.email, password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('fails with an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody-here@example.com', password: 'whatever123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/validate-token', () => {
    let token;

    beforeEach(async () => {
      const registered = await registerUser();
      token = registered.token;
    });

    test('accepts a valid token', async () => {
      const res = await request(app).get('/api/auth/validate-token').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
    });

    test('rejects a missing token', async () => {
      const res = await request(app).get('/api/auth/validate-token');

      expect(res.status).toBe(401);
    });

    test('rejects a malformed token', async () => {
      const res = await request(app).get('/api/auth/validate-token').set('Authorization', 'Bearer not-a-real-token');

      expect(res.status).toBe(401);
    });
  });
});
