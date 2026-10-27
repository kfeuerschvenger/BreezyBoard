import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { describe, expect, test } from 'vitest';
import Board from '../src/models/Board.js';
import BoardTemplate from '../src/models/BoardTemplate.js';
import ColorPalette from '../src/models/ColorPalette.js';
import Task from '../src/models/Task.js';
import User from '../src/models/User.js';
import Workspace from '../src/models/Workspace.js';
import { BOARD_HUES } from '../src/constants/boardHues.js';
import { DEMO_BOARDS, DEMO_EMAIL, DEMO_PEOPLE } from '../seeds/demo/demoData.js';
import { seedDemo } from '../seeds/demo/seedDemo.js';

const backDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Demo-pass-1';

/** Runs the demo seed as a real process, the way `npm run seed:demo` does, against the test database. */
const runDemoSeed = ({ nodeEnv = 'test', password, mongoUri } = {}) => {
  const env = { ...process.env, NODE_ENV: nodeEnv };

  delete env.DEMO_PASSWORD;

  if (password !== undefined) {
    env.DEMO_PASSWORD = password;
  }

  if (mongoUri !== undefined) {
    env.MONGODB_URI = mongoUri;
  }

  return spawnSync(process.execPath, [path.join('seeds', 'demo.seed.js')], {
    cwd: backDir,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
};

/** The colours and templates the seed draws on, written the way the reference seed writes them. */
const seedReferenceData = async () => {
  const hues = await ColorPalette.insertMany(BOARD_HUES.map(hue => ({ name: hue, value: hue, type: 'board' })));
  await ColorPalette.insertMany(
    [
      ['Coral', '#FF6B6B'],
      ['Teal', '#4ECDC4'],
      ['Aqua', '#45B7D1'],
    ].map(([name, value]) => ({ name, value, type: 'task' }))
  );

  const names = new Set(DEMO_BOARDS.map(board => board.template));

  for (const name of names) {
    await BoardTemplate.create({
      name,
      iconName: 'Folder',
      columns: [{ title: 'Only', color: hues[0]._id, order: 0 }],
    });
  }
};

/** Every document the demo owns, without what is random on purpose: the password hash. */
const snapshot = async () => {
  const users = await User.find().select('+password').sort({ email: 1 }).lean();

  return JSON.stringify({
    users: users.map(user => ({ ...user, password: undefined })),
    workspaces: await Workspace.find().sort({ _id: 1 }).lean(),
    boards: await Board.find().sort({ _id: 1 }).lean(),
    tasks: await Task.find().sort({ _id: 1 }).lean(),
  });
};

describe('seeds/demo.seed.js', () => {
  test('fails and touches nothing when DEMO_PASSWORD is not set', async () => {
    await User.create({ firstName: 'keep', lastName: 'me', email: 'keep@breezyboard.local', password: 'hash' });

    const result = runDemoSeed();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DEMO_PASSWORD');
    expect(await User.countDocuments()).toBe(1);
  });

  test('fails when DEMO_PASSWORD is shorter than the registration minimum', () => {
    const result = runDemoSeed({ password: 'short' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DEMO_PASSWORD');
  });

  test.each(['production', 'staging'])('is refused by the seed guard when NODE_ENV is %s', async nodeEnv => {
    const result = runDemoSeed({ nodeEnv, password: PASSWORD });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Refusing to seed/);
    expect(await User.countDocuments()).toBe(0);
  });

  test('is refused by the seed guard against a database that is not local', async () => {
    const result = runDemoSeed({
      password: PASSWORD,
      mongoUri: 'mongodb://sentinel-user:sentinel-pass@db.remote.example:27017/boards-db',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not local/);
    expect(result.stderr).not.toContain('sentinel-pass');
    expect(await User.countDocuments()).toBe(0);
  });

  test('says which seed to run when the reference data is missing', () => {
    const result = runDemoSeed({ password: PASSWORD });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('seed:templates');
  });

  test('seeds the demo workspace when run as a process', async () => {
    await seedReferenceData();

    const result = runDemoSeed({ password: PASSWORD });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(DEMO_EMAIL);
    expect(await Board.countDocuments()).toBe(DEMO_BOARDS.length);
  }, 90_000);
});

describe('seedDemo', () => {
  const seed = () => seedDemo({ password: PASSWORD, saltRounds: 4 });

  test('creates the demo account with the given password, one workspace and every board and card', async () => {
    await seedReferenceData();
    await seed();

    const demo = await User.findOne({ email: DEMO_EMAIL }).select('+password');

    expect(demo.toJSON().firstName).toBe('Ada');
    expect(await bcrypt.compare(PASSWORD, demo.password)).toBe(true);
    expect(demo.avatar).toMatch(/^data:image\/svg\+xml,/);
    expect(await User.countDocuments()).toBe(DEMO_PEOPLE.length);
    expect(await Workspace.countDocuments()).toBe(1);
    expect(await Board.countDocuments()).toBe(DEMO_BOARDS.length);
    expect(await Task.countDocuments()).toBe(DEMO_BOARDS.reduce((total, board) => total + board.tasks.length, 0));
  });

  test('puts cards in every column, the last one included, and files each under a column of its own board', async () => {
    await seedReferenceData();
    await seed();

    for (const board of await Board.find()) {
      const ids = board.columns.map(column => column._id.toString());
      const tasks = await Task.find({ boardId: board._id });
      const last = [...board.columns].sort((a, b) => a.order - b.order).at(-1);

      expect(tasks.every(task => ids.includes(task.status))).toBe(true);
      expect(new Set(tasks.map(task => task.status)).size).toBe(board.columns.length);
      expect(tasks.some(task => task.status === last._id.toString())).toBe(true);
    }
  });

  test('uses every priority, assigns cards and gives some a checklist', async () => {
    await seedReferenceData();
    await seed();

    expect(new Set((await Task.find()).map(task => task.priority))).toEqual(new Set(['low', 'medium', 'high']));
    expect(await Task.countDocuments({ owner: { $exists: true } })).toBeGreaterThan(0);
    expect(await Task.countDocuments({ 'checklist.0': { $exists: true } })).toBeGreaterThan(0);
  });

  test('is deterministic: a second run leaves exactly the documents the first one did', async () => {
    await seedReferenceData();

    await seed();
    const first = await snapshot();

    await seed();
    const second = await snapshot();

    expect(second).toBe(first);
    expect(await Board.countDocuments()).toBe(DEMO_BOARDS.length);
  });

  test('does not read the clock: every timestamp is a fixed instant', async () => {
    await seedReferenceData();
    await seed();

    const stamps = (await Task.find()).flatMap(task => [task.createdAt, task.updatedAt]);

    expect(stamps.every(stamp => stamp.getUTCFullYear() === 2026)).toBe(true);
  });

  test('deletes only the demo accounts data and leaves everyone else untouched', async () => {
    await seedReferenceData();

    const other = await User.create({ firstName: 'other', lastName: 'person', email: 'other@breezyboard.local', password: 'hash' });
    const otherWorkspace = await Workspace.create({
      name: 'Other',
      createdBy: other._id,
      isPersonal: true,
      members: [{ user: other._id, role: 'admin' }],
    });
    const color = await ColorPalette.findOne({ type: 'board' });
    const otherBoard = await Board.create({
      title: 'Other board',
      color: color._id,
      workspaceId: otherWorkspace._id,
      createdBy: other._id,
      members: [other._id],
      columns: [{ title: 'Only', color: color._id, order: 0 }],
    });
    await Task.create({
      title: 'Other task',
      status: otherBoard.columns[0]._id.toString(),
      color: (await ColorPalette.findOne({ type: 'task' }))._id,
      boardId: otherBoard._id,
      order: 'a0',
    });

    await seed();
    await seed();

    expect(await User.findById(other._id)).not.toBeNull();
    expect(await Workspace.findById(otherWorkspace._id)).not.toBeNull();
    expect(await Board.findById(otherBoard._id)).not.toBeNull();
    expect(await Task.countDocuments({ boardId: otherBoard._id })).toBe(1);
    expect(await User.countDocuments()).toBe(DEMO_PEOPLE.length + 1);
  });

  test('refuses with the seed to run when the reference data is missing, and deletes nothing', async () => {
    await User.create({ firstName: 'ada', lastName: 'gale', email: DEMO_EMAIL, password: 'hash' });

    await expect(seed()).rejects.toThrow(/seed:templates/);
    expect(await User.countDocuments({ email: DEMO_EMAIL })).toBe(1);
  });
});
