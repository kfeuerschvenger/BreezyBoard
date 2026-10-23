import { generateKeyBetween } from 'fractional-indexing';

import env from '../config/env.js';
import Task from '../models/Task.js';
import Board from '../models/Board.js';
import ApiError from '../utils/apiError.js';
import { ErrorCode } from '../constants/errorCodes.js';

// The columns a task on this board may legally sit in. They are the board's
// own, copied out of its template when it was created, so this is a single
// document read. It still cannot be a schema enum: the valid set differs for
// every board and Mongoose has no way to say that.
//
// A soft deleted board is a missing board. The authorization middleware has
// read the board before this runs, and a delete can land in between, so the
// check is repeated here and a task is not written onto a deleted board. The
// check and the write are two operations, so a delete in the gap between them
// is not excluded; the task would then be restored or purged with the board
// and never seen on its own.
const loadColumnIds = async boardId => {
  const board = await Board.findOne({ _id: boardId, deletedAt: null }).select('columns');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board.columns.map(column => column._id.toString());
};

// The board's columns, first to last.
const boardColumnsByOrder = async boardId => {
  const board = await Board.findById(boardId).select('columns');

  return [...(board?.columns ?? [])].sort((a, b) => a.order - b.order);
};

// A well-formed id that belongs to a different board is still wrong, and it
// is the failure with real consequences: the task disappears from the board
// it was filed under while continuing to count in its totals. The shape check
// on the model catches the careless case, this catches the plausible one.
const assertStatusNamesAColumnOfThisBoard = async (boardId, status) => {
  const columnIds = await loadColumnIds(boardId);

  if (columnIds.length === 0) {
    throw new ApiError(
      400,
      'This board has no columns, because it was created without a template. A task cannot be given a status on it.'
    );
  }

  if (!columnIds.includes(String(status))) {
    throw new ApiError(400, 'status must be the id of a column belonging to this board');
  }
};

// The key that puts a task at the bottom of a column. Soft deleted tasks are
// counted here on purpose: they are invisible to every read, but a restore
// puts one back under its own key, and a new card minted below the last live
// key could land on it and share a position with the card that comes back.
const keyAtEndOfColumn = async (boardId, status) => {
  const last = await Task.findOne({ boardId, status }).sort({ order: -1 }).select('order');

  return generateKeyBetween(last?.order ?? null, null);
};

/**
 * The key for a task dropped between two neighbours.
 *
 * The client sends the two cards it dropped between rather than a position
 * or a key of its own, so the server is the only thing that ever mints one
 * and a stale client cannot write a key that contradicts the column.
 *
 * Both neighbours are checked to be in this column of this board, and a
 * neighbour that has moved since the client last looked is a 409 rather
 * than a 400. The distinction matters to the client: 409 means "your view
 * of the column is out of date, fetch it again", which is a thing it can
 * act on, while 400 means "this request was malformed", which it cannot.
 */
const keyBetweenNeighbours = async (boardId, status, afterId, beforeId) => {
  const neighbourIds = [afterId, beforeId].filter(Boolean);
  const neighbours = neighbourIds.length
    ? await Task.find({ _id: { $in: neighbourIds }, boardId, status, deletedAt: null }).select('order')
    : [];

  const byId = new Map(neighbours.map(task => [task._id.toString(), task.order]));

  if (neighbourIds.some(id => !byId.has(id.toString()))) {
    throw new ApiError(
      409,
      'A neighbouring task is no longer where the client expected it. Reload the board and try again.',
      [],
      ErrorCode.CONFLICT
    );
  }

  try {
    return generateKeyBetween(afterId ? byId.get(afterId.toString()) : null, beforeId ? byId.get(beforeId.toString()) : null);
  } catch {
    // generateKeyBetween refuses neighbours that are not in ascending order,
    // which means the client's picture of the column disagrees with the
    // database. Same situation, same answer.
    throw new ApiError(
      409,
      'The neighbouring tasks are no longer in the order the client expected. Reload the board and try again.',
      [],
      ErrorCode.CONFLICT
    );
  }
};

export const createTask = async taskData => {
  if (!taskData.boardId) {
    throw new ApiError(400, 'boardId is required to create a task');
  }
  if (taskData.owner) {
    const board = await Board.findOne({ _id: taskData.boardId, deletedAt: null }).populate('members');
    if (!board) {
      throw new ApiError(404, 'Board not found');
    }
    const memberIds = [String(board.createdBy), ...board.members.map(m => String(m._id))];
    if (!memberIds.includes(String(taskData.owner))) {
      throw new ApiError(400, 'Owner must be a member of the board');
    }
  }

  await assertStatusNamesAColumnOfThisBoard(taskData.boardId, taskData.status);

  // A new task lands at the bottom of its column. The key is minted here and
  // never accepted from the client, which is why `order` is not in the
  // create schema.
  const task = await Task.create({
    ...taskData,
    order: await keyAtEndOfColumn(taskData.boardId, taskData.status),
  });

  await task.populate([
    { path: 'owner', select: 'firstName lastName avatar' },
    { path: 'color', select: 'name value' },
  ]);

  return task;
};

export const getTaskById = async id => {
  const task = await Task.findOne({ _id: id, deletedAt: null }).populate('owner', 'firstName lastName avatar').populate('color', 'name value');
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }
  return task;
};

export const updateTask = async (id, updateData) => {
  // Only pay for the lookup when the caller is actually changing the column.
  if (updateData.status !== undefined) {
    const existing = await Task.findOne({ _id: id, deletedAt: null }).select('boardId');

    if (!existing) {
      throw new ApiError(404, 'Task not found');
    }

    await assertStatusNamesAColumnOfThisBoard(existing.boardId, updateData.status);
  }

  // The authorization middleware has already read the task, and a delete can
  // land in between, so the write filters on `deletedAt` itself.
  const task = await Task.findOneAndUpdate({ _id: id, deletedAt: null }, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value');

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

/**
 * Soft delete: the task is marked, nothing is removed. Every read and write
 * treats a marked task as missing, and it keeps its id, dates, column and
 * position, so `restoreTask` brings back exactly what was deleted. The data
 * goes for good in `purgeExpiredTasks`.
 *
 * The filter on `deletedAt` makes a second delete of the same task a 404
 * rather than a silent overwrite of the first deletion date, which would
 * quietly extend the retention window.
 *
 * @param {string} id
 * @returns {Promise<object>} the task, with its deletion date
 */
export const deleteTask = async id => {
  const task = await Task.findOneAndUpdate({ _id: id, deletedAt: null }, { deletedAt: new Date() }, { new: true });
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }
  return task;
};

/**
 * Clears the deletion mark. Idempotent: restoring a task that is not deleted
 * answers with the task, so a double click on "Catch it" or a retry after a
 * timeout is not an error. A task deleted longer ago than the retention window
 * is a 404 whether or not the purge has reached it, the exact complement of
 * `purgeExpiredTasks`: the purge removes `deletedAt <= cutoff`, this restores
 * only `deletedAt > cutoff`.
 *
 * The task's owner is not checked. The owner may have left the board since the
 * delete, and the task is restored as it was, with the owner it had.
 *
 * A task comes back under its own key unless a live card in the same column
 * holds that key by now: `keyBetweenNeighbours` ignores deleted tasks, and
 * `generateKeyBetween` is deterministic, so a card dropped into the gap the
 * deleted one left is minted the very same key. Two cards sharing a key make
 * every later drop between them impossible, so the restored task is re-keyed
 * to sit immediately above the card that took its place.
 *
 * A task whose column has been removed since it was deleted is restored into
 * the board's first column, at the bottom of it.
 *
 * @param {string} id
 * @param {{ retentionMs?: number, now?: Date }} [options]
 * @returns {Promise<object>} the restored task
 */
export const restoreTask = async (id, { retentionMs = env.BOARD_RETENTION_MS, now = new Date() } = {}) => {
  const cutoff = new Date(now.getTime() - retentionMs);
  const filter = { _id: id, $or: [{ deletedAt: null }, { deletedAt: { $gt: cutoff } }] };

  const candidate = await Task.findOne(filter).select('boardId status order deletedAt');

  if (!candidate) {
    throw new ApiError(404, 'Task not found');
  }

  const update = { deletedAt: null };

  if (candidate.deletedAt) {
    const { boardId, order } = candidate;
    let { status } = candidate;

    // A column can be removed while it holds only deleted tasks, and those
    // stay in the trash naming a column that is gone. Such a task is restored
    // into the board's first column, at the foot of it: its old key was minted
    // among the cards of another column and means nothing here.
    const columns = await boardColumnsByOrder(boardId);

    if (columns.length > 0 && !columns.some(column => column._id.toString() === status)) {
      status = columns[0]._id.toString();
      update.status = status;
      update.order = await keyAtEndOfColumn(boardId, status);
    }

    const live = { boardId, status, deletedAt: null, _id: { $ne: candidate._id } };

    if (update.order === undefined && (await Task.exists({ ...live, order }))) {
      const above = await Task.findOne({ ...live, order: { $lt: order } })
        .sort({ order: -1 })
        .select('order');

      update.order = generateKeyBetween(above?.order ?? null, order);
    }
  }

  const task = await Task.findOneAndUpdate(filter, update, { new: true })
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value');

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

/**
 * Removes every task whose deletion is older than the retention window. A
 * single `deleteMany` guarded on `deletedAt`, so a restore that lands first
 * keeps its task: a restored task no longer matches.
 *
 * @param {{ retentionMs: number, now?: Date }} options
 * @returns {Promise<number>} how many tasks were removed
 */
export const purgeExpiredTasks = async ({ retentionMs, now = new Date() }) => {
  const cutoff = new Date(now.getTime() - retentionMs);
  // `$type` is what lets the planner use the partial index on `deletedAt`.
  const { deletedCount } = await Task.deleteMany({ deletedAt: { $type: 'date', $lte: cutoff } });

  return deletedCount;
};

/**
 * Move a task to a position in a column, expressed as the two cards it was
 * dropped between. Either neighbour may be null: no `afterId` means the top
 * of the column, no `beforeId` means the bottom, neither means the column
 * was empty.
 *
 * This is one write to one document, whatever the size of the column. The
 * previous contract took an absolute number, which forced the client to
 * renumber the whole column for a reorder and, for a move between columns,
 * to compute one past the maximum, which is why a card dropped into the
 * middle of another column always landed at the bottom of it.
 */
export const moveTask = async (taskId, newStatus, { afterId = null, beforeId = null } = {}) => {
  const existing = await Task.findOne({ _id: taskId, deletedAt: null }).select('boardId');

  if (!existing) {
    throw new ApiError(404, 'Task not found');
  }

  await assertStatusNamesAColumnOfThisBoard(existing.boardId, newStatus);

  const newOrder = await keyBetweenNeighbours(existing.boardId, newStatus, afterId, beforeId);

  const task = await Task.findOneAndUpdate(
    { _id: taskId, deletedAt: null },
    { status: newStatus, order: newOrder },
    { new: true }
  )
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value');

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

// Pagination is opt-in: `limit` undefined means "return everything", exactly
// as before this parameter existed. `pagination` is always returned
// alongside the tasks so a client can discover `total` either way; only
// whether `tasks` itself is truncated depends on `limit` being present.
export const getTasksByBoard = async (boardId, { limit, offset } = {}) => {
  const filter = { boardId, deletedAt: null };

  const total = await Task.countDocuments(filter);

  // The whole drag and drop feature writes `order` and this query used to
  // sort by createdAt, so reordering a column had no effect that survived a
  // reload. The client sorted by order itself after fetching, which hid the
  // bug on the board page and left it visible everywhere else, including in
  // any paginated request: the page boundary was being cut on a different
  // ordering than the one the caller saw.
  //
  // createdAt stays as the tiebreaker, in the direction it used to sort in,
  // so tasks that genuinely share an order keep the arrangement they had.
  let query = Task.find(filter)
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value')
    .sort({ order: 1, createdAt: -1 });

  const hasLimit = typeof limit === 'number';
  const safeOffset = typeof offset === 'number' ? offset : 0;

  if (hasLimit) {
    query = query.skip(safeOffset).limit(limit);
  }

  const tasks = await query;

  const pagination = hasLimit ? { total, limit, offset: safeOffset } : { total };

  return { tasks, pagination };
};

/**
 * A saved task with `owner` and `color` populated, the shape every task
 * response has. A document read for a write holds bare ids, so a write that
 * answers with it has to populate before it does.
 */
const populateTaskRefs = task =>
  task.populate([
    { path: 'owner', select: 'firstName lastName avatar' },
    { path: 'color', select: 'name value' },
  ]);

export const updateChecklistItem = async (taskId, itemId, updateData) => {
  const task = await Task.findOne({ _id: taskId, deletedAt: null });
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  const itemIndex = task.checklist.findIndex(item => item._id.toString() === itemId);
  if (itemIndex === -1) {
    throw new ApiError(404, 'Checklist item not found');
  }

  // Update the item
  task.checklist[itemIndex] = {
    ...task.checklist[itemIndex].toObject(),
    ...updateData,
  };

  await task.save();
  return populateTaskRefs(task);
};

export const deleteChecklistItem = async (taskId, itemId) => {
  const task = await Task.findOne({ _id: taskId, deletedAt: null });
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  task.checklist = task.checklist.filter(item => item._id.toString() !== itemId);
  await task.save();
  return populateTaskRefs(task);
};
