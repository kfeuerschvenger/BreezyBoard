import Board from '../models/Board.js';
import BoardTemplate from '../models/BoardTemplate.js';
import ColorPalette from '../models/ColorPalette.js';
import { BOARD_HUES, DEFAULT_BOARD_HUE, isBoardHue, nearestBoardHue } from '../constants/boardHues.js';
import { ensureHueEntries } from './boardHues.js';

/**
 * Moves every column onto the six design hues.
 *
 * A column's colour is one of the six hue entries a board's own colour comes
 * from, stored on the column and chosen by the owner: it is not derived from
 * the column's position. A database that predates this holds a hex entry of
 * the `column` palette on each column instead. This does three things in
 * order:
 *
 * 1. Makes sure the six hue entries exist in the palette.
 * 2. Points every column of every board and every template at the hue nearest
 *    its old colour on the colour wheel. A column whose colour entry is gone,
 *    or that has none, gets the default hue, since nothing says what it was
 *    meant to be.
 * 3. Removes the old `column` entries once nothing points at them.
 *
 * It can run any number of times. A second run finds every column on a hue
 * entry and no old entry left, and changes nothing. Boards in the deleted
 * state are migrated too, so a restore brings back a board already on the new
 * palette, and the templates are, so a board created afterwards starts on it.
 *
 * Boards and templates are read and written as plain documents: an old colour
 * entry holds a hex value, which the palette model refuses to save, and a
 * column may carry no colour at all, which the column schema refuses.
 *
 * @returns {Promise<{
 *   perHue: Record<string, number>,
 *   fromLegacy: number,
 *   fromMissing: number,
 *   legacyEntriesRemoved: number,
 *   hueEntriesCreated: number,
 * }>} Columns now on each hue, how many moved from an old entry and from a
 *   missing one, and how many palette entries were removed and created.
 */
export const migrateColumnHues = async () => {
  const { hueIds, hueEntriesCreated } = await ensureHueEntries();
  const hueIdSet = new Set(Object.values(hueIds).map(String));
  const hueOfId = new Map(Object.entries(hueIds).map(([hue, id]) => [String(id), hue]));

  const entries = await ColorPalette.find({}).lean();
  const entryById = new Map(entries.map(entry => [String(entry._id), entry]));

  let fromLegacy = 0;
  let fromMissing = 0;
  const perHue = Object.fromEntries(BOARD_HUES.map(hue => [hue, 0]));

  for (const Model of [Board, BoardTemplate]) {
    const operations = [];

    for (const document of await Model.find({ 'columns.0': { $exists: true } })
      .select('columns')
      .lean()) {
      let changed = false;

      const columns = document.columns.map(column => {
        const current = column.color ? String(column.color) : null;

        if (current && hueIdSet.has(current)) {
          perHue[hueOfId.get(current)] += 1;
          return column;
        }

        // The entry it names, when there is one: its hex value picks the hue.
        const entry = current ? entryById.get(current) : undefined;
        const hue = entry && !isBoardHue(entry.value) ? nearestBoardHue(entry.value) : DEFAULT_BOARD_HUE;

        if (entry) fromLegacy += 1;
        else fromMissing += 1;

        perHue[hue] += 1;
        changed = true;
        return { ...column, color: hueIds[hue] };
      });

      if (changed) {
        operations.push({ updateOne: { filter: { _id: document._id }, update: { $set: { columns } } } });
      }
    }

    if (operations.length > 0) {
      // The driver's own write, so no timestamp moves: a board list is sorted
      // by `updatedAt` and a recolour done by a script is not activity.
      await Model.collection.bulkWrite(operations);
    }
  }

  const { deletedCount } = await ColorPalette.deleteMany({ type: 'column' });

  return { perHue, fromLegacy, fromMissing, legacyEntriesRemoved: deletedCount, hueEntriesCreated };
};

export default migrateColumnHues;
