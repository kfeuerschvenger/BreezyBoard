import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { generateKeyBetween } from 'fractional-indexing';
import mongoose from 'mongoose';
import Board from '../../src/models/Board.js';
import BoardTemplate from '../../src/models/BoardTemplate.js';
import ColorPalette from '../../src/models/ColorPalette.js';
import Task from '../../src/models/Task.js';
import User from '../../src/models/User.js';
import Workspace from '../../src/models/Workspace.js';
import { ANCHOR, DEMO_BOARDS, DEMO_PEOPLE, DEMO_WORKSPACE_NAME, boardOffset, taskOffset } from './demoData.js';

/**
 * An ObjectId derived from a name, so the same demo document has the same id
 * on every run and in every database. A board's address is then stable, which
 * is what lets a screenshot script and a link in the documentation point at it.
 */
const stableId = name => new mongoose.Types.ObjectId(createHash('sha1').update(`breezyboard-demo:${name}`).digest('hex').slice(0, 24));

/**
 * Removes the demo account, its teammates and everything they own, and nothing
 * else. The accounts are found by their fixed addresses, and the boards and
 * tasks by those accounts: another person's data is never matched.
 */
const wipeDemo = async () => {
  const people = await User.find({ email: { $in: DEMO_PEOPLE.map(person => person.email) } }).select('_id');
  const peopleIds = people.map(person => person._id);

  const workspaces = await Workspace.find({ createdBy: { $in: peopleIds } }).select('_id');
  const workspaceIds = workspaces.map(workspace => workspace._id);

  const boards = await Board.find({
    $or: [{ createdBy: { $in: peopleIds } }, { workspaceId: { $in: workspaceIds } }],
  }).select('_id');
  const boardIds = boards.map(board => board._id);

  await Task.deleteMany({ boardId: { $in: boardIds } });
  await Board.deleteMany({ _id: { $in: boardIds } });
  await Workspace.deleteMany({ _id: { $in: workspaceIds } });
  await User.deleteMany({ _id: { $in: peopleIds } });
};

/** The reference data the demo is drawn from, or an error that says which seed to run. */
const loadReferenceData = async () => {
  const hues = await ColorPalette.find({ type: 'board' });
  const taskColors = await ColorPalette.find({ type: 'task' }).sort({ name: 1 });
  const templates = await BoardTemplate.find();

  if (hues.length === 0 || taskColors.length === 0 || templates.length === 0) {
    throw new Error('The colours and board templates are missing. Run `npm run seed:templates` first.');
  }

  return {
    hueId: new Map(hues.map(hue => [hue.value, hue._id])),
    taskColors,
    templateId: new Map(templates.map(template => [template.name, template._id])),
  };
};

/**
 * Replaces the demo workspace with a freshly built copy of it.
 *
 * Deterministic: the content, the ids and the timestamps are fixed, so two runs
 * leave the same documents behind. Only the demo accounts' data is deleted
 * before the copy is written.
 *
 * @param {{ password: string, saltRounds: number }} options The shared password of the demo accounts, in the clear.
 * @returns {Promise<{ user: object, workspace: object, boards: number, tasks: number }>}
 */
export const seedDemo = async ({ password, saltRounds }) => {
  const reference = await loadReferenceData();

  await wipeDemo();

  const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(saltRounds));

  const people = new Map();

  for (const person of DEMO_PEOPLE) {
    const { key, ...fields } = person;
    const created = await User.create({
      _id: stableId(`user:${key}`),
      ...fields,
      password: hashedPassword,
      createdAt: new Date(ANCHOR),
      updatedAt: new Date(ANCHOR),
    });
    people.set(key, created);
  }

  const ada = people.get('ada');

  // One workspace holds everything, and it is the owner's personal one: that
  // is the workspace the application files a new board in. Teammates are
  // members, so the boards list them.
  const workspace = await Workspace.create({
    _id: stableId('workspace'),
    name: DEMO_WORKSPACE_NAME,
    createdBy: ada._id,
    isPersonal: true,
    members: [...people.entries()].map(([key, user]) => ({ user: user._id, role: key === 'ada' ? 'admin' : 'member' })),
    createdAt: new Date(ANCHOR),
    updatedAt: new Date(ANCHOR),
  });

  let taskTotal = 0;

  for (const [boardIndex, definition] of DEMO_BOARDS.entries()) {
    const createdAt = new Date(ANCHOR + boardOffset(boardIndex));

    const columns = definition.columns.map(([title, hue], order) => ({
      _id: stableId(`column:${definition.key}:${order}`),
      title,
      color: reference.hueId.get(hue),
      order,
    }));

    const board = await Board.create({
      _id: stableId(`board:${definition.key}`),
      title: definition.title,
      description: definition.description,
      color: reference.hueId.get(definition.hue),
      template: reference.templateId.get(definition.template) ?? null,
      columns,
      workspaceId: workspace._id,
      createdBy: ada._id,
      members: [...people.values()].map(user => user._id),
      createdAt,
      updatedAt: createdAt,
    });

    // The key that follows the last one written in each column, so a column
    // reads in the order it is listed in.
    const lastKey = new Map();

    for (const [taskIndex, [title, columnIndex, priority, ownerKey, options = {}]] of definition.tasks.entries()) {
      const order = generateKeyBetween(lastKey.get(columnIndex) ?? null, null);
      lastKey.set(columnIndex, order);

      const stamp = new Date(ANCHOR + taskOffset(boardIndex, taskIndex));

      await Task.create({
        _id: stableId(`task:${definition.key}:${taskIndex}`),
        title,
        description: options.description,
        status: columns[columnIndex]._id.toString(),
        priority,
        color: reference.taskColors[taskIndex % reference.taskColors.length]._id,
        owner: ownerKey ? people.get(ownerKey)._id : undefined,
        boardId: board._id,
        checklist: (options.checklist ?? []).map(([text, completed], itemIndex) => ({
          _id: stableId(`item:${definition.key}:${taskIndex}:${itemIndex}`),
          text,
          completed,
        })),
        order,
        createdAt: stamp,
        updatedAt: stamp,
      });

      taskTotal += 1;
    }
  }

  return { user: ada, workspace, boards: DEMO_BOARDS.length, tasks: taskTotal };
};
