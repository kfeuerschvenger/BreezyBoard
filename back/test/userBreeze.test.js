import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import { updateUserSchema } from '../src/validation/user.validation.js';
import { registerUser } from './helpers/user.factory.js';

const asUser = (method, path, token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);

const me = async token => (await asUser('get', '/auth/me', token)).body.data;

describe('the breeze setting on the user', () => {
  test('a new account reads as breezy in the registration answer and in the current user', async () => {
    const { user, token } = await registerUser();

    expect(user.breeze).toBe('breezy');
    expect((await me(token)).breeze).toBe('breezy');
  });

  test('a record written before the field existed reads as breezy', async () => {
    const { user, token } = await registerUser();
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(user._id) }, { $unset: { breeze: '' } });

    const stored = await User.collection.findOne({ email: user.email });
    expect(stored.breeze).toBeUndefined();
    expect((await me(token)).breeze).toBe('breezy');
  });

  test.each(['still', 'calm', 'breezy', 'gusty'])('stores %s and returns it from the update and the current user', async level => {
    const { user, token } = await registerUser();

    const res = await asUser('put', `/users/${user._id}`, token).send({ breeze: level });

    expect(res.status).toBe(200);
    expect(res.body.data.breeze).toBe(level);
    expect((await me(token)).breeze).toBe(level);
    expect((await User.findById(user._id)).breeze).toBe(level);
  });

  test('rejects a level that is not one of the four and keeps the stored one', async () => {
    const { user, token } = await registerUser();
    await asUser('put', `/users/${user._id}`, token).send({ breeze: 'calm' });

    const res = await asUser('put', `/users/${user._id}`, token).send({ breeze: 'hurricane' });

    expect(res.status).toBe(400);
    expect((await me(token)).breeze).toBe('calm');
  });

  // The model's enum would also refuse it, so the HTTP answer alone cannot
  // tell which layer said no. The request schema is the layer that answers
  // before anything is written.
  test('the request schema accepts the four levels and nothing else', () => {
    for (const level of ['still', 'calm', 'breezy', 'gusty']) {
      expect(updateUserSchema.safeParse({ breeze: level }).success).toBe(true);
    }
    expect(updateUserSchema.safeParse({ breeze: 'hurricane' }).success).toBe(false);
    expect(updateUserSchema.safeParse({ breeze: '' }).success).toBe(false);
  });

  test('rejects a level that is not a string', async () => {
    const { user, token } = await registerUser();

    const res = await asUser('put', `/users/${user._id}`, token).send({ breeze: 3 });

    expect(res.status).toBe(400);
    expect((await me(token)).breeze).toBe('breezy');
  });

  test('changing it leaves the rest of the profile as it was', async () => {
    const { user, token } = await registerUser({ firstName: 'Lucia' });

    await asUser('put', `/users/${user._id}`, token).send({ breeze: 'gusty' });

    const current = await me(token);
    expect(current.firstName).toBe('Lucia');
    expect(current.email).toBe(user.email);
  });

  test('another person cannot write it and the owner keeps theirs', async () => {
    const owner = await registerUser();
    const other = await registerUser();

    const res = await asUser('put', `/users/${owner.user._id}`, other.token).send({ breeze: 'still' });

    expect(res.status).toBe(403);
    expect((await me(owner.token)).breeze).toBe('breezy');
    expect((await me(other.token)).breeze).toBe('breezy');
  });
});
