import crypto from 'crypto';
import request from 'supertest';
import { afterEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import env from '../src/config/env.js';
import { rateLimitTesting } from '../src/middleware/rateLimit.middleware.js';
import User from '../src/models/User.js';
import { setMailTransport } from '../src/services/mail.service.js';
import { installFakeTransport, tokenFrom } from './helpers/mail.transport.js';
import { registerUser } from './helpers/user.factory.js';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

const forgot = (email, headers = {}) => request(app).post('/api/v1/auth/forgot-password').set(headers).send({ email });

const reset = (token, newPassword = 'NewPassword456!') =>
  request(app).post('/api/v1/auth/reset-password').send({ token, newPassword });

const storedReset = email =>
  User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt +tokenVersion').lean();

/** Registers a user, requests a reset for them and returns the reset token mailed to them beside the session token they registered with. */
async function userWithResetToken(mail) {
  const account = await registerUser();
  const expected = mail.sent.length + 1;
  await forgot(account.user.email);
  await mail.waitForMail(expected);

  return { user: account.user, sessionToken: account.token, token: tokenFrom(mail.sent.at(-1)) };
}

afterEach(() => {
  setMailTransport(null);
  rateLimitTesting.enabled = false;
});

describe('POST /auth/forgot-password', () => {
  test('answers identically for an address with an account and one without', async () => {
    const mail = installFakeTransport();
    const { user } = await registerUser();

    const known = await forgot(user.email);
    const unknown = await forgot('nobody.at.all@example.com');

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);

    await mail.waitForMail(1);
    // Give a mistaken send for the unknown address the chance to show up.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(user.email);
  });

  test('still answers the same when the mail relay is down', async () => {
    installFakeTransport({ fail: true });
    const { user } = await registerUser();

    const res = await forgot(user.email);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ success: true, data: { accepted: true } });
  });

  test('refuses an address that is not an email, without touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('mails a link built from the configured frontend origin, never from the Host header', async () => {
    const mail = installFakeTransport();
    const { user } = await registerUser();

    await forgot(user.email, { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' });
    await mail.waitForMail(1);

    const token = tokenFrom(mail.sent[0]);

    expect(mail.sent[0].text).toContain(`${env.FRONTEND_URL}/reset-password#token=${token}`);
    expect(mail.sent[0].html).toContain(`${env.FRONTEND_URL}/reset-password#token=${token}`);
    expect(mail.sent[0].text).not.toContain('?token');
    expect(mail.sent[0].text).not.toContain('evil.example');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  test('stores only the hash of the token, with an expiry', async () => {
    const mail = installFakeTransport();
    const { user, token } = await userWithResetToken(mail);

    const stored = await storedReset(user.email);

    expect(stored.passwordResetTokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);

    const expectedExpiry = Date.now() + env.PASSWORD_RESET_TTL_MS;
    expect(Math.abs(stored.passwordResetExpiresAt.getTime() - expectedExpiry)).toBeLessThan(5000);
  });

  test('the token hash is not loaded with the user and never serialises', async () => {
    const mail = installFakeTransport();
    const { user } = await userWithResetToken(mail);

    const ordinaryRead = await User.findOne({ email: user.email }).lean();
    expect(ordinaryRead.passwordResetTokenHash).toBeUndefined();

    const document = await User.findOne({ email: user.email }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    const json = document.toJSON();

    expect(json.passwordResetTokenHash).toBeUndefined();
    expect(json.passwordResetExpiresAt).toBeUndefined();
  });

  test('a new request invalidates the link from the previous one', async () => {
    const mail = installFakeTransport();
    const { user, token: first } = await userWithResetToken(mail);

    await forgot(user.email);
    await mail.waitForMail(2);
    const second = tokenFrom(mail.sent[1]);

    expect(second).not.toBe(first);

    const withFirst = await reset(first);
    expect(withFirst.status).toBe(400);
    expect(withFirst.body.code).toBe('INVALID_RESET_TOKEN');

    const withSecond = await reset(second);
    expect(withSecond.status).toBe(200);
  });

  test('is behind a rate limit that counts requests which succeed', async () => {
    installFakeTransport();
    rateLimitTesting.enabled = true;

    // Every one of these succeeds with 202, so a limiter that skipped
    // successful requests would let all of them through.
    for (let attempt = 0; attempt < env.PASSWORD_RECOVERY_LIMIT_PER_15_MIN; attempt += 1) {
      const res = await forgot('nobody.at.all@example.com');
      expect(res.status).toBe(202);
    }

    const limited = await forgot('nobody.at.all@example.com');

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');

    // The same budget covers using a link.
    const limitedReset = await reset('a'.repeat(64));
    expect(limitedReset.status).toBe(429);
  });
});

describe('POST /auth/reset-password', () => {
  test('sets the new password, consumes the token and clears it from the user', async () => {
    const mail = installFakeTransport();
    const { user, token } = await userWithResetToken(mail);

    const res = await reset(token, 'NewPassword456!');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { reset: true } });

    const stored = await storedReset(user.email);
    expect(stored.passwordResetTokenHash).toBeUndefined();
    expect(stored.passwordResetExpiresAt).toBeUndefined();

    const withOld = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Password123!' });
    expect(withOld.status).toBe(401);

    const withNew = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'NewPassword456!' });
    expect(withNew.status).toBe(200);
  });

  test('a token works once', async () => {
    const mail = installFakeTransport();
    const { token } = await userWithResetToken(mail);

    const first = await reset(token);
    const second = await reset(token, 'AnotherPassword789!');

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('INVALID_RESET_TOKEN');
  });

  test('two simultaneous uses of one token let exactly one through', async () => {
    const mail = installFakeTransport();
    const { token } = await userWithResetToken(mail);

    const results = await Promise.all([reset(token, 'FirstPassword123!'), reset(token, 'SecondPassword123!')]);

    expect(results.map(res => res.status).sort()).toEqual([200, 400]);
  });

  test('an expired token is refused and the password is left alone', async () => {
    const mail = installFakeTransport();
    const { user, token } = await userWithResetToken(mail);
    await User.updateOne({ email: user.email }, { passwordResetExpiresAt: new Date(Date.now() - 1000) });

    const res = await reset(token);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');

    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Password123!' });
    expect(login.status).toBe(200);
  });

  test('an unknown, an expired and a used token fail with the same response', async () => {
    const mail = installFakeTransport();
    const used = await userWithResetToken(mail);
    await reset(used.token);

    const expired = await userWithResetToken(mail);
    await User.updateOne({ email: expired.user.email }, { passwordResetExpiresAt: new Date(Date.now() - 1000) });

    const responses = await Promise.all([reset('f'.repeat(64)), reset(expired.token), reset(used.token)]);

    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual(responses[0].body);
    }
    expect(responses[0].body.code).toBe('INVALID_RESET_TOKEN');
  });

  test('the stored hash is not accepted as if it were the token', async () => {
    const mail = installFakeTransport();
    const { user } = await userWithResetToken(mail);
    const stored = await storedReset(user.email);

    const res = await reset(stored.passwordResetTokenHash);

    expect(res.status).toBe(400);
  });

  test('applies the registration password rule and keeps the token usable after a refusal', async () => {
    const mail = installFakeTransport();
    const { token } = await userWithResetToken(mail);

    const weak = await reset(token, 'short');

    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');

    const strong = await reset(token, 'StrongPassword123!');
    expect(strong.status).toBe(200);
  });

  test('revokes every session issued before the reset', async () => {
    const mail = installFakeTransport();
    const { sessionToken, user, token } = await userWithResetToken(mail);

    const before = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${sessionToken}`);
    expect(before.status).toBe(200);

    const versionBefore = (await storedReset(user.email)).tokenVersion;
    await reset(token);
    const versionAfter = (await storedReset(user.email)).tokenVersion;

    expect(versionAfter).toBe(versionBefore + 1);

    const after = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${sessionToken}`);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('TOKEN_REVOKED');
  });
});

describe('a password change', () => {
  test('cancels a reset link requested before it', async () => {
    const mail = installFakeTransport();
    const { user, token: resetToken } = await userWithResetToken(mail);
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Password123!' });

    const change = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .send({ currentPassword: 'Password123!', newPassword: 'ChangedPassword123!' });
    expect(change.status).toBe(200);

    const res = await reset(resetToken);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
  });
});
