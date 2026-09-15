import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

describe('dashboard statistics', () => {
  let colors;
  let owner;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
  });

  const stats = async token => {
    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    return res.body.data;
  };

  test('an account with nothing on it reports zeroes rather than dividing by zero', async () => {
    expect(await stats(owner.token)).toMatchObject({
      totalBoards: 0,
      totalTasks: 0,
      avgProgress: 0,
    });
  });

  test('average progress counts tasks in the last column as done', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);
    const columns = await boardColumns(board._id);
    const done = columns[columns.length - 1]._id.toString();

    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Still to do' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Also to do' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Finished', status: done });

    // One of three, so 33. The old code answered 0 here no matter what,
    // because it summed a virtual that lean queries strip and whose
    // completion test compared a column id to the literal 'done'.
    expect(await stats(owner.token)).toMatchObject({ totalBoards: 1, totalTasks: 3, avgProgress: 33 });
  });

  test('a fully ticked checklist counts as done wherever the task sits', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Everything ticked',
      checklist: [
        { text: 'One', completed: true },
        { text: 'Two', completed: true },
      ],
    });
    await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Partly ticked',
      checklist: [
        { text: 'One', completed: true },
        { text: 'Two', completed: false },
      ],
    });

    expect(await stats(owner.token)).toMatchObject({ totalTasks: 2, avgProgress: 50 });
  });

  test('a task with no checklist at all is not mistaken for a completed one', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'No checklist' });

    // An empty checklist satisfies "every item is ticked" vacuously, which is
    // the obvious way to write this rule and the wrong one: it would report
    // every board with no checklists anywhere as a hundred percent done.
    expect(await stats(owner.token)).toMatchObject({ totalTasks: 1, avgProgress: 0 });
  });

  test('the average is over boards, so an empty board drags it down', async () => {
    const finished = await createBoard(owner.token, colors.boardColor._id, { title: 'Finished board' });
    const columns = await boardColumns(finished._id);
    await createTask(owner.token, finished._id, colors.taskColor._id, {
      title: 'Done',
      status: columns[columns.length - 1]._id.toString(),
    });

    await createBoard(owner.token, colors.boardColor._id, { title: 'Empty board' });

    // 100 and 0 across two boards. Leaving the empty one out would report
    // this account as finished, which it plainly is not.
    expect(await stats(owner.token)).toMatchObject({ totalBoards: 2, avgProgress: 50 });
  });

  test('the board list carries the same counts the cards render', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);
    const columns = await boardColumns(board._id);

    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Open' });
    await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Closed',
      status: columns[columns.length - 1]._id.toString(),
    });

    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${owner.token}`);
    const listed = res.body.data.find(entry => entry._id === board._id);

    // All three were rendered as zero by the dashboard cards: taskCount was
    // a populate virtual nothing populated, progress was the broken one, and
    // only memberCount ever worked because it is a plain getter.
    expect(listed.taskCount).toBe(2);
    expect(listed.progress).toBe(50);
    expect(listed.memberCount).toBe(1);
  });
});
