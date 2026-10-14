import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import { startBoardPurgeJob } from '../src/jobs/boardPurge.job.js';
import Board from '../src/models/Board.js';
import Task from '../src/models/Task.js';
import { purgeExpiredBoards } from '../src/services/board.service.js';
import { deleteTask, purgeExpiredTasks, restoreTask } from '../src/services/task.service.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * DAY_MS;

const idOf = account => account.user.id ?? account.user._id;
const asUser = (method, path, account) =>
  request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${account.token}`);
const ageDeletion = (id, ageMs) => Task.updateOne({ _id: id }, { deletedAt: new Date(Date.now() - ageMs) });

describe('task soft delete and restore', () => {
  let colors;
  let owner;
  let member;
  let board;
  let columns;
  let first;
  let second;
  let third;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    member = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id, { title: 'Soft deletes' });
    await asUser('patch', `/boards/${board._id}/members`, owner).send({ members: [idOf(member)] });
    columns = await boardColumns(board._id);
    first = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'First' });
    second = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Second' });
    third = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Third' });
  });

  const listedTitles = async account => {
    const res = await asUser('get', `/tasks/board/${board._id}`, account);

    return res.body.data.map(task => task.title);
  };

  describe('delete', () => {
    test('marks the task and removes nothing', async () => {
      const res = await asUser('delete', `/tasks/${second._id}`, owner);

      expect(res.status).toBe(200);

      const stored = await Task.findById(second._id);
      expect(stored.deletedAt).toBeInstanceOf(Date);
      expect(stored.title).toBe('Second');
      expect(stored.order).toBe(second.order);
    });

    test('is allowed for a member of the board', async () => {
      const res = await asUser('delete', `/tasks/${second._id}`, member);

      expect(res.status).toBe(200);
      expect((await Task.findById(second._id)).deletedAt).toBeInstanceOf(Date);
    });

    test('is refused for somebody with no role on the board, and the task stays', async () => {
      const stranger = await registerUser();

      const res = await asUser('delete', `/tasks/${second._id}`, stranger);

      expect(res.status).toBe(403);
      expect((await Task.findById(second._id)).deletedAt).toBeNull();
    });

    test('answers 404 when the task is already deleted and never moves its deletion date', async () => {
      const marked = await deleteTask(second._id);

      const again = await asUser('delete', `/tasks/${second._id}`, owner);

      expect(again.status).toBe(404);
      expect((await Task.findById(second._id)).deletedAt).toEqual(marked.deletedAt);
    });

    test('works for a board whose tasks include a deleted one: the board can be deleted and purged with them', async () => {
      await asUser('delete', `/tasks/${second._id}`, owner);

      expect((await asUser('delete', `/boards/${board._id}`, owner)).status).toBe(200);

      await Board.updateOne({ _id: board._id }, { deletedAt: new Date(Date.now() - RETENTION_MS - DAY_MS) });
      expect(await purgeExpiredBoards({ retentionMs: RETENTION_MS })).toBe(1);
      expect(await Task.countDocuments({ boardId: board._id })).toBe(0);
    });
  });

  describe('a deleted task is invisible', () => {
    beforeEach(async () => {
      await asUser('delete', `/tasks/${second._id}`, owner);
    });

    test.each([
      ['owner', () => owner],
      ['member', () => member],
    ])('to the %s in the board read, which also drops it from the total', async (_label, who) => {
      const res = await asUser('get', `/tasks/board/${board._id}`, who());

      expect(res.body.data.map(task => task._id)).toEqual([first._id, third._id]);
      expect(res.body.pagination.total).toBe(2);
    });

    test('in a paginated read, where the page is cut after the exclusion', async () => {
      const res = await asUser('get', `/tasks/board/${board._id}?limit=2&offset=0`, owner);

      expect(res.body.data.map(task => task.title)).toEqual(['First', 'Third']);
      expect(res.body.pagination).toEqual({ total: 2, limit: 2, offset: 0 });
    });

    test('to a single read, an update, a move and both checklist routes', async () => {
      const withItem = await createTask(owner.token, board._id, colors.taskColor._id, {
        title: 'With a checklist',
        checklist: [{ text: 'One' }],
      });
      await asUser('delete', `/tasks/${withItem._id}`, owner);
      const itemId = withItem.checklist[0]._id;

      expect((await asUser('get', `/tasks/${second._id}`, owner)).status).toBe(404);
      expect((await asUser('put', `/tasks/${second._id}`, owner).send({ title: 'Edited' })).status).toBe(404);
      expect(
        (await asUser('patch', `/tasks/${second._id}/move`, owner).send({ status: columns[1]._id.toString() })).status
      ).toBe(404);
      expect(
        (await asUser('patch', `/tasks/${withItem._id}/checklist/${itemId}`, owner).send({ completed: true })).status
      ).toBe(404);
      expect((await asUser('delete', `/tasks/${withItem._id}/checklist/${itemId}`, owner)).status).toBe(404);

      const stored = await Task.findById(second._id);
      expect(stored.title).toBe('Second');
      expect(stored.status).toBe(columns[0]._id.toString());
    });

    test('even to a stranger, who is told the task is missing rather than that it is not theirs', async () => {
      const stranger = await registerUser();

      const res = await asUser('get', `/tasks/${second._id}`, stranger);

      expect(res.status).toBe(404);
      expect((await asUser('delete', `/tasks/${second._id}`, stranger)).status).toBe(404);
    });

    test('as a neighbour: dropping a card next to a deleted one is a 409, not a position next to a ghost', async () => {
      const res = await asUser('patch', `/tasks/${third._id}/move`, owner).send({
        status: columns[0]._id.toString(),
        afterId: second._id,
        beforeId: null,
      });

      expect(res.status).toBe(409);
    });

    test('in a reorder between the live neighbours, which still works', async () => {
      const res = await asUser('patch', `/tasks/${third._id}/move`, owner).send({
        status: columns[0]._id.toString(),
        afterId: null,
        beforeId: first._id,
      });

      expect(res.status).toBe(200);
      expect(await listedTitles(owner)).toEqual(['Third', 'First']);
    });

    test('in the dashboard total, the board list counts and the progress', async () => {
      const done = columns.at(-1);
      // Three tasks, one of them deleted: two are left and one of those is in
      // the last column, so the board is 50 percent done.
      await asUser('patch', `/tasks/${third._id}/move`, owner).send({ status: done._id.toString() });

      const stats = await asUser('get', '/dashboard/stats', owner);
      expect(stats.body.data.totalTasks).toBe(2);
      expect(stats.body.data.avgProgress).toBe(50);

      const list = await asUser('get', '/boards', owner);
      const listed = list.body.data.find(b => b._id === board._id);
      expect(listed.taskCount).toBe(2);
      expect(listed.progress).toBe(50);
    });

    test('in the board document count', async () => {
      const populated = await Board.findById(board._id).populate('taskCount');

      expect(populated.toJSON().taskCount).toBe(2);
    });

    test('a task created afterwards goes below the deleted one, so a restore shares no position', async () => {
      const created = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Fourth' });

      expect(created.order > third.order).toBe(true);
    });
  });

  describe('restore', () => {
    beforeEach(async () => {
      await asUser('delete', `/tasks/${second._id}`, owner);
    });

    test('brings the same task back in the same place, with its id and dates', async () => {
      const res = await asUser('post', `/tasks/${second._id}/restore`, owner);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        _id: second._id,
        title: 'Second',
        status: second.status,
        order: second.order,
        createdAt: second.createdAt,
        deletedAt: null,
      });
      expect(await listedTitles(member)).toEqual(['First', 'Second', 'Third']);
    });

    test('is allowed for a member, as the delete is', async () => {
      const res = await asUser('post', `/tasks/${second._id}/restore`, member);

      expect(res.status).toBe(200);
      expect((await Task.findById(second._id)).deletedAt).toBeNull();
    });

    test('is refused for somebody with no role on the board, and the task stays deleted', async () => {
      const stranger = await registerUser();

      const res = await asUser('post', `/tasks/${second._id}/restore`, stranger);

      expect(res.status).toBe(403);
      expect((await Task.findById(second._id)).deletedAt).toBeInstanceOf(Date);
    });

    test('answers the same way when the task is not deleted', async () => {
      await asUser('post', `/tasks/${second._id}/restore`, owner);

      const again = await asUser('post', `/tasks/${second._id}/restore`, owner);

      expect(again.status).toBe(200);
      expect(again.body.data.deletedAt).toBeNull();
    });

    test('succeeds although the task owner is no longer a member of the board, and keeps that owner', async () => {
      const owned = await createTask(owner.token, board._id, colors.taskColor._id, {
        title: 'Owned by a member',
        owner: idOf(member),
      });
      await asUser('delete', `/tasks/${owned._id}`, owner);
      await Board.updateOne({ _id: board._id }, { $pull: { members: idOf(member) } });

      const res = await asUser('post', `/tasks/${owned._id}/restore`, owner);

      expect(res.status).toBe(200);
      expect(res.body.data.deletedAt).toBeNull();
      expect(res.body.data.owner._id).toBe(idOf(member));
    });

    test('answers 404 once the task has been purged', async () => {
      await ageDeletion(second._id, RETENTION_MS + DAY_MS);
      await purgeExpiredTasks({ retentionMs: RETENTION_MS });

      const res = await asUser('post', `/tasks/${second._id}/restore`, owner);

      expect(res.status).toBe(404);
    });

    test('answers 404 for a task deleted longer ago than the window, before the purge has run', async () => {
      await ageDeletion(second._id, RETENTION_MS + 60 * 1000);

      const res = await asUser('post', `/tasks/${second._id}/restore`, owner);

      expect(res.status).toBe(404);
      expect((await Task.findById(second._id)).deletedAt).toBeInstanceOf(Date);
    });

    test('still restores a task deleted just inside the window', async () => {
      await ageDeletion(second._id, RETENTION_MS - 60 * 1000);

      const res = await asUser('post', `/tasks/${second._id}/restore`, owner);

      expect(res.status).toBe(200);
    });

    test('draws the line where the purge does: a task at exactly the cutoff belongs to the purge', async () => {
      const now = new Date('2026-01-10T12:00:00.000Z');
      await Task.updateOne({ _id: second._id }, { deletedAt: new Date(now.getTime() - RETENTION_MS) });

      await expect(restoreTask(second._id, { retentionMs: RETENTION_MS, now })).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(await purgeExpiredTasks({ retentionMs: RETENTION_MS, now })).toBe(1);
    });

    test('answers 404 while the board itself is deleted, and a restored board keeps the task deleted', async () => {
      await asUser('delete', `/boards/${board._id}`, owner);

      expect((await asUser('post', `/tasks/${second._id}/restore`, owner)).status).toBe(404);

      await asUser('post', `/boards/${board._id}/restore`, owner);
      expect(await listedTitles(owner)).toEqual(['First', 'Third']);
    });

    test('requires a valid id and answers 404 for an id that names no task', async () => {
      expect((await asUser('post', '/tasks/not-an-id/restore', owner)).status).toBe(400);
      expect((await asUser('post', '/tasks/64b64b64b64b64b64b64b64b/restore', owner)).status).toBe(404);
    });
  });

  describe('purge', () => {
    test('removes a task past retention and keeps one inside the window and one never deleted', async () => {
      await ageDeletion(first._id, RETENTION_MS + DAY_MS);
      await ageDeletion(second._id, RETENTION_MS - DAY_MS);

      const purged = await purgeExpiredTasks({ retentionMs: RETENTION_MS });

      expect(purged).toBe(1);
      expect(await Task.countDocuments({ _id: first._id })).toBe(0);
      expect(await Task.countDocuments({ _id: { $in: [second._id, third._id] } })).toBe(2);
    });

    test('never removes a task restored in the meantime', async () => {
      await ageDeletion(first._id, RETENTION_MS + DAY_MS);
      await Task.updateOne({ _id: first._id }, { deletedAt: null });

      expect(await purgeExpiredTasks({ retentionMs: RETENTION_MS })).toBe(0);
      expect(await Task.countDocuments({ _id: first._id })).toBe(1);
    });

    test('runs from the purge job with the configured window', async () => {
      await ageDeletion(first._id, RETENTION_MS + DAY_MS);

      const stop = startBoardPurgeJob({ intervalMs: 60 * 60 * 1000 });

      try {
        await vi.waitFor(async () => expect(await Task.countDocuments({ _id: first._id })).toBe(0));
        expect(await Task.countDocuments({ _id: { $in: [second._id, third._id] } })).toBe(2);
      } finally {
        stop();
      }
    });
  });
});
