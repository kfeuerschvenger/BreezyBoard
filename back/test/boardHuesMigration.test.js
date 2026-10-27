import mongoose from 'mongoose';
import { beforeEach, describe, expect, test } from 'vitest';
import Board from '../src/models/Board.js';
import ColorPalette from '../src/models/ColorPalette.js';
import { migrateBoardHues } from '../src/migrations/boardHues.js';
import { seedColorsAndTemplates } from './helpers/seed.js';

// The old board palette, written straight to the collection: the model no
// longer accepts a hex board colour, which is the point of the migration.
const LEGACY = [
  ['Royal Blue', '#0052CC', 'sky'],
  ['Purple', '#6B3FA0', 'lavender'],
  ['Emerald', '#2F9E44', 'green'],
  ['Orange', '#FF9700', 'sand'],
  ['Teal', '#0CA678', 'green'],
  ['Pink', '#F783AC', 'coral'],
  ['Amber', '#F08A24', 'coral'],
  ['Cyan', '#00B4D8', 'sky'],
];

const insertBoard = async (color, overrides = {}) => {
  const id = new mongoose.Types.ObjectId();
  await Board.collection.insertOne({
    _id: id,
    title: 'Board',
    color,
    columns: [],
    members: [],
    workspaceId: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
    deletedAt: null,
    ...overrides,
  });
  return id;
};

const hueOf = async boardId => {
  const board = await Board.findById(boardId).populate('color', 'value');
  return board.color?.value ?? null;
};

describe('board hue migration', () => {
  let legacy;

  beforeEach(async () => {
    legacy = {};
    for (const [name, value, hue] of LEGACY) {
      const { insertedId } = await ColorPalette.collection.insertOne({ name, value, type: 'board' });
      legacy[value] = { id: insertedId, hue };
    }
  });

  test('moves each board onto the hue nearest its old colour', async () => {
    const boards = {};
    for (const value of Object.keys(legacy)) {
      boards[value] = await insertBoard(legacy[value].id);
    }

    await migrateBoardHues();

    for (const value of Object.keys(legacy)) {
      expect(await hueOf(boards[value]), value).toBe(legacy[value].hue);
    }
  });

  test('leaves the palette holding the six hues as the only board colours', async () => {
    await insertBoard(legacy['#0052CC'].id);

    const result = await migrateBoardHues();

    const board = await ColorPalette.find({ type: 'board' }).lean();
    expect(board.map(entry => entry.value).sort()).toEqual(['coral', 'green', 'lavender', 'sand', 'sky', 'teal']);
    expect(result.hueEntriesCreated).toBe(6);
    expect(result.legacyEntriesRemoved).toBe(8);
  });

  test('migrates a board in the deleted state, so a restore brings back a board on the new palette', async () => {
    const deleted = await insertBoard(legacy['#2F9E44'].id, { deletedAt: new Date() });

    await migrateBoardHues();

    expect(await hueOf(deleted)).toBe('green');
  });

  test('gives a board whose colour names nothing the default hue', async () => {
    const orphan = await insertBoard(new mongoose.Types.ObjectId());
    const colourless = await insertBoard(null);

    const result = await migrateBoardHues();

    expect(await hueOf(orphan)).toBe('sky');
    expect(await hueOf(colourless)).toBe('sky');
    expect(result.fromMissing).toBe(2);
  });

  test('gives a board painted with a task colour the default hue', async () => {
    const { taskColor } = await seedColorsAndTemplates();
    const board = await insertBoard(taskColor._id);

    await migrateBoardHues();

    expect(await hueOf(board)).toBe('sky');
  });

  test('leaves task and column colours alone', async () => {
    const { taskColor, legacyColumnColor } = await seedColorsAndTemplates();

    await migrateBoardHues();

    expect(await ColorPalette.exists({ _id: taskColor._id })).toBeTruthy();
    expect(await ColorPalette.exists({ _id: legacyColumnColor._id })).toBeTruthy();
  });

  test('reports how many boards sit on each hue', async () => {
    await insertBoard(legacy['#0052CC'].id);
    await insertBoard(legacy['#00B4D8'].id);
    await insertBoard(legacy['#6B3FA0'].id);
    await insertBoard(new mongoose.Types.ObjectId());

    const result = await migrateBoardHues();

    expect(result.perHue).toEqual({ sky: 3, teal: 0, green: 0, sand: 0, coral: 0, lavender: 1 });
    expect(result.fromLegacy).toBe(3);
    expect(result.fromMissing).toBe(1);
  });

  test('is idempotent: a second run changes nothing', async () => {
    await insertBoard(legacy['#F783AC'].id);
    await insertBoard(new mongoose.Types.ObjectId());

    const first = await migrateBoardHues();
    const snapshot = await Board.find().lean();
    const second = await migrateBoardHues();

    expect(second).toEqual({
      perHue: first.perHue,
      fromLegacy: 0,
      fromMissing: 0,
      legacyEntriesRemoved: 0,
      hueEntriesCreated: 0,
    });
    expect(await Board.find().lean()).toEqual(snapshot);
    expect(await ColorPalette.countDocuments({ type: 'board' })).toBe(6);
  });

  test('keeps the hue entries it finds instead of creating a second set', async () => {
    const sky = await ColorPalette.create({ name: 'Sky', value: 'sky', type: 'board' });
    const board = await insertBoard(legacy['#0052CC'].id);

    await migrateBoardHues();

    const board2 = await Board.findById(board);
    expect(board2.color.toString()).toBe(sky._id.toString());
    expect(await ColorPalette.countDocuments({ value: 'sky' })).toBe(1);
  });
});
