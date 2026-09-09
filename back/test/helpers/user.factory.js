import request from 'supertest';
import app from '../../src/app.js';

let counter = 0;

// Registers a user through the real auth API and returns the created user
// plus the JWT issued at registration, so tests exercise the actual stack
// instead of writing directly to the User model.
export async function registerUser(overrides = {}) {
  counter += 1;

  const payload = {
    firstName: 'Test',
    lastName: `User${counter}`,
    email: `user${counter}.${Date.now()}@example.com`,
    password: 'Password123!',
    ...overrides,
  };

  const res = await request(app).post('/api/auth/register').send(payload);

  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { user: res.body.data.user, token: res.body.data.token };
}
