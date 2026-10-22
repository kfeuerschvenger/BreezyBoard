import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { rateLimitTesting } from '../src/middleware/rateLimit.middleware.js';
import { registerUser } from './helpers/user.factory.js';

const PASSWORD = 'Password123!';

const change = (token, body) =>
  request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${token}`).send(body);

describe('a password change with the wrong current password', () => {
  test('is a 400 with its own code, never a 401 that a client reads as an ended session', async () => {
    const { token } = await registerUser({ password: PASSWORD });

    const res = await change(token, { currentPassword: 'NotThePassword1!', newPassword: 'NewPassword456!' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WRONG_CURRENT_PASSWORD');
  });

  test('changes nothing: the session and the old password both still work', async () => {
    const { token, user } = await registerUser({ password: PASSWORD });

    await change(token, { currentPassword: 'NotThePassword1!', newPassword: 'NewPassword456!' });

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
  });
});

describe('the rate limit on a password change', () => {
  const LIMIT = 10;
  const wrong = { currentPassword: 'NotThePassword1!', newPassword: 'NewPassword456!' };

  beforeEach(() => {
    rateLimitTesting.enabled = true;
  });

  afterEach(() => {
    rateLimitTesting.enabled = false;
  });

  test('answers 429 with the shared body once a person has spent the failures', async () => {
    const { token } = await registerUser({ password: PASSWORD });

    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      const refused = await change(token, wrong);
      expect(refused.body.code).toBe('WRONG_CURRENT_PASSWORD');
    }

    const limited = await change(token, wrong);

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  test('refuses even the right current password once the budget is spent', async () => {
    const { token } = await registerUser({ password: PASSWORD });

    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await change(token, wrong);
    }

    const res = await change(token, { currentPassword: PASSWORD, newPassword: 'NewPassword456!' });

    expect(res.status).toBe(429);
  });

  test('counts failures only: a change that succeeds spends none of the budget', async () => {
    const { token, user } = await registerUser({ password: PASSWORD });

    for (let attempt = 0; attempt < LIMIT - 1; attempt += 1) {
      await change(token, wrong);
    }

    const ok = await change(token, { currentPassword: PASSWORD, newPassword: 'NewPassword456!' });
    expect(ok.status).toBe(200);

    // The change revoked the token, so the same person signs in again. The
    // budget belongs to the person, not to the token.
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'NewPassword456!' });
    const fresh = login.body.data.token;

    const lastAllowed = await change(fresh, { currentPassword: 'StillNotIt1!', newPassword: 'Another789!x' });
    expect(lastAllowed.status).toBe(400);

    const limited = await change(fresh, { currentPassword: 'StillNotIt1!', newPassword: 'Another789!x' });
    expect(limited.status).toBe(429);
  });

  test('is a budget per person: one account spending it does not block another on the same address', async () => {
    const attacked = await registerUser({ password: PASSWORD });
    const bystander = await registerUser({ password: PASSWORD });

    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      await change(attacked.token, wrong);
    }

    const res = await change(bystander.token, wrong);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WRONG_CURRENT_PASSWORD');
  });

  test('does not share the login budget: failed sign ins do not block a password change', async () => {
    const { token, user } = await registerUser({ password: PASSWORD });

    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'NotThePassword1!' });
    }

    const res = await change(token, wrong);

    expect(res.status).toBe(400);
  });

  test('does not count a request the schema refuses', async () => {
    const { token } = await registerUser({ password: PASSWORD });

    for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
      const refused = await change(token, { currentPassword: PASSWORD, newPassword: 'x' });
      expect(refused.status).toBe(400);
    }

    const res = await change(token, wrong);

    expect(res.body.code).toBe('WRONG_CURRENT_PASSWORD');
  });
});

describe('a password change with the right current password', () => {
  test('answers 200, accepts the new password and retires the old one', async () => {
    const { token, user } = await registerUser({ password: PASSWORD });

    const res = await change(token, { currentPassword: PASSWORD, newPassword: 'NewPassword456!' });
    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'NewPassword456!' });
    expect(newLogin.status).toBe(200);
  });

  test('refuses a new password that breaks the rule, without touching the current one', async () => {
    const { token, user } = await registerUser({ password: PASSWORD });

    const res = await change(token, { currentPassword: PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');

    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
  });
});
