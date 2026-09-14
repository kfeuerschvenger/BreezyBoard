import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import BoardTemplate from '../src/models/BoardTemplate.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

describe('tasks', () => {
  let colors;
  let owner;
  let board;
  let columns;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id);
    columns = await boardColumns(board._id);
  });

  test('create a task in a board', async () => {
    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Write specs', status: columns[0]._id.toString(), color: colors.taskColor._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Write specs');
    expect(res.body.data.boardId).toBe(board._id);
  });

  test('create refuses a status that is not a column of this board', async () => {
    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Nowhere task', status: 'todo', color: colors.taskColor._id.toString() });

    // A task filed under a status that names no column renders in no column
    // at all, invisible on the board while still counting in its totals.
    // That is how the withdrawn P0-2 was produced, so it is a demonstrated
    // defect rather than a theoretical one.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('create refuses a well formed column id belonging to another board', async () => {
    const otherTemplate = await BoardTemplate.create({
      name: 'Another Template',
      description: 'Columns that belong to a different board',
      columns: [{ title: 'Elsewhere', color: colors.columnColor._id, order: 0 }],
    });

    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Misfiled task',
        status: otherTemplate.columns[0]._id.toString(),
        color: colors.taskColor._id.toString(),
      });

    expect(res.status).toBe(400);
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
    const task = await createTask(owner.token, board._id, colors.taskColor._id, {
      status: columns[0]._id.toString(),
      order: 0,
    });
    const destination = columns[columns.length - 1]._id.toString();

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: destination, order: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(destination);
    expect(res.body.data.order).toBe(2);
  });

  test('move refuses a destination that is not a column of this board', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id);

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: new mongoose.Types.ObjectId().toString(), order: 2 });

    expect(res.status).toBe(400);

    const unchanged = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(unchanged.body.data.status).toBe(columns[0]._id.toString());
  });

  test('update refuses a status that is not a column of this board', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id);

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(400);
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
