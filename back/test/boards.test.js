import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import Board from '../src/models/Board.js';
import Task from '../src/models/Task.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
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

  test('a board owns its columns, copied from its template', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.columns.map(column => column.title)).toEqual(['Backlog', 'Done']);
    // Populated, because the board page renders the column colour and used to
    // get it through the template.
    expect(res.body.data.columns[0].color.value).toBe(colors.columnColor.value);
  });

  test('two boards from the same template do not share column ids', async () => {
    // This is the whole point of copying rather than referencing. While
    // columns lived on the shared template these ids were identical, so
    // renaming a column on one board renamed it on the other, and a task
    // status was ambiguous between them.
    const first = await createBoard(owner.token, colors.boardColor._id, { title: 'First Board' });
    const second = await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });

    const firstIds = (await boardColumns(first._id)).map(column => column._id.toString());
    const secondIds = (await boardColumns(second._id)).map(column => column._id.toString());

    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.some(id => secondIds.includes(id))).toBe(false);
  });

  test('renaming a column on one board leaves every other board untouched', async () => {
    const first = await createBoard(owner.token, colors.boardColor._id, { title: 'First Board' });
    const second = await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });

    // Written through the model rather than an endpoint: column editing is a
    // product feature that does not exist yet. What is being proved here is
    // that the schema allows it without collateral damage, which is what
    // made the change worth doing now.
    const board = await Board.findById(first._id);
    board.columns[0].title = 'Renamed on the first board only';
    await board.save();

    const untouched = await Board.findById(second._id).select('columns');

    expect(untouched.columns[0].title).toBe('Backlog');
  });

  test('delete as the creator also deletes that board tasks', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const { _id: taskId } = await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Task to remove',
    });

    const deleteRes = await request(app)
      .delete(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(deleteRes.status).toBe(200);

    const taskCheck = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${owner.token}`);

    expect(taskCheck.status).toBe(404);
  });

  test('delete leaves the board and its tasks intact when the cascade fails', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const { _id: taskId } = await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Task that must survive',
    });

    // The cascade is the second write of the pair. Forcing it to fail is the
    // only way to observe whether the first write is undone, and it is
    // exactly the scenario the transaction exists for. Without the
    // transaction the board is already deleted by this point and the task
    // outlives it, pointing at a board no query can reach.
    const deleteMany = vi.spyOn(Task, 'deleteMany').mockRejectedValueOnce(new Error('injected cascade failure'));

    const failedDelete = await request(app)
      .delete(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(failedDelete.status).toBe(500);
    expect(deleteMany).toHaveBeenCalled();

    deleteMany.mockRestore();

    const boardCheck = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(boardCheck.status).toBe(200);

    const taskCheck = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${owner.token}`);

    expect(taskCheck.status).toBe(200);
  });
});
