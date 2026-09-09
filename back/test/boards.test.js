import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { registerUser } from './helpers/user.factory.js';

describe('boards', () => {
  let colors;
  let owner;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
  });

  test('create succeeds for the authenticated user', async () => {
    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Launch Plan', color: colors.boardColor._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Launch Plan');
    expect(res.body.data.createdBy).toBe(owner.user.id ?? owner.user._id);
  });

  test('list returns only boards the caller created or is a member of', async () => {
    const otherUser = await registerUser();

    const ownBoard = await createBoard(owner.token, colors.boardColor._id, { title: 'Owner Board' });
    await createBoard(otherUser.token, colors.boardColor._id, { title: 'Other Board' });

    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    const boardIds = res.body.data.map(board => board._id);
    expect(boardIds).toContain(ownBoard._id);
    expect(boardIds).toHaveLength(1);
  });

  test('list includes boards where the caller is a member but not the creator', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id, { title: 'Shared Board' });

    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(200);
    const boardIds = res.body.data.map(b => b._id);
    expect(boardIds).toContain(board._id);
  });

  test('get by id succeeds for a member', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);

    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(board._id);
  });

  test('get by id is forbidden for a non-member', async () => {
    const outsider = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });

  test('update the title as the creator', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id, { title: 'Original Title' });

    const res = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });

  test('delete as the creator also deletes that board tasks', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const taskRes = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Task to remove', status: 'todo', color: colors.taskColor._id.toString() });

    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data._id;

    const deleteRes = await request(app)
      .delete(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(deleteRes.status).toBe(200);

    const taskCheck = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${owner.token}`);

    expect(taskCheck.status).toBe(404);
  });
});
