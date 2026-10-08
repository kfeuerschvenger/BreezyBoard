import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import { startBoardPurgeJob } from '../src/jobs/boardPurge.job.js';
import Board from '../src/models/Board.js';
import Task from '../src/models/Task.js';
import { deleteBoard, purgeExpiredBoards, restoreBoard } from '../src/services/board.service.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * DAY_MS;

const idOf = account => account.user.id ?? account.user._id;
const asUser = (method, path, account) =>
  request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${account.token}`);

describe('board soft delete and restore', () => {
  let colors;
  let owner;
  let member;
  let board;
  let task;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    member = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id, { title: 'Doomed' });
    await asUser('patch', `/boards/${board._id}/members`, owner).send({ members: [idOf(member)] });
    task = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Survives the delete' });
  });

  describe('delete', () => {
    test('marks the board deleted and leaves its tasks untouched', async () => {
      const res = await asUser('delete', `/boards/${board._id}`, owner);

      expect(res.status).toBe(200);
      expect(res.body.data.deletedAt).toEqual(expect.any(String));

      const stored = await Board.findById(board._id);
      expect(stored.deletedAt).toBeInstanceOf(Date);
      expect(await Task.countDocuments({ boardId: board._id })).toBe(1);
    });

    test('is refused for a member, and the board stays visible', async () => {
      const res = await asUser('delete', `/boards/${board._id}`, member);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect((await Board.findById(board._id)).deletedAt).toBeNull();
    });

    test('answers 404 when the board is already deleted', async () => {
      await asUser('delete', `/boards/${board._id}`, owner);

      const again = await asUser('delete', `/boards/${board._id}`, owner);

      expect(again.status).toBe(404);
    });

    test('never moves the deletion date of a board that is already deleted', async () => {
      const first = await deleteBoard(board._id);

      await expect(deleteBoard(board._id)).rejects.toMatchObject({ statusCode: 404 });
      expect((await Board.findById(board._id)).deletedAt).toEqual(first.deletedAt);
    });
  });

  describe('a deleted board is invisible', () => {
    beforeEach(async () => {
      await asUser('delete', `/boards/${board._id}`, owner);
    });

    test.each([
      ['owner', () => owner],
      ['member', () => member],
    ])('to the %s in the list', async (_label, who) => {
      const res = await asUser('get', '/boards', who());

      expect(res.status).toBe(200);
      expect(res.body.data.map(b => b._id)).not.toContain(board._id);
      expect(res.body.pagination.total).toBe(0);
    });

    test.each([
      ['owner', () => owner],
      ['member', () => member],
    ])('to the %s on the board read', async (_label, who) => {
      const res = await asUser('get', `/boards/${board._id}`, who());

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    test.each([
      ['owner', () => owner],
      ['member', () => member],
    ])('to the %s on the task list, one task and the task writes', async (_label, who) => {
      expect((await asUser('get', `/tasks/board/${board._id}`, who())).status).toBe(404);
      expect((await asUser('get', `/tasks/${task._id}`, who())).status).toBe(404);
      expect((await asUser('put', `/tasks/${task._id}`, who()).send({ title: 'x' })).status).toBe(404);
      expect((await asUser('delete', `/tasks/${task._id}`, who())).status).toBe(404);
      const [firstColumn] = await boardColumns(board._id);
      const created = await asUser('post', `/tasks/board/${board._id}`, who()).send({
        title: 'x',
        status: firstColumn._id.toString(),
        color: colors.taskColor._id,
      });
      expect(created.status).toBe(404);
    });

    test('to the board update and the member endpoints', async () => {
      expect((await asUser('put', `/boards/${board._id}`, owner).send({ title: 'x' })).status).toBe(404);
      expect(
        (await asUser('patch', `/boards/${board._id}/members`, owner).send({ members: [idOf(member)] })).status
      ).toBe(404);
      expect((await asUser('get', `/users/board-members?boardId=${board._id}`, owner)).status).toBe(404);
    });

    test('to the dashboard totals', async () => {
      const res = await asUser('get', '/dashboard/stats', owner);

      expect(res.body.data).toMatchObject({ totalBoards: 0, totalTasks: 0 });
    });
  });

  describe('restore', () => {
    beforeEach(async () => {
      await asUser('delete', `/boards/${board._id}`, owner);
    });

    test('brings the board back with exactly the tasks it had', async () => {
      const res = await asUser('post', `/boards/${board._id}/restore`, owner);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(board._id);
      expect(res.body.data.deletedAt).toBeNull();

      const list = await asUser('get', '/boards', member);
      expect(list.body.data.map(b => b._id)).toContain(board._id);

      const tasks = await asUser('get', `/tasks/board/${board._id}`, owner);
      expect(tasks.body.data.map(t => t._id)).toEqual([task._id]);
    });

    test('is refused for a member while the board is deleted', async () => {
      const res = await asUser('post', `/boards/${board._id}/restore`, member);

      expect(res.status).toBe(403);
      expect((await Board.findById(board._id)).deletedAt).toBeInstanceOf(Date);
    });

    test('is refused for somebody with no role on the board', async () => {
      const stranger = await registerUser();

      const res = await asUser('post', `/boards/${board._id}/restore`, stranger);

      expect(res.status).toBe(403);
    });

    test('answers the same way when the board is not deleted', async () => {
      await asUser('post', `/boards/${board._id}/restore`, owner);

      const again = await asUser('post', `/boards/${board._id}/restore`, owner);

      expect(again.status).toBe(200);
      expect(again.body.data.deletedAt).toBeNull();
    });

    test('answers 404 once the board has been purged', async () => {
      await Board.updateOne({ _id: board._id }, { deletedAt: new Date(Date.now() - RETENTION_MS - DAY_MS) });
      await purgeExpiredBoards({ retentionMs: RETENTION_MS });

      const res = await asUser('post', `/boards/${board._id}/restore`, owner);

      expect(res.status).toBe(404);
    });

    test('answers 404 for a board deleted longer ago than the retention window, even before the purge has run', async () => {
      await Board.updateOne({ _id: board._id }, { deletedAt: new Date(Date.now() - RETENTION_MS - 60 * 1000) });

      const res = await asUser('post', `/boards/${board._id}/restore`, owner);

      expect(res.status).toBe(404);
      expect((await Board.findById(board._id)).deletedAt).toBeInstanceOf(Date);
    });

    test('still restores a board deleted just inside the window', async () => {
      await Board.updateOne({ _id: board._id }, { deletedAt: new Date(Date.now() - RETENTION_MS + 60 * 1000) });

      const res = await asUser('post', `/boards/${board._id}/restore`, owner);

      expect(res.status).toBe(200);
      expect(res.body.data.deletedAt).toBeNull();
    });

    test('draws the line where the purge does: a board at exactly the cutoff belongs to the purge, not to a restore', async () => {
      const now = new Date('2026-01-10T12:00:00.000Z');
      await Board.updateOne({ _id: board._id }, { deletedAt: new Date(now.getTime() - RETENTION_MS) });

      await expect(restoreBoard(board._id, { retentionMs: RETENTION_MS, now })).rejects.toMatchObject({ statusCode: 404 });
      expect(await purgeExpiredBoards({ retentionMs: RETENTION_MS, now })).toBe(1);
    });

    test('requires a valid id', async () => {
      const res = await asUser('post', '/boards/not-an-id/restore', owner);

      expect(res.status).toBe(400);
    });
  });

  describe('purge', () => {
    const expire = async (id, ageMs) => Board.updateOne({ _id: id }, { deletedAt: new Date(Date.now() - ageMs) });

    test('removes a board past retention together with its tasks', async () => {
      await expire(board._id, RETENTION_MS + DAY_MS);

      const purged = await purgeExpiredBoards({ retentionMs: RETENTION_MS });

      expect(purged).toBe(1);
      expect(await Board.countDocuments({ _id: board._id })).toBe(0);
      expect(await Task.countDocuments({ boardId: board._id })).toBe(0);
    });

    test('keeps a board still inside the window, and one that was never deleted', async () => {
      const recent = await createBoard(owner.token, colors.boardColor._id, { title: 'Recently deleted' });
      await expire(recent._id, RETENTION_MS - DAY_MS);
      await Board.updateOne({ _id: board._id }, { createdAt: new Date(Date.now() - 30 * DAY_MS) });

      const purged = await purgeExpiredBoards({ retentionMs: RETENTION_MS });

      expect(purged).toBe(0);
      expect(await Board.countDocuments({ _id: { $in: [board._id, recent._id] } })).toBe(2);
      expect(await Task.countDocuments({ boardId: board._id })).toBe(1);
    });

    test('is atomic: a failing cascade leaves the board and its tasks in place', async () => {
      await expire(board._id, RETENTION_MS + DAY_MS);
      const deleteMany = vi.spyOn(Task, 'deleteMany').mockRejectedValueOnce(new Error('injected cascade failure'));

      await expect(purgeExpiredBoards({ retentionMs: RETENTION_MS })).rejects.toThrow('injected cascade failure');
      deleteMany.mockRestore();

      expect(await Board.countDocuments({ _id: board._id })).toBe(1);
      expect(await Task.countDocuments({ boardId: board._id })).toBe(1);
    });

    test('carries on past one board that fails and reports it', async () => {
      const second = await createBoard(owner.token, colors.boardColor._id, { title: 'Second' });
      await createTask(owner.token, second._id, colors.taskColor._id);
      await expire(board._id, RETENTION_MS + DAY_MS);
      await expire(second._id, RETENTION_MS + 2 * DAY_MS);
      const deleteMany = vi.spyOn(Task, 'deleteMany').mockRejectedValueOnce(new Error('injected cascade failure'));

      const onError = vi.fn();
      const purged = await purgeExpiredBoards({ retentionMs: RETENTION_MS, onError });
      deleteMany.mockRestore();

      expect(purged).toBe(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    test('never removes a board restored between the scan and the removal', async () => {
      // A restore that landed inside the window, after the scan had already
      // read the board's old date. The write is direct because the route now
      // refuses a board that is past the window, which is the reverse of the
      // race this test sets up.
      await Board.updateOne({ _id: board._id }, { deletedAt: null });

      // The scan names the board as if it had run before the restore, so only
      // the guard inside the transaction can save it.
      const scan = vi.spyOn(Board, 'distinct').mockResolvedValueOnce([board._id]);

      expect(await purgeExpiredBoards({ retentionMs: RETENTION_MS })).toBe(0);
      expect(scan).toHaveBeenCalledTimes(1);
      expect(await Board.countDocuments({ _id: board._id })).toBe(1);
      expect((await Board.findById(board._id)).deletedAt).toBeNull();
    });
  });

  describe('purge job', () => {
    test('purges at start and then on every interval, and stops when told to', async () => {
      vi.useFakeTimers();
      const purge = vi.fn().mockResolvedValue(0);

      try {
        const stop = startBoardPurgeJob({ intervalMs: 1000, purge });
        expect(purge).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2500);
        expect(purge).toHaveBeenCalledTimes(3);

        stop();
        await vi.advanceTimersByTimeAsync(5000);
        expect(purge).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    test('survives a failing purge and keeps its schedule', async () => {
      vi.useFakeTimers();
      const purge = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(0);

      try {
        const stop = startBoardPurgeJob({ intervalMs: 1000, purge });
        await vi.advanceTimersByTimeAsync(1500);

        expect(purge).toHaveBeenCalledTimes(2);
        stop();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
