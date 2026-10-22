import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Board from '../src/models/Board.js';
import Task from '../src/models/Task.js';
import Workspace from '../src/models/Workspace.js';
import { addBoardMembers, deleteBoard, updateBoard } from '../src/services/board.service.js';
import { createTask as createTaskRecord, moveTask, updateTask } from '../src/services/task.service.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

// The authorization middleware reads the board and then the service writes.
// A delete can land between the two, so these call the services directly on a
// board that is already deleted, which is the state the write sees.
describe('writes to a board deleted after the authorization read', () => {
  let colors;
  let owner;
  let other;
  let board;
  let task;
  let columns;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    other = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id, { title: 'Doomed' });
    columns = await boardColumns(board._id);
    task = await createTask(owner.token, board._id, colors.taskColor._id);
    await deleteBoard(board._id);
  });

  test('updateBoard is a 404 and changes nothing', async () => {
    await expect(updateBoard(board._id, { title: 'Edited after delete' })).rejects.toMatchObject({ statusCode: 404 });

    expect((await Board.findById(board._id)).title).toBe('Doomed');
  });

  test('addBoardMembers is a 404 and adds nobody', async () => {
    const before = (await Board.findById(board._id)).members.length;

    await expect(addBoardMembers(board._id, [other.user.id ?? other.user._id])).rejects.toMatchObject({
      statusCode: 404,
    });

    expect((await Board.findById(board._id)).members).toHaveLength(before);
    // The workspace grant that precedes the write must not happen either.
    const workspace = await Workspace.findById(board.workspaceId);
    expect(workspace.members.map(member => String(member.user))).not.toContain(String(other.user.id ?? other.user._id));
  });

  describe('when the delete lands after the service has read the board', () => {
    afterEach(() => vi.restoreAllMocks());

    test('the member write itself still refuses, because its own filter excludes the deleted board', async () => {
      // The lookup before the write answers as it would have a moment before
      // the delete, so only the filter on the write can stop it.
      const workspaceId = (await Board.findById(board._id)).workspaceId;
      vi.spyOn(Board, 'findOne').mockReturnValueOnce({ select: async () => ({ workspaceId }) });

      await expect(addBoardMembers(board._id, [other.user.id ?? other.user._id])).rejects.toMatchObject({
        statusCode: 404,
      });

      expect((await Board.findById(board._id)).members.map(String)).not.toContain(String(other.user.id ?? other.user._id));
    });
  });

  test('creating a task is a 404 and writes none', async () => {
    const before = await Task.countDocuments({ boardId: board._id });

    await expect(
      createTaskRecord({ boardId: board._id, title: 'Late', status: String(columns[0]._id), color: colors.taskColor._id })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await Task.countDocuments({ boardId: board._id })).toBe(before);
  });

  test('creating a task with an owner is a 404 as well', async () => {
    await expect(
      createTaskRecord({
        boardId: board._id,
        title: 'Late',
        status: String(columns[0]._id),
        color: colors.taskColor._id,
        owner: owner.user.id ?? owner.user._id,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('moving a task or changing its column is a 404', async () => {
    const last = String(columns[columns.length - 1]._id);

    await expect(moveTask(task._id, last)).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateTask(task._id, { status: last })).rejects.toMatchObject({ statusCode: 404 });

    expect(String((await Task.findById(task._id)).status)).toBe(String(columns[0]._id));
  });
});
