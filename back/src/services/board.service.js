import mongoose from 'mongoose';

import env from '../config/env.js';
import Board from '../models/Board.js';
import BoardTemplate from '../models/BoardTemplate.js';
import ColorPalette from '../models/ColorPalette.js';
import Task from '../models/Task.js';
import User, { presentUser } from '../models/User.js';
import Workspace from '../models/Workspace.js';
import { resolveBoardRole, resolveWorkspaceRole } from '../middleware/auth.middleware.js';
import { ensureWorkspaceMembership } from './workspace.service.js';
import ApiError from '../utils/apiError.js';
import { ErrorCode } from '../constants/errorCodes.js';
import { BOARD_HUES } from '../constants/boardHues.js';

// Columns are copied out of the template rather than referenced, so that the
// board owns its column ids. Mongoose assigns fresh subdocument ids on the
// way in, which is exactly the effect wanted: two boards created from one
// template no longer share column ids, and renaming a column on one leaves
// the other alone.
const copyColumnsFromTemplate = async templateId => {
  if (!templateId) {
    return [];
  }

  const template = await BoardTemplate.findById(templateId).select('columns');

  if (!template) {
    throw new ApiError(404, 'Board template not found');
  }

  return template.columns.map(column => ({
    title: column.title,
    color: column.color,
    order: column.order,
  }));
};

// The schema checks that a colour id is shaped like an id, and nothing checks
// that it names anything. A board saved with an id that matches no palette
// entry reads back with a null colour, which every consumer then has to
// guess a fallback for, so the id is looked up before it is written.
//
// The palette holds three kinds of colour, and a board takes only the
// 'board' kind: a task or column colour is a real entry but belongs to a
// different surface, so it is refused like an id that names nothing.
//
// The board palette is the six design hues, so the entry must also hold one of
// them. The palette model refuses to store anything else, and checking the
// value here as well means a row that predates the hues and was never
// migrated is refused rather than saved onto a board.
//
// A 400 rather than a 404: the board being written is fine, it is the value
// sent for one of its fields that is not.
const assertBoardColorExists = async colorId => {
  if (!(await ColorPalette.exists({ _id: colorId, type: 'board', value: { $in: BOARD_HUES } }))) {
    throw new ApiError(400, 'color must be the id of a board color', [], ErrorCode.VALIDATION_ERROR);
  }
};

// A column is painted in one of the six hues, the same entries a board's own
// colour comes from, because a hue key is unique in the palette and so one
// entry per hue serves both. Every id is looked up before it is written, for
// the reason a board colour is, and a repeated id counts once.
const assertColumnColorsExist = async colorIds => {
  const unique = [...new Set(colorIds.map(String))];
  const found = await ColorPalette.countDocuments({ _id: { $in: unique }, type: 'board', value: { $in: BOARD_HUES } });

  if (found !== unique.length) {
    throw new ApiError(400, 'every column color must be the id of a hue', [], ErrorCode.VALIDATION_ERROR);
  }
};

/**
 * Turns the list of columns an edit sends into the list to store, or refuses.
 *
 * The request is the whole new list in its new order. A column that carries an
 * id is one of the board's own and keeps it, which is what keeps every task's
 * `status` pointing at it; one without an id is new. A column of the board that
 * the list leaves out is a removal, and a removal needs the column to have no
 * live tasks: it is refused with a 409 naming the first column that still has
 * some, before anything is written. Deleted tasks do not block it. They stay in
 * the trash under the id of a column that no longer exists, and a restore puts
 * them in the first column.
 *
 * The check and the write that follows are two operations, so a card created in
 * the column in the gap between them is not excluded.
 *
 * @param {string} boardId
 * @param {Array<{ _id?: string, title: string, color: string }>} requested
 * @returns {Promise<Array<{ _id: mongoose.Types.ObjectId, title: string, color: string, order: number }>>}
 */
const planColumns = async (boardId, requested) => {
  const board = await Board.findOne({ _id: boardId, deletedAt: null }).select('columns');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  const storedIds = new Set(board.columns.map(column => column._id.toString()));
  const keptIds = new Set();

  for (const column of requested) {
    if (!column._id) continue;

    const id = column._id.toLowerCase();

    if (!storedIds.has(id)) {
      throw new ApiError(400, 'columns may only keep the ids of columns the board already has', [], ErrorCode.VALIDATION_ERROR);
    }
    keptIds.add(id);
  }

  await assertColumnColorsExist(requested.map(column => column.color));

  const removed = board.columns.filter(column => !keptIds.has(column._id.toString()));

  if (removed.length > 0) {
    const occupied = new Set(
      await Task.distinct('status', {
        boardId,
        status: { $in: removed.map(column => column._id.toString()) },
        deletedAt: null,
      })
    );
    const blocking = [...removed].sort((a, b) => a.order - b.order).find(column => occupied.has(column._id.toString()));

    if (blocking) {
      throw new ApiError(
        409,
        `The column "${blocking.title}" still has tasks. Move them to another column before removing it.`,
        [{ columnId: blocking._id.toString(), title: blocking.title }],
        ErrorCode.CONFLICT
      );
    }
  }

  return requested.map((column, order) => ({
    _id: column._id ? new mongoose.Types.ObjectId(column._id) : new mongoose.Types.ObjectId(),
    title: column.title,
    color: column.color,
    order,
  }));
};

// The schema checks that each member id is shaped like an id, and nothing
// checks that it names a person. Without this, an id that belongs to nobody
// is stored in Board.members and ensureWorkspaceMembership then makes it a
// member of the workspace too; the populated response drops it silently, so
// nothing looks wrong while the board and its workspace carry a ghost.
//
// Repeats are counted once, since $addToSet and the workspace grant both
// treat them as one.
const assertUsersExist = async userIds => {
  const unique = [...new Set(userIds.map(String))];

  if ((await User.countDocuments({ _id: { $in: unique } })) !== unique.length) {
    throw new ApiError(400, 'members must be ids of existing users', [], ErrorCode.VALIDATION_ERROR);
  }
};

// A board always belongs to exactly one workspace. A client that names one
// must be a member of it; a client that names none gets the caller's
// personal workspace, which is what keeps the common case free of a concept
// the user never asked about.
const resolveWorkspaceId = async (requestedWorkspaceId, userId) => {
  if (requestedWorkspaceId) {
    const workspace = await Workspace.findOne({ _id: requestedWorkspaceId, 'members.user': userId }).select('_id');

    // Deliberately indistinguishable from a workspace that does not exist.
    // A different answer for the two cases would let anyone enumerate
    // workspace ids by watching which ones come back 403 and which 404.
    if (!workspace) {
      throw new ApiError(403, 'Not authorized to create a board in this workspace');
    }

    return workspace._id;
  }

  const personal = await Workspace.findOne({ createdBy: userId, isPersonal: true }).select('_id');

  // Registration creates this in the same transaction as the account, so
  // reaching here means the invariant broke rather than the request being
  // wrong. Saying so plainly beats a generic failure in board creation,
  // which is where it would otherwise surface and be misdiagnosed.
  if (!personal) {
    throw new ApiError(500, 'This account has no personal workspace, which should be impossible');
  }

  return personal._id;
};

export const createBoard = async (boardData, userId) => {
  await assertBoardColorExists(boardData.color);

  if (boardData.members?.length) {
    await assertUsersExist(boardData.members);
  }

  // Ensures that the creator is included in the members
  const members = boardData.members || [];
  if (!members.includes(userId)) {
    members.push(userId);
  }

  const board = await Board.create({
    ...boardData,
    workspaceId: await resolveWorkspaceId(boardData.workspaceId, userId),
    createdBy: userId,
    members: members,
    columns: await copyColumnsFromTemplate(boardData.template),
  });

  await board.populate([
    { path: 'color', select: 'name value' },
    { path: 'columns.color', select: 'name value' },
    { path: 'template', select: 'name iconName' },
  ]);

  return board;
};

export const getBoardById = async id => {
  const board = await Board.findById(id)
    // The owner's name and picture, as the list gives them, because the board's
    // page draws its owner and a bare id says nothing a page can show. The
    // authorization middleware reads the board on its own and still sees an id.
    .populate('createdBy', 'firstName lastName avatar')
    .populate('color', 'name value')
    .populate('columns.color', 'name value')
    .populate('template', 'name iconName');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};

/**
 * The authorization middleware has already read the board by the time a write
 * runs, and a delete can land in between. A write that filtered on the id
 * alone would then edit a board that is meant to be invisible, so the writes
 * below carry `deletedAt: null` in their own filter and treat no match as a
 * missing board.
 */
export const updateBoard = async (id, { columns, ...fields }) => {
  if (fields.color !== undefined) {
    await assertBoardColorExists(fields.color);
  }

  // Every rule is checked before the one write below, and that write replaces
  // the whole list on one document, so a rejected column leaves the title, the
  // colour and the columns exactly as they were.
  const updateData = columns === undefined ? fields : { ...fields, columns: await planColumns(id, columns) };

  const board = await Board.findOneAndUpdate({ _id: id, deletedAt: null }, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('members', 'firstName lastName email')
    .populate('color', 'name value')
    .populate('columns.color', 'name value')
    .populate('template', 'name iconName');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};

/**
 * Soft delete: the board is marked, nothing is removed. Every read and
 * authorization path treats a marked board as missing, and its tasks are not
 * touched, so `restoreBoard` brings back exactly what was deleted. The data
 * goes for good in `purgeExpiredBoards`.
 *
 * The filter on `deletedAt` makes a second delete of the same board a 404
 * rather than a silent overwrite of the first deletion date, which would
 * quietly extend the retention window.
 *
 * @param {string} id
 * @returns {Promise<object>} the board, with its deletion date
 */
export const deleteBoard = async id => {
  const board = await Board.findOneAndUpdate({ _id: id, deletedAt: null }, { deletedAt: new Date() }, { new: true });

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};

/**
 * Clears the deletion mark. Idempotent: restoring a board that is not
 * deleted answers with the board, because a double click on Undo or a retry
 * after a timeout must not turn into an error for a state that is exactly
 * what was asked for.
 *
 * A board deleted longer ago than the retention window is gone as far as
 * this function is concerned, a 404, whether or not the purge job has got to
 * it yet. The job runs on an interval, so without this check the window
 * would stretch by up to one interval and a restore could succeed on a
 * board that is about to be removed. The comparison is the exact complement
 * of the purge's: the purge removes `deletedAt <= cutoff`, this restores
 * only `deletedAt > cutoff`, so no instant belongs to both.
 *
 * @param {string} id
 * @param {{ retentionMs?: number, now?: Date }} [options]
 * @returns {Promise<object>} the restored board
 */
export const restoreBoard = async (id, { retentionMs = env.BOARD_RETENTION_MS, now = new Date() } = {}) => {
  const cutoff = new Date(now.getTime() - retentionMs);

  const board = await Board.findOneAndUpdate(
    { _id: id, $or: [{ deletedAt: null }, { deletedAt: { $gt: cutoff } }] },
    { deletedAt: null },
    { new: true }
  )
    .populate('color', 'name value')
    .populate('columns.color', 'name value')
    .populate('template', 'name iconName');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};

// Removing a board and its tasks is two writes, and they must be atomic: if
// the second failed after the first, the tasks would survive pointing at a
// board that no longer exists, invisible to every query in the application
// and reclaimed by nothing. One transaction makes the pair all or nothing.
//
// This is why docker-compose runs MongoDB as a single node replica set.
// A standalone instance rejects transactions outright, so on a standalone
// deployment this function throws rather than silently falling back to an
// unsafe pair, which is the correct failure: a deployment that cannot
// guarantee the cascade should say so instead of orphaning data quietly.
//
// The board is removed only while it is still past `cutoff`, checked inside
// the transaction. A restore that lands between the scan and this call
// clears the mark and the board survives; the loser of the race is the purge.
const purgeBoard = async (id, cutoff) => {
  const session = await mongoose.startSession();
  let purged = false;

  try {
    // withTransaction commits on success, aborts on any throw, and retries
    // the callback on a transient error.
    await session.withTransaction(async () => {
      const board = await Board.findOneAndDelete({ _id: id, deletedAt: { $lte: cutoff } }, { session });

      // The same callback may run again after a transient error, so the flag
      // is assigned on every attempt rather than only set once.
      purged = Boolean(board);

      if (board) {
        await Task.deleteMany({ boardId: id }, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return purged;
};

/**
 * Removes every board whose deletion is older than the retention window,
 * with its tasks, one transaction per board. A failure on one board is
 * reported through `onError` and does not stop the others, so one poisoned
 * board cannot hold the rest of the backlog hostage; with no `onError` the
 * first failure is thrown instead.
 *
 * Safe to run from several processes at once: the guarded delete inside
 * `purgeBoard` lets only one of them remove a given board.
 *
 * @param {{ retentionMs: number, now?: Date, onError?: (error: Error, boardId: any) => void }} options
 * @returns {Promise<number>} how many boards were removed
 */
export const purgeExpiredBoards = async ({ retentionMs, now = new Date(), onError }) => {
  const cutoff = new Date(now.getTime() - retentionMs);
  // `$type` is what lets the planner use the partial index on `deletedAt`: a
  // bare `$lte` does not imply the index's own `$type` condition.
  const ids = await Board.distinct('_id', { deletedAt: { $type: 'date', $lte: cutoff } });
  let removed = 0;

  for (const id of ids) {
    try {
      if (await purgeBoard(id, cutoff)) {
        removed += 1;
      }
    } catch (error) {
      if (!onError) {
        throw error;
      }
      onError(error, id);
    }
  }

  return removed;
};

// Pagination is opt-in: `limit` undefined means "return everything", exactly
// as before this parameter existed. `pagination` is always returned
// alongside the boards so a client can discover `total` either way; only
// whether `boards` itself is truncated depends on `limit` being present.
/**
 * The caller's role in every workspace they belong to, keyed by workspace id.
 *
 * Both the listing filter and the per board role in the list are derived from
 * this one read, so they cannot disagree about which workspaces count.
 *
 * @param {string} userId
 * @returns {Promise<Map<string, 'admin' | 'member'>>}
 */
export const workspaceRolesOf = async userId => {
  const workspaces = await Workspace.find({ 'members.user': userId }).select('members');

  return new Map(workspaces.map(workspace => [workspace._id.toString(), resolveWorkspaceRole(workspace, userId)]));
};

/**
 * The boards this user may read, as a Mongo filter.
 *
 * It mirrors `resolveBoardRole` clause for clause on purpose. A listing that
 * is merely close to the per-board check is worse than one that is wrong in
 * an obvious way: boards appear in the list and then answer 403 when opened,
 * or exist and never appear at all, and neither reads as an access rule.
 *
 * Workspace membership gates everything, which is why it is an `$and` rather
 * than another `$or` branch. Being in `Board.members` after being removed
 * from the workspace grants nothing, in the listing exactly as in the check.
 *
 * @param {string} userId
 * @param {Map<string, 'admin' | 'member'>} [roles] - the caller's workspace roles, when already loaded
 * @returns {Promise<object>} a filter for Board.find
 */
export const visibleBoardFilter = async (userId, roles) => {
  const workspaceRoles = roles ?? (await workspaceRolesOf(userId));

  const memberOf = [];
  const adminOf = [];

  for (const [workspaceId, role] of workspaceRoles) {
    memberOf.push(workspaceId);

    if (role === 'admin') {
      adminOf.push(workspaceId);
    }
  }

  return {
    $and: [
      // A soft-deleted board is in nobody's list. `null` also matches a board
      // saved before the field existed.
      { deletedAt: null },
      { workspaceId: { $in: memberOf } },
      { $or: [{ createdBy: userId }, { members: userId }, { workspaceId: { $in: adminOf } }] },
    ],
  };
};

/** The column a board treats as done: the last one, by order. */
const doneColumnOf = board => [...(board.columns ?? [])].sort((a, b) => a.order - b.order).at(-1);

/**
 * Task totals and completion for a set of boards, in one aggregation.
 *
 * The dashboard renders three numbers per board and every one of them was
 * always zero. `taskCount` is a populate virtual that nothing ever
 * populated, `progress` was a broken virtual read through a `.lean()` query
 * that strips virtuals anyway, and `memberCount` only worked because it is a
 * plain getter.
 *
 * A task counts as complete when it sits in its board's last column, or when
 * it has a checklist and every item on it is ticked. That second rule is
 * what the old virtual intended; the first is what it meant to express by
 * comparing `status` to the literal 'done', which could never match because
 * status holds a column id.
 *
 * Matching every board's done column in one `$in` is correct rather than
 * merely convenient: column ids belong to a
 * single board, so a task whose status is in that set is necessarily in
 * its own board's last column and not some other board's.
 *
 * @param {Array<{_id: any, columns?: Array<object>}>} boards
 * @returns {Promise<Map<string, {total: number, completed: number, progress: number}>>}
 */
export const summariseBoardTasks = async boards => {
  const empty = new Map();

  if (boards.length === 0) {
    return empty;
  }

  const doneColumnIds = boards
    .map(doneColumnOf)
    .filter(Boolean)
    .map(column => column._id.toString());

  const rows = await Task.aggregate([
    // A soft deleted task is not on the board, so it is in none of its totals.
    { $match: { boardId: { $in: boards.map(board => board._id) }, deletedAt: null } },
    {
      $group: {
        _id: '$boardId',
        total: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $in: ['$status', doneColumnIds] },
                  {
                    $and: [
                      { $gt: [{ $size: { $ifNull: ['$checklist', []] } }, 0] },
                      { $allElementsTrue: { $map: { input: '$checklist', as: 'item', in: '$$item.completed' } } },
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return new Map(
    rows.map(row => [
      row._id.toString(),
      {
        total: row.total,
        completed: row.completed,
        progress: row.total === 0 ? 0 : Math.round((row.completed / row.total) * 100),
      },
    ]),
  );
};

export const getUserBoards = async (userId, { limit, offset } = {}) => {
  const roles = await workspaceRolesOf(userId);
  const filter = await visibleBoardFilter(userId, roles);

  const total = await Board.countDocuments(filter);

  let query = Board.find(filter)
    .populate('createdBy', 'firstName lastName avatar')
    .populate('color', 'name value')
    .populate({
      path: 'template',
      select: 'name iconName',
    })
    .sort({ updatedAt: -1 });

  const hasLimit = typeof limit === 'number';
  const safeOffset = typeof offset === 'number' ? offset : 0;

  if (hasLimit) {
    query = query.skip(safeOffset).limit(limit);
  }

  // Plain objects rather than documents, because the three counts below are
  // computed here and attached. They used to come from the toJSON transform,
  // which is how they stayed wrong: two of the three were virtuals that no
  // query ever filled in.
  const boards = await query.lean();
  const summaries = await summariseBoardTasks(boards);

  const withCounts = boards.map(board => {
    const summary = summaries.get(board._id.toString());

    return {
      ...board,
      // A lean read skips the model's `toJSON`, which is where a person's name
      // is capitalized and their `id` added, so the creator goes through the
      // same function here to read as it does on the single board.
      createdBy: board.createdBy && presentUser({ ...board.createdBy, id: board.createdBy._id.toString() }),
      // The same resolver the single board read uses, so the list and the
      // read agree on who administers what, a workspace admin included. It
      // compares `createdBy` as an id and the list populates it into an
      // object, so the id is handed over in its place.
      viewerRole: resolveBoardRole(
        { ...board, createdBy: board.createdBy?._id },
        userId,
        roles.get(board.workspaceId.toString())
      ),
      taskCount: summary?.total ?? 0,
      memberCount: (board.members ?? []).length,
      progress: summary?.progress ?? 0,
    };
  });

  const pagination = hasLimit ? { total, limit, offset: safeOffset } : { total };

  return { boards: withCounts, pagination };
};

export const addBoardMembers = async (boardId, members) => {
  const target = await Board.findOne({ _id: boardId, deletedAt: null }).select('workspaceId');

  if (!target) {
    throw new ApiError(404, 'Board not found');
  }

  await assertUsersExist(members);

  // Board membership is inert without workspace membership: resolveBoardRole
  // gives no role at all to somebody outside the workspace, so they would
  // land in Board.members and still be refused on every request. See
  // ensureWorkspaceMembership for why this grants rather than refuses, and
  // what to revisit once workspace management has a real interface.
  await ensureWorkspaceMembership(target.workspaceId, members);

  const board = await Board.findOneAndUpdate(
    { _id: boardId, deletedAt: null },
    { $addToSet: { members: { $each: members } } },
    { new: true }
  )
    .populate('members', 'firstName lastName email role department avatar')
    .populate('color', 'name value')
    .populate('columns.color', 'name value')
    .populate('template', 'name iconName');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};
