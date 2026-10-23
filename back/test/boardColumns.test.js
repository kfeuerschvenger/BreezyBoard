import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import Board from '../src/models/Board.js';
import ColorPalette from '../src/models/ColorPalette.js';
import Task from '../src/models/Task.js';
import { purgeExpiredTasks } from '../src/services/task.service.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 7 * DAY_MS;

const idOf = account => account.user.id ?? account.user._id;
const asUser = (method, path, account) =>
  request(app)[method](`/api${path}`).set('Authorization', `Bearer ${account.token}`);

describe('board columns', () => {
  let colors;
  let hues;
  let owner;
  let board;

  // The columns of the board as the dialog holds them: an id, a name and the id
  // of the hue, in order.
  const stored = async () =>
    (await boardColumns(board._id)).map(column => ({
      _id: column._id.toString(),
      title: column.title,
      color: column.color.toString(),
    }));

  const save = (columns, account = owner, extra = {}) =>
    asUser('put', `/boards/${board._id}`, account).send({ columns, ...extra });

  const fresh = title => ({ title, color: hues.sand._id.toString() });

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    hues = { sky: colors.boardColor, teal: colors.columnColor };
    for (const hue of ['green', 'sand', 'coral', 'lavender']) {
      hues[hue] = await ColorPalette.create({ name: hue, value: hue, type: 'board' });
    }

    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id, { title: 'Columns' });
  });

  describe('adding a column', () => {
    test.each([
      ['first', 0, ['New', 'Backlog', 'Done']],
      ['between two named columns', 1, ['Backlog', 'New', 'Done']],
      ['last', 2, ['Backlog', 'Done', 'New']],
    ])('places it %s', async (_label, position, expected) => {
      const current = await stored();
      const list = [...current];
      list.splice(position, 0, fresh('New'));

      const res = await save(list);

      expect(res.status).toBe(200);
      const columns = res.body.data.columns.sort((a, b) => a.order - b.order);
      expect(columns.map(column => column.title)).toEqual(expected);
      expect(columns.map(column => column.order)).toEqual([0, 1, 2]);
      expect(columns.find(column => column.title === 'New').color.value).toBe('sand');
    });

    test('keeps the id of every column that was already there, and gives the new one its own', async () => {
      const before = await stored();

      const res = await save([...before, fresh('New')]);

      const after = await stored();
      expect(after.slice(0, 2).map(column => column._id)).toEqual(before.map(column => column._id));
      expect(before.map(column => column._id)).not.toContain(after[2]._id);
      expect(res.body.data.columns).toHaveLength(3);
    });

    test('is saved together with the board fields in the same request', async () => {
      const before = await stored();

      const res = await save([...before, fresh('New')], owner, { title: 'Renamed board', description: 'About it' });

      expect(res.status).toBe(200);
      const saved = await Board.findById(board._id);
      expect(saved.title).toBe('Renamed board');
      expect(saved.description).toBe('About it');
      expect(saved.columns).toHaveLength(3);
    });
  });

  describe('renaming, recolouring and reordering', () => {
    test('a rename keeps the column id, so the tasks in it stay in it', async () => {
      const [first] = await boardColumns(board._id);
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first._id.toString() });
      const list = await stored();
      list[0].title = 'Inbox';

      const res = await save(list);

      expect(res.status).toBe(200);
      expect((await stored())[0]).toMatchObject({ _id: first._id.toString(), title: 'Inbox' });
      expect((await Task.findById(task._id)).status).toBe(first._id.toString());
    });

    test('a recolour changes the hue and nothing else', async () => {
      const list = await stored();
      list[1].color = hues.coral._id.toString();

      const res = await save(list);

      expect(res.status).toBe(200);
      const after = await stored();
      expect(after.map(column => column.title)).toEqual(['Backlog', 'Done']);
      expect(after[1].color).toBe(hues.coral._id.toString());
      expect(after[0].color).toBe(list[0].color);
    });

    test('a reorder swaps positions, keeps every id and leaves the tasks where they are', async () => {
      const [first, last] = await boardColumns(board._id);
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: first._id.toString() });
      const list = (await stored()).reverse();

      const res = await save(list);

      expect(res.status).toBe(200);
      const after = await stored();
      expect(after.map(column => column._id)).toEqual([last._id.toString(), first._id.toString()]);
      expect((await Task.findById(task._id)).status).toBe(first._id.toString());
    });

    test('a request without columns leaves them as they are', async () => {
      const before = await stored();

      const res = await asUser('put', `/boards/${board._id}`, owner).send({ title: 'Only the title' });

      expect(res.status).toBe(200);
      expect(await stored()).toEqual(before);
    });
  });

  describe('limits', () => {
    test('a name is trimmed before it is stored', async () => {
      const res = await save([...(await stored()), fresh('  Review  ')]);

      expect(res.status).toBe(200);
      expect((await stored()).at(-1).title).toBe('Review');
    });

    test('a name of 40 characters is accepted and one of 41 is refused', async () => {
      const before = await stored();

      expect((await save([...before, fresh('a'.repeat(41))])).status).toBe(400);
      expect(await stored()).toEqual(before);
      expect((await save([...before, fresh('a'.repeat(40))])).status).toBe(200);
    });

    test.each([['empty', ''], ['only spaces', '   ']])('a name that is %s is refused', async (_label, title) => {
      const before = await stored();

      const res = await save([...before, fresh(title)]);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await stored()).toEqual(before);
    });

    test('names are unique ignoring case, and a refused list writes nothing', async () => {
      const before = await stored();

      const res = await save([...before, fresh('BACKLOG')], owner, { title: 'Never saved' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await stored()).toEqual(before);
      expect((await Board.findById(board._id)).title).toBe('Columns');
    });

    test('a name that is only different after trimming counts as the same name', async () => {
      const before = await stored();

      expect((await save([...before, fresh('  done ')])).status).toBe(400);
    });

    test('a board has at most 8 columns', async () => {
      const before = await stored();
      const eight = [...before, ...['A', 'B', 'C', 'D', 'E', 'F'].map(fresh)];

      expect((await save(eight)).status).toBe(200);
      expect(await stored()).toHaveLength(8);

      const nine = [...(await stored()), fresh('G')];
      const res = await save(nine);

      expect(res.status).toBe(400);
      expect(await stored()).toHaveLength(8);
    });

    test('a board keeps at least 2 columns', async () => {
      const [first] = await stored();
      const before = await stored();

      const one = await save([first]);
      const none = await save([]);

      expect(one.status).toBe(400);
      expect(none.status).toBe(400);
      expect(await stored()).toEqual(before);
    });

    test('a board can be cut back to exactly 2 columns', async () => {
      await save([...(await stored()), fresh('Extra')]);

      const res = await save((await stored()).slice(0, 2));

      expect(res.status).toBe(200);
      expect(await stored()).toHaveLength(2);
    });
  });

  describe('what a column may refer to', () => {
    test('an id that is not one of the board\'s columns is refused', async () => {
      const before = await stored();
      const other = await createBoard(owner.token, colors.boardColor._id, { title: 'Other' });
      const [foreign] = await boardColumns(other._id);

      const res = await save([...before, { _id: foreign._id.toString(), title: 'Stolen', color: before[0].color }]);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await stored()).toEqual(before);
    });

    test('the same id twice is refused', async () => {
      const before = await stored();

      const res = await save([before[0], { ...before[0], title: 'Again' }]);

      expect(res.status).toBe(400);
      expect(await stored()).toEqual(before);
    });

    test.each([
      ['a task colour', () => colors.taskColor._id.toString()],
      ['an old column colour', () => colors.legacyColumnColor._id.toString()],
      ['an id that names nothing', () => 'ffffffffffffffffffffffff'],
    ])('%s is refused as a column colour', async (_label, color) => {
      const before = await stored();

      const res = await save([...before, { title: 'Painted', color: color() }]);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await stored()).toEqual(before);
    });
  });

  describe('removing a column', () => {
    let extra;

    beforeEach(async () => {
      await save([...(await stored()), fresh('Review')]);
      extra = (await stored()).find(column => column.title === 'Review');
    });

    test('removes an empty column and keeps the rest in order', async () => {
      const list = (await stored()).filter(column => column._id !== extra._id);

      const res = await save(list);

      expect(res.status).toBe(200);
      expect((await stored()).map(column => column.title)).toEqual(['Backlog', 'Done']);
    });

    test('answers 409 naming a column that still has tasks, and applies nothing', async () => {
      await createTask(owner.token, board._id, colors.taskColor._id, { status: extra._id });
      const before = await stored();
      const list = before.filter(column => column._id !== extra._id);

      const res = await save(list, owner, { title: 'Never saved' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
      expect(res.body.message).toContain('"Review"');
      expect(res.body.errors).toEqual([{ columnId: extra._id, title: 'Review' }]);
      expect(await stored()).toEqual(before);
      expect((await Board.findById(board._id)).title).toBe('Columns');
    });

    test('is all or nothing when one change is allowed and another is not', async () => {
      await createTask(owner.token, board._id, colors.taskColor._id, { status: extra._id });
      const before = await stored();
      const [first, last] = before;
      // A rename, a recolour, a new column and a removal of a column with a task.
      const list = [{ ...first, title: 'Renamed', color: hues.coral._id.toString() }, last, fresh('Brand new')];

      const res = await save(list);

      expect(res.status).toBe(409);
      expect(await stored()).toEqual(before);
    });

    test('is not blocked by a deleted task, which stays in the trash', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: extra._id });
      await asUser('delete', `/tasks/${task._id}`, owner);

      const res = await save((await stored()).filter(column => column._id !== extra._id));

      expect(res.status).toBe(200);
      expect(await stored()).toHaveLength(2);
      expect((await Task.findById(task._id)).deletedAt).toBeInstanceOf(Date);
    });

    test('is allowed once the tasks have been moved out', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: extra._id });
      const [first] = await stored();
      await asUser('patch', `/tasks/${task._id}/move`, owner).send({ status: first._id });

      const res = await save((await stored()).filter(column => column._id !== extra._id));

      expect(res.status).toBe(200);
    });
  });

  describe('a task whose column was removed', () => {
    let extra;
    let task;

    beforeEach(async () => {
      await save([...(await stored()), fresh('Review')]);
      extra = (await stored()).find(column => column.title === 'Review');
      task = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Gone column', status: extra._id });
      await asUser('delete', `/tasks/${task._id}`, owner);
      await save((await stored()).filter(column => column._id !== extra._id));
    });

    test('is restored into the first column, at the bottom of it', async () => {
      const [first] = await stored();
      const resident = await createTask(owner.token, board._id, colors.taskColor._id, { status: first._id });

      const res = await asUser('post', `/tasks/${task._id}/restore`, owner);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(first._id);
      expect(res.body.data.order > resident.order).toBe(true);

      const onBoard = await asUser('get', `/tasks/board/${board._id}`, owner);
      expect(onBoard.body.data.map(item => item.title)).toContain('Gone column');
    });

    test('stays in the trash, whole, until its own retention runs out', async () => {
      expect(await purgeExpiredTasks({ retentionMs: RETENTION_MS })).toBe(0);
      expect(await Task.exists({ _id: task._id })).toBeTruthy();

      await Task.updateOne({ _id: task._id }, { deletedAt: new Date(Date.now() - RETENTION_MS - DAY_MS) });
      expect(await purgeExpiredTasks({ retentionMs: RETENTION_MS })).toBe(1);
      expect(await Task.exists({ _id: task._id })).toBeNull();
    });

    test('is restored where it was while its column still exists', async () => {
      const [first, last] = await stored();
      const kept = await createTask(owner.token, board._id, colors.taskColor._id, { status: last._id });
      await asUser('delete', `/tasks/${kept._id}`, owner);

      const res = await asUser('post', `/tasks/${kept._id}/restore`, owner);

      expect(res.body.data.status).toBe(last._id);
      expect(res.body.data.order).toBe(kept.order);
      expect(first._id).not.toBe(last._id);
    });
  });

  describe('who may change columns', () => {
    test('a member is refused and nothing changes', async () => {
      const member = await registerUser();
      await asUser('patch', `/boards/${board._id}/members`, owner).send({ members: [idOf(member)] });
      const before = await stored();

      const res = await save([...before, fresh('Sneaky')], member);

      expect(res.status).toBe(403);
      expect(await stored()).toEqual(before);
    });

    test('somebody with no role on the board is refused and nothing changes', async () => {
      const stranger = await registerUser();
      const before = await stored();

      const res = await save([...before, fresh('Sneaky')], stranger);

      expect([403, 404]).toContain(res.status);
      expect(await stored()).toEqual(before);
    });

    test('a deleted board cannot have its columns edited', async () => {
      const before = await stored();
      await asUser('delete', `/boards/${board._id}`, owner);

      const res = await save([...before, fresh('Too late')]);

      expect(res.status).toBe(404);
      expect(await stored()).toEqual(before);
    });
  });
});
