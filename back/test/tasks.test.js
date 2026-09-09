import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

describe('tasks', () => {
  let colors;
  let owner;
  let board;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id);
  });

  test('create a task in a board', async () => {
    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Write specs', status: 'todo', color: colors.taskColor._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Write specs');
    expect(res.body.data.boardId).toBe(board._id);
  });

  test('list tasks by board', async () => {
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task A' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task B' });

    const res = await request(app)
      .get(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test('update a task', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Original title' });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Updated title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated title');
  });

  test('move changes status and order', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: 'todo', order: 0 });

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'in-progress', order: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in-progress');
    expect(res.body.data.order).toBe(2);
  });

  test('update and delete a checklist item', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, {
      checklist: [{ text: 'Step one' }, { text: 'Step two' }],
    });
    const itemId = task.checklist[0]._id;

    const updateRes = await request(app)
      .patch(`/api/tasks/${task._id}/checklist/${itemId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ completed: true });

    expect(updateRes.status).toBe(200);
    const updatedItem = updateRes.body.data.checklist.find(item => item._id === itemId);
    expect(updatedItem.completed).toBe(true);
    expect(updatedItem.text).toBe('Step one');

    const deleteRes = await request(app)
      .delete(`/api/tasks/${task._id}/checklist/${itemId}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(deleteRes.status).toBe(200);
    const remainingIds = deleteRes.body.data.checklist.map(item => item._id);
    expect(remainingIds).not.toContain(itemId);
    expect(remainingIds).toHaveLength(1);
  });
});
