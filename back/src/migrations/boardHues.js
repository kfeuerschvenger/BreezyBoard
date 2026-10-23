import Board from '../models/Board.js';
import ColorPalette from '../models/ColorPalette.js';
import { BOARD_HUES, BOARD_HUE_NAMES, DEFAULT_BOARD_HUE, isBoardHue, nearestBoardHue } from '../constants/boardHues.js';

/**
 * Makes sure the palette holds one `board` entry per hue and answers with the
 * id of each. A board's colour and a column's colour both point at these.
 *
 * @returns {Promise<{ hueIds: Record<string, import('mongoose').Types.ObjectId>, hueEntriesCreated: number }>}
 */
export const ensureHueEntries = async () => {
  let hueEntriesCreated = 0;
  const hueIds = {};

  for (const hue of BOARD_HUES) {
    const existing = await ColorPalette.findOne({ type: 'board', value: hue });
    if (existing) {
      hueIds[hue] = existing._id;
      continue;
    }

    const created = await ColorPalette.create({ name: BOARD_HUE_NAMES[hue], value: hue, type: 'board' });
    hueIds[hue] = created._id;
    hueEntriesCreated += 1;
  }

  return { hueIds, hueEntriesCreated };
};

/**
 * Moves every board onto the six design hues.
 *
 * The board palette used to be eight hex colours. It is now the six hues, and
 * a board stores a reference to one of them, so this does three things in
 * order:
 *
 * 1. Makes sure the six hue entries exist in the palette.
 * 2. Points every board whose colour is one of the old hex entries at the hue
 *    nearest to it on the colour wheel, then removes the old entries.
 * 3. Points every board whose colour is not one of the six hue entries at the
 *    default hue. That is a board whose colour id names nothing, because the
 *    palette was reseeded under it, and a board painted with a task or column
 *    colour before the palette check existed. Either reads back with no board
 *    colour, and nothing says what it was meant to be.
 *
 * It can run any number of times. A second run finds the six entries present,
 * no old entry left and no board pointing at a missing one, and changes
 * nothing. Boards in the deleted state are migrated too: a restore must bring
 * back a board that is already on the new palette.
 *
 * @returns {Promise<{
 *   perHue: Record<string, number>,
 *   fromLegacy: number,
 *   fromMissing: number,
 *   legacyEntriesRemoved: number,
 *   hueEntriesCreated: number,
 * }>} Boards now on each hue, how many moved from an old entry and from a
 *   missing one, and how many palette entries were removed and created.
 */
export const migrateBoardHues = async () => {
  const { hueIds, hueEntriesCreated } = await ensureHueEntries();

  // Read lean, as plain objects. An old entry holds a hex value, which the
  // model would refuse to save, and nothing here saves one.
  const legacyEntries = (await ColorPalette.find({ type: 'board' }).lean()).filter(entry => !isBoardHue(entry.value));

  let fromLegacy = 0;
  for (const entry of legacyEntries) {
    const result = await Board.updateMany({ color: entry._id }, { $set: { color: hueIds[nearestBoardHue(entry.value)] } });
    fromLegacy += result.modifiedCount;
  }

  const legacyEntriesRemoved = legacyEntries.length;
  if (legacyEntriesRemoved > 0) {
    await ColorPalette.deleteMany({ _id: { $in: legacyEntries.map(entry => entry._id) } });
  }

  // Everything still pointing outside the six hue entries has no board colour.
  const missing = await Board.updateMany(
    { color: { $nin: Object.values(hueIds) } },
    { $set: { color: hueIds[DEFAULT_BOARD_HUE] } }
  );

  const perHue = {};
  for (const hue of BOARD_HUES) {
    perHue[hue] = await Board.countDocuments({ color: hueIds[hue] });
  }

  return {
    perHue,
    fromLegacy,
    fromMissing: missing.modifiedCount,
    legacyEntriesRemoved,
    hueEntriesCreated,
  };
};

export default migrateBoardHues;
