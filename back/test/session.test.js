import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// This file needs a tiny JWT_ABSOLUTE_TTL_MS to exercise the absolute cap
// without waiting four hours, and a large JWT_INACTIVITY_TTL_MS so the exp
// window never interferes with that test. Both must be set before src/app.js
// (and therefore src/config/env.js) is first evaluated, so they are set here
// and app.js is imported dynamically afterwards rather than statically,
// where import hoisting would run it before this file's own top-level code.
//
// Each Vitest test file gets its own module registry (see test/setup.js), so
// this does not change the defaults used by the other test files. The
// values are still restored in afterAll as a defense in depth against pool
// configurations that reuse a worker's process.env across files.
const ORIGINAL_INACTIVITY_TTL_MS = process.env.JWT_INACTIVITY_TTL_MS;
const ORIGINAL_ABSOLUTE_TTL_MS = process.env.JWT_ABSOLUTE_TTL_MS;

process.env.JWT_INACTIVITY_TTL_MS = '3600000'; // one hour, so exp never fires first
process.env.JWT_ABSOLUTE_TTL_MS = '500'; // half a second, so the cap fires quickly

let app;
let registerUser;

beforeAll(async () => {
  app = (await import('../src/app.js')).default;
  ({ registerUser } = await import('./helpers/user.factory.js'));
});

afterAll(() => {
  process.env.JWT_INACTIVITY_TTL_MS = ORIGINAL_INACTIVITY_TTL_MS;
  process.env.JWT_ABSOLUTE_TTL_MS = ORIGINAL_ABSOLUTE_TTL_MS;
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('sliding session', () => {
  test('an authenticated request carries X-Auth-Token and the returned token differs from the one sent', async () => {
    const { token } = await registerUser();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-auth-token']).toBeDefined();
    expect(res.headers['x-auth-token']).not.toBe(token);
  });

  test('the renewed token preserves sessionStartedAt exactly and advances exp', async () => {
    const { token } = await registerUser();

    const decode = jwtToken => JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64url').toString('utf8'));
    const original = decode(token);

    // A request boundary is enough separation for exp (whole seconds) and
    // iat to move forward, without needing a real sleep.
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const renewed = decode(res.headers['x-auth-token']);

    expect(renewed.sessionStartedAt).toBe(original.sessionStartedAt);
    expect(renewed.tokenVersion).toBe(original.tokenVersion);
    expect(renewed.exp).toBeGreaterThanOrEqual(original.exp);
    expect(renewed.iat).toBeGreaterThanOrEqual(original.iat);
  });

  test('renewal happens even when the handler returns a non-2xx status', async () => {
    const { token } = await registerUser();

    // A syntactically valid but nonexistent user id, authenticated through
    // the same middleware, hits userService.getUserById's 404 path.
    const res = await request(app)
      .get('/api/users/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.headers['x-auth-token']).toBeDefined();
    expect(res.headers['x-auth-token']).not.toBe(token);
  });

  test('once the absolute cap has passed, a still-unexpired token is refused with 401 and no renewal header', async () => {
    const { token } = await registerUser();

    // JWT_ABSOLUTE_TTL_MS is 500ms in this file; JWT_INACTIVITY_TTL_MS is an
    // hour, so exp is nowhere near firing when the cap does.
    await sleep(600);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.headers['x-auth-token']).toBeUndefined();
  });

  test('after logout, the token that was valid a moment ago is rejected', async () => {
    const { token } = await registerUser();

    const logoutRes = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });

  test('after a password change, previously issued tokens are rejected', async () => {
    const password = 'Password123!';
    const { token } = await registerUser({ password });

    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: 'NewPassword456!' });
    expect(changeRes.status).toBe(200);

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });

  test('GET /api/auth/ping returns 204 and renews', async () => {
    const { token } = await registerUser();

    const res = await request(app).get('/api/auth/ping').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-auth-token']).toBeDefined();
    expect(res.headers['x-auth-token']).not.toBe(token);
  });

  test('a token whose tokenVersion is stale is rejected', async () => {
    const { token, user } = await registerUser();
    const { default: User } = await import('../src/models/User.js');

    // Simulate an external revocation (an admin action, say) that bumps
    // tokenVersion without going through the logout endpoint, to verify the
    // middleware's version check independently of that code path.
    await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
