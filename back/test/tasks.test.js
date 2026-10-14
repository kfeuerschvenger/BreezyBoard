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

  // A card typed into a column composer is a title and its author, nothing
  // else. The description is optional everywhere, so none is stored and none
  // is invented.
  test('create accepts a title and an owner with no description', async () => {
    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Pack the stove',
        status: columns[0]._id.toString(),
        color: colors.taskColor._id.toString(),
        owner: owner.user._id,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.owner._id).toBe(owner.user._id);
    expect(res.body.data.description).toBeUndefined();
  });

  test('a task with no description can be read, saved again and have a description cleared', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Title only' });

    const saved = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Title only, renamed', description: '' });
    expect(saved.status).toBe(200);
    expect(saved.body.data.description).toBe('');

    const written = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ description: 'Now there is some' });
    expect(written.body.data.description).toBe('Now there is some');

    const cleared = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ description: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.description).toBe('');
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
    // Built from the same template on purpose. While columns lived on the
    // template these two boards shared column ids, so this status would have
    // been indistinguishable from a legitimate one.
    const sibling = await createBoard(owner.token, colors.boardColor._id, { title: 'Sibling Board' });
    const siblingColumns = await boardColumns(sibling._id);

    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Misfiled task',
        status: siblingColumns[0]._id.toString(),
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

  test('a new task lands at the bottom of its column', async () => {
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task A' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task B' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task C' });

    const res = await request(app).get(`/api/tasks/board/${board._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(res.body.data.map(task => task.title)).toEqual(['Task A', 'Task B', 'Task C']);
  });

  test('the ordering key is minted by the server and never taken from the client', async () => {
    const res = await request(app)
      .post(`/api/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Queue jumper',
        status: columns[0]._id.toString(),
        color: colors.taskColor._id.toString(),
        order: '0',
      });

    // `order` is not in the create schema at all, so a client that sends one
    // is refused rather than quietly obeyed. A client-chosen key would defeat
    // the whole design: it could place itself anywhere, forever.
    expect(res.status).toBe(400);
  });

  test('a reorder survives being read back', async () => {
    const column = columns[0]._id.toString();
    const first = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task A' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task B' });
    const third = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task C' });

    // Drag the last card to the top. The expected arrangement is one that
    // creation order cannot produce, or the test would pass against a sort
    // that ignores the key entirely and prove nothing.
    const move = await request(app)
      .patch(`/api/tasks/${third._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: column, afterId: null, beforeId: first._id });

    expect(move.status).toBe(200);

    const res = await request(app).get(`/api/tasks/board/${board._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(res.body.data.map(task => task.title)).toEqual(['Task C', 'Task A', 'Task B']);
  });

  test('a move writes one document, leaving every other key untouched', async () => {
    const column = columns[0]._id.toString();
    const first = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task A' });
    const second = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task B' });
    const third = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task C' });

    await request(app)
      .patch(`/api/tasks/${third._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: column, afterId: first._id, beforeId: second._id });

    const res = await request(app).get(`/api/tasks/board/${board._id}`).set('Authorization', `Bearer ${owner.token}`);
    const byTitle = Object.fromEntries(res.body.data.map(task => [task.title, task.order]));

    // This is the whole reason for fractional indexing. The integer version
    // renumbered every card below the insertion point, which is N writes for
    // one gesture and the race that makes two simultaneous reorders lose
    // each other's work.
    expect(byTitle['Task A']).toBe(first.order);
    expect(byTitle['Task B']).toBe(second.order);
    expect(res.body.data.map(task => task.title)).toEqual(['Task A', 'Task C', 'Task B']);
  });

  test('a move naming a neighbour that has since moved is a conflict, not a bad request', async () => {
    const column = columns[0]._id.toString();
    const elsewhere = columns[columns.length - 1]._id.toString();
    const anchor = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Anchor' });
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Mover' });

    // Somebody else drags the anchor into another column. This client still
    // believes it is where it was.
    await request(app)
      .patch(`/api/tasks/${anchor._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: elsewhere, afterId: null, beforeId: null });

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: column, afterId: anchor._id });

    // 409 rather than 400, because the request was well formed and the
    // client can act on it by refetching. A 400 would tell it to fix a
    // payload that was never wrong.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
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

  test('move changes the column and lands where it was dropped', async () => {
    const destination = columns[columns.length - 1]._id.toString();
    const top = await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Already there, first',
      status: destination,
    });
    const bottom = await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Already there, second',
      status: destination,
    });
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Arriving' });

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: destination, afterId: top._id, beforeId: bottom._id });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(destination);

    // Between the two, not appended after them. Under the previous contract
    // the client could only compute one past the maximum, so a card dropped
    // into the middle of another column always landed at the bottom of it.
    const listed = await request(app).get(`/api/tasks/board/${board._id}`).set('Authorization', `Bearer ${owner.token}`);
    const inColumn = listed.body.data.filter(entry => entry.status === destination).map(entry => entry.title);

    expect(inColumn).toEqual(['Already there, first', 'Arriving', 'Already there, second']);
  });

  test('move refuses a destination that is not a column of this board', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id);

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: new mongoose.Types.ObjectId().toString() });

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
