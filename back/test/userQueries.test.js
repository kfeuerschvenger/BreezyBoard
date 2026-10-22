import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { registerUser } from './helpers/user.factory.js';

const asUser = (path, token) => request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

describe('the query strings of the user routes are validated', () => {
  let owner;
  let board;

  beforeEach(async () => {
    const colors = await seedColorsAndTemplates();
    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id.toString());
  });

  describe('GET /users/board-members', () => {
    test('answers 400 for a malformed board id without echoing it back', async () => {
      const res = await asUser('/users/board-members?boardId=xyz-secret', owner.token);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors).toEqual([{ field: 'boardId', message: 'Must be a valid id' }]);
      expect(JSON.stringify(res.body)).not.toContain('xyz-secret');
    });

    test('answers 400 when the board id is missing', async () => {
      const res = await asUser('/users/board-members', owner.token);

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'boardId' })]);
    });

    test('answers 400 for a parameter it does not read', async () => {
      const res = await asUser(`/users/board-members?boardId=${board._id}&extra=1`, owner.token);

      expect(res.status).toBe(400);
    });

    test('still lists the members of a board the caller belongs to', async () => {
      const res = await asUser(`/users/board-members?boardId=${board._id}`, owner.token);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /users/search', () => {
    test('answers 400 for a term over 100 characters', async () => {
      const res = await asUser(`/users/search?q=${'a'.repeat(101)}`, owner.token);

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'q' })]);
    });

    test('accepts a term of exactly 100 characters', async () => {
      const res = await asUser(`/users/search?q=${'a'.repeat(100)}`, owner.token);

      expect(res.status).toBe(200);
    });

    test('accepts no term at all, which lists people', async () => {
      const res = await asUser('/users/search', owner.token);

      expect(res.status).toBe(200);
    });

    test('answers 400 for a malformed board id to exclude', async () => {
      const res = await asUser('/users/search?q=a&excludeBoardId=xyz', owner.token);

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ field: 'excludeBoardId' })]);
    });

    test('answers 400 for a term sent twice', async () => {
      const res = await asUser('/users/search?q=a&q=b', owner.token);

      expect(res.status).toBe(400);
    });

    test('answers 400 for a parameter it does not read', async () => {
      const res = await asUser('/users/search?q=a&limit=500', owner.token);

      expect(res.status).toBe(400);
    });

    test('still leaves out the members of the excluded board', async () => {
      const other = await registerUser();
      const res = await asUser(`/users/search?q=${encodeURIComponent(other.user.email)}&excludeBoardId=${board._id}`, owner.token);

      expect(res.status).toBe(200);
      expect(res.body.data.map(person => person._id)).toContain(other.user._id);
    });
  });
});
