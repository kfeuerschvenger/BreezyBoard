import mongoose from 'mongoose';
import { beforeEach, describe, expect, test } from 'vitest';
import Board from '../src/models/Board.js';
import BoardTemplate from '../src/models/BoardTemplate.js';
import ColorPalette from '../src/models/ColorPalette.js';
import { migrateColumnHues } from '../src/migrations/columnHues.js';

// The old column palette, written straight to the collection: a hex value is
// what a database that was never migrated holds, and what the model refuses.
const LEGACY = [
  ['Slate', '#64748B', 'sky'],
  ['Blue', '#3B82F6', 'sky'],
  ['Amber', '#F59E0B', 'sand'],
  ['Emerald', '#10B981', 'green'],
  ['Violet', '#7C3AED', 'lavender'],
  ['Orange', '#F97316', 'coral'],
  ['Pink', '#F472B6', 'coral'],
  ['Gray', '#6B7280', 'sky'],
];

const column = (title, color, order) => ({ _id: new mongoose.Types.ObjectId(), title, color, order });

const insertBoard = async (columns, overrides = {}) => {
  const id = new mongoose.Types.ObjectId();
  await Board.collection.insertOne({
    _id: id,
    title: 'Board',
    color: new mongoose.Types.ObjectId(),
    columns,
    members: [],
    workspaceId: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
    deletedAt: null,
    ...overrides,
  });
  return id;
};

const insertTemplate = async (columns, name = 'Template') => {
  const id = new mongoose.Types.ObjectId();
  await BoardTemplate.collection.insertOne({ _id: id, name, columns });
  return id;
};

const huesOf = async (Model, id) => {
  const document = await Model.findById(id).populate('columns.color', 'value');
  return document.columns.map(item => item.color?.value ?? null);
};

describe('column hue migration', () => {
  let legacy;

  beforeEach(async () => {
    legacy = {};
    for (const [name, value, hue] of LEGACY) {
      const { insertedId } = await ColorPalette.collection.insertOne({ name, value, type: 'column' });
      legacy[value] = { id: insertedId, hue };
    }
  });

  test('moves each column onto the hue nearest its old colour', async () => {
    const columns = Object.entries(legacy).map(([value, { id }], index) => column(value, id, index));
    const boardId = await insertBoard(columns);

    await migrateColumnHues();

    expect(await huesOf(Board, boardId)).toEqual(Object.values(legacy).map(item => item.hue));
  });

  test('keeps the id, the title and the order of every column', async () => {
    const columns = [column('Backlog', legacy['#64748B'].id, 0), column('Done', legacy['#10B981'].id, 1)];
    const boardId = await insertBoard(columns);

    await migrateColumnHues();

    const after = (await Board.findById(boardId)).columns;
    expect(after.map(item => [item._id.toString(), item.title, item.order])).toEqual(
      columns.map(item => [item._id.toString(), item.title, item.order])
    );
  });

  test('leaves the palette without a column entry and with the six hues', async () => {
    await insertBoard([column('Backlog', legacy['#64748B'].id, 0)]);

    const result = await migrateColumnHues();

    expect(await ColorPalette.countDocuments({ type: 'column' })).toBe(0);
    expect((await ColorPalette.find({ type: 'board' }).lean()).map(entry => entry.value).sort()).toEqual([
      'coral',
      'green',
      'lavender',
      'sand',
      'sky',
      'teal',
    ]);
    expect(result.legacyEntriesRemoved).toBe(8);
    expect(result.hueEntriesCreated).toBe(6);
  });

  test('migrates a board in the deleted state, so a restore brings back a board on the new palette', async () => {
    const deleted = await insertBoard([column('Done', legacy['#10B981'].id, 0)], { deletedAt: new Date() });

    await migrateColumnHues();

    expect(await huesOf(Board, deleted)).toEqual(['green']);
  });

  test('migrates the columns of a template, so a board created later starts on the new palette', async () => {
    const template = await insertTemplate([column('Ideas', legacy['#7C3AED'].id, 0), column('Done', legacy['#10B981'].id, 1)]);

    await migrateColumnHues();

    expect(await huesOf(BoardTemplate, template)).toEqual(['lavender', 'green']);
  });

  test('gives a column whose colour entry is gone, or that has none, the default hue', async () => {
    const dangling = column('Dangling', new mongoose.Types.ObjectId(), 0);
    const bare = { _id: new mongoose.Types.ObjectId(), title: 'Bare', order: 1 };
    const boardId = await insertBoard([dangling, bare]);

    const result = await migrateColumnHues();

    expect(await huesOf(Board, boardId)).toEqual(['sky', 'sky']);
    expect(result.fromMissing).toBe(2);
    expect(result.fromLegacy).toBe(0);
  });

  test('leaves a column that already sits on a hue exactly as it is', async () => {
    const { insertedId } = await ColorPalette.collection.insertOne({ name: 'Teal', value: 'teal', type: 'board' });
    const boardId = await insertBoard([column('Mine', insertedId, 0)]);

    const result = await migrateColumnHues();

    expect(await huesOf(Board, boardId)).toEqual(['teal']);
    expect(result.fromLegacy + result.fromMissing).toBe(0);
    expect(result.hueEntriesCreated).toBe(5);
  });

  test('does not move the update date of a board, which the board list sorts by', async () => {
    const updatedAt = new Date('2024-01-02T03:04:05Z');
    const boardId = await insertBoard([column('Backlog', legacy['#64748B'].id, 0)], { updatedAt });

    await migrateColumnHues();

    expect((await Board.findById(boardId)).updatedAt).toEqual(updatedAt);
  });

  test('is idempotent: a second run changes nothing', async () => {
    const boardId = await insertBoard([
      column('Backlog', legacy['#64748B'].id, 0),
      column('Done', legacy['#10B981'].id, 1),
    ]);
    await insertTemplate([column('Ideas', legacy['#7C3AED'].id, 0)]);

    const first = await migrateColumnHues();
    const snapshot = JSON.stringify((await Board.findById(boardId).lean()).columns);
    const second = await migrateColumnHues();

    expect(first.fromLegacy).toBe(3);
    expect(second).toMatchObject({ fromLegacy: 0, fromMissing: 0, legacyEntriesRemoved: 0, hueEntriesCreated: 0 });
    expect(JSON.stringify((await Board.findById(boardId).lean()).columns)).toBe(snapshot);
  });

  test('reports how many columns sit on each hue', async () => {
    await insertBoard([column('A', legacy['#64748B'].id, 0), column('B', legacy['#3B82F6'].id, 1)]);
    await insertBoard([column('C', legacy['#7C3AED'].id, 0)]);
    await insertTemplate([column('D', legacy['#10B981'].id, 0)]);

    const result = await migrateColumnHues();

    expect(result.perHue).toEqual({ sky: 2, teal: 0, green: 1, sand: 0, coral: 0, lavender: 1 });
    expect(result.fromLegacy).toBe(4);
  });

  test('leaves a board without columns alone', async () => {
    const boardId = await insertBoard([]);

    await expect(migrateColumnHues()).resolves.toBeDefined();

    expect((await Board.findById(boardId)).columns).toHaveLength(0);
  });
});
