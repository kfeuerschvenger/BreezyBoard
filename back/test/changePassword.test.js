import request from 'supertest';
import { describe, expect, test } from 'vitest';
import app from '../src/app.js';
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
