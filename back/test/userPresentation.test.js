import request from 'supertest';
import { describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { registerUser } from './helpers/user.factory.js';

const asUser = (method, path, token) => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

// Names and places are stored lowercase and presented capitalized by the
// model's toJSON. Every route that answers with a person has to present them
// the same way, or the same person reads "Ada Lovelace" in one place and
// "ada lovelace" in another.
describe('a person is presented the same way by every route that returns one', () => {
  test('reading a user by id', async () => {
    const { user, token } = await registerUser({ firstName: 'ada', lastName: 'lovelace' });

    const res = await asUser('get', `/users/${user._id}`, token);

    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Ada');
    expect(res.body.data.lastName).toBe('Lovelace');
  });

  test('updating a user answers with the capitalized record', async () => {
    const { user, token } = await registerUser();

    const res = await asUser('put', `/users/${user._id}`, token).send({
      firstName: 'augusta',
      lastName: 'king',
      location: 'london',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ firstName: 'Augusta', lastName: 'King', location: 'London' });
  });

  test('searching for users', async () => {
    const searcher = await registerUser();
    const found = await registerUser({ firstName: 'grace', lastName: 'hopper' });

    const res = await asUser('get', `/users/search?q=${encodeURIComponent(found.user.email)}`, searcher.token);

    expect(res.status).toBe(200);
    const match = res.body.data.find(person => person._id === found.user._id);
    expect(match).toMatchObject({ firstName: 'Grace', lastName: 'Hopper' });
  });

  test('never carries the password, the token counter or the reset links', async () => {
    const { user, token } = await registerUser();

    const res = await asUser('get', `/users/${user._id}`, token);

    expect(res.body.data).not.toHaveProperty('password');
    expect(res.body.data).not.toHaveProperty('tokenVersion');
    expect(res.body.data).not.toHaveProperty('passwordResets');
    expect(res.body.data).not.toHaveProperty('__v');
  });
});
