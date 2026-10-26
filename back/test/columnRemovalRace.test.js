import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import app from '../src/app.js';
import Board from '../src/models/Board.js';
import ColorPalette from '../src/models/ColorPalette.js';
import Task from '../src/models/Task.js';
import { rehomeStrandedTasks } from '../src/services/task.service.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

const asUser = (method, path, account) =>
  request(app)[method](`/api${path}`).set('Authorization', `Bearer ${account.token}`);

// A column is removed while a task is being written into it. The two are
// separate documents, so each test lands one side between the other side's
// check and its write, which is the only way to meet the gap on purpose.
describe('a task and the removal of its column racing', () => {
  let colors;
  let owner;
  let board;
  let extra;
  let first;

  const columnIds = async () => (await boardColumns(board._id)).map(column => column._id.toString());

  const removeExtra = async () => {
    const kept = (await boardColumns(board._id))
      .filter(column => column._id.toString() !== extra)
      .map(column => ({ _id: column._id.toString(), title: column.title, color: column.color.toString() }));
    const { columnsVersion } = await Board.findById(board._id).select('columnsVersion');
    const res = await asUser('put', `/boards/${board._id}`, owner).send({ columns: kept, columnsVersion });

    expect(res.status).toBe(200);
  };

  // Runs `action` once, right after the next read of the board's columns that
  // a task write makes to check its column, and before that write goes ahead.
  // The authorization middleware reads the board too, without a projection, so
  // only a read that selects fields counts.
  const afterNextColumnCheck = action => {
    const original = Board.findOne.bind(Board);
    let armed = true;

    vi.spyOn(Board, 'findOne').mockImplementation((...args) => {
      const query = original(...args);

      // Once it has fired, reads are left as they are: the wrapped `select`
      // below answers a promise, which a caller that goes on to chain query
      // methods after it (`exists` does) cannot use.
      if (!armed) return query;

      const select = query.select.bind(query);

      query.select = (...fields) =>
        select(...fields).then(async result => {
          if (armed) {
            armed = false;
            await action();
          }

          return result;
        });

      return query;
    });
  };

  const strandedCount = async () => Task.countDocuments({ boardId: board._id, deletedAt: null, status: { $nin: await columnIds() } });

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    await ColorPalette.create({ name: 'sand', value: 'sand', type: 'board' });
    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id, { title: 'Race' });

    const sand = await ColorPalette.findOne({ value: 'sand' });
    const current = await boardColumns(board._id);
    const { columnsVersion } = await Board.findById(board._id).select('columnsVersion');
    const grown = [
      ...current.map(column => ({ _id: column._id.toString(), title: column.title, color: column.color.toString() })),
      { title: 'Review', color: sand._id.toString() },
    ];

    await asUser('put', `/boards/${board._id}`, owner).send({ columns: grown, columnsVersion });
    const columns = await boardColumns(board._id);

    first = columns[0]._id.toString();
    extra = columns.find(column => column.title === 'Review')._id.toString();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a task created into a column that is removed meanwhile ends up in the first column, and is on the board', async () => {
    afterNextColumnCheck(removeExtra);

    const res = await asUser('post', `/tasks/board/${board._id}`, owner).send({ title: 'Late', status: extra, color: colors.taskColor._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(first);
    expect(await strandedCount()).toBe(0);

    const onBoard = await asUser('get', `/tasks/board/${board._id}`, owner);
    expect(onBoard.body.data.map(task => task.title)).toEqual(['Late']);
    expect(onBoard.body.pagination.total).toBe(1);
  });

  test('a task moved into a column that is removed meanwhile ends up in the first column', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
    afterNextColumnCheck(removeExtra);

    const res = await asUser('patch', `/tasks/${task._id}/move`, owner).send({ status: extra });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(first);
    expect(await strandedCount()).toBe(0);
  });

  test('a task whose status is edited to a column that is removed meanwhile ends up in the first column', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
    afterNextColumnCheck(removeExtra);

    const res = await asUser('put', `/tasks/${task._id}`, owner).send({ status: extra });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(first);
    expect(await strandedCount()).toBe(0);
  });

  test('a trashed task restored into a column that is removed meanwhile ends up in the first column', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: extra });
    await asUser('delete', `/tasks/${task._id}`, owner);
    afterNextColumnCheck(removeExtra);

    const res = await asUser('post', `/tasks/${task._id}/restore`, owner);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(first);
    expect(await strandedCount()).toBe(0);
  });

  test('a column removed after it was found empty, while a task lands in it, leaves that task in the first column', async () => {
    const original = Task.distinct.bind(Task);
    // The emptiness check is the first thing the removal does, so a task
    // created here is in the gap between the check and the write.
    vi.spyOn(Task, 'distinct').mockImplementationOnce((...args) =>
      original(...args).then(async result => {
        await createTask(owner.token, board._id, colors.taskColor._id, { title: 'In the gap', status: extra });
        return result;
      })
    );

    await removeExtra();

    expect(await strandedCount()).toBe(0);
    const onBoard = await asUser('get', `/tasks/board/${board._id}`, owner);
    expect(onBoard.body.data.map(task => task.title)).toEqual(['In the gap']);
    expect(onBoard.body.data[0].status).toBe(first);
  });

  test('the moved task sits at the foot of the first column, below the cards already there', async () => {
    const resident = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
    afterNextColumnCheck(removeExtra);

    const res = await asUser('post', `/tasks/board/${board._id}`, owner).send({ title: 'Late', status: extra, color: colors.taskColor._id.toString() });

    expect(res.body.data.order > resident.order).toBe(true);
  });

  test('a removal that has no card in the gap moves nothing', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });

    await removeExtra();

    expect((await Task.findById(task._id)).order).toBe(task.order);
    expect(await strandedCount()).toBe(0);
  });

  describe('a write whose column is still there', () => {
    test('costs one existence check and does not scan the board for stranded tasks', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
      const scan = vi.spyOn(Task, 'find');

      const res = await asUser('patch', `/tasks/${task._id}/move`, owner).send({ status: extra });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(extra);
      expect(scan).not.toHaveBeenCalled();
    });
  });

  describe('a repair that fails after the write was committed', () => {
    test('a moved task is answered as moved, not as an error', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
      vi.spyOn(Board, 'exists').mockRejectedValueOnce(new Error('connection lost'));

      const res = await asUser('patch', `/tasks/${task._id}/move`, owner).send({ status: extra });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(extra);
      expect((await Task.findById(task._id)).status).toBe(extra);
    });

    test('a created task is answered as created', async () => {
      vi.spyOn(Board, 'exists').mockRejectedValueOnce(new Error('connection lost'));

      const res = await asUser('post', `/tasks/board/${board._id}`, owner).send({ title: 'Kept', status: first, color: colors.taskColor._id.toString() });

      expect(res.status).toBe(201);
      expect(await Task.countDocuments({ boardId: board._id, title: 'Kept' })).toBe(1);
    });

    test('a column removal is answered as saved', async () => {
      await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
      vi.spyOn(Task, 'find').mockRejectedValueOnce(new Error('connection lost'));

      await removeExtra();

      expect(await columnIds()).not.toContain(extra);
    });
  });

  describe('rehomeStrandedTasks', () => {
    test('moves only live tasks of a missing column, and leaves the trash alone', async () => {
      const live = await Task.create({ title: 'Live', boardId: board._id, status: extra, color: colors.taskColor._id, order: 'a0' });
      const trashed = await Task.create({ title: 'Trashed', boardId: board._id, status: extra, color: colors.taskColor._id, order: 'a1', deletedAt: new Date() });
      const resident = await createTask(owner.token, board._id, colors.taskColor._id, { status: first });
      await Board.updateOne({ _id: board._id }, { $pull: { columns: { _id: extra } } });

      const moved = await rehomeStrandedTasks(board._id);

      expect(moved).toBe(1);
      expect((await Task.findById(live._id)).status).toBe(first);
      expect((await Task.findById(trashed._id)).status).toBe(extra);
      expect((await Task.findById(resident._id)).status).toBe(first);
    });

    test('is limited to the scope it is given', async () => {
      const a = await Task.create({ title: 'A', boardId: board._id, status: extra, color: colors.taskColor._id, order: 'a0' });
      const b = await Task.create({ title: 'B', boardId: board._id, status: extra, color: colors.taskColor._id, order: 'a1' });
      await Board.updateOne({ _id: board._id }, { $pull: { columns: { _id: extra } } });

      expect(await rehomeStrandedTasks(board._id, { taskId: a._id })).toBe(1);

      expect((await Task.findById(a._id)).status).toBe(first);
      expect((await Task.findById(b._id)).status).toBe(extra);
    });

    test('does nothing for a deleted board', async () => {
      const task = await Task.create({ title: 'A', boardId: board._id, status: extra, color: colors.taskColor._id, order: 'a0' });
      await Board.updateOne({ _id: board._id }, { $pull: { columns: { _id: extra } }, deletedAt: new Date() });

      expect(await rehomeStrandedTasks(board._id)).toBe(0);
      expect((await Task.findById(task._id)).status).toBe(extra);
    });
  });
});
