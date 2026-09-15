import mongoose from 'mongoose';

import Board from '../models/Board.js';
import BoardTemplate from '../models/BoardTemplate.js';
import Task from '../models/Task.js';
import Workspace from '../models/Workspace.js';
import { resolveWorkspaceRole } from '../middleware/auth.middleware.js';
import { ensureWorkspaceMembership } from './workspace.service.js';
import ApiError from '../utils/apiError.js';

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
    .populate('color', 'name value')
    .populate('columns.color', 'name value')
    .populate('template', 'name iconName');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};

export const updateBoard = async (id, updateData) => {
  const board = await Board.findByIdAndUpdate(id, updateData, {
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

// Removing a board and its tasks used to be two independent writes. If the
// second one failed the board was already gone, and its tasks survived
// pointing at a board that no longer existed, invisible to every query in the
// application and reclaimed by nothing. One transaction makes the pair
// atomic: either the board and all of its tasks are gone, or neither is.
//
// This is why docker-compose runs MongoDB as a single node replica set.
// A standalone instance rejects transactions outright, so on a standalone
// deployment this function throws rather than silently falling back to the
// old unsafe pair, which is the correct failure: a deployment that cannot
// guarantee the cascade should say so instead of orphaning data quietly.
export const deleteBoard = async id => {
  const session = await mongoose.startSession();
  let board = null;

  try {
    // withTransaction commits on success, aborts on any throw, and retries
    // the callback on a transient error. The 404 below is raised inside the
    // transaction on purpose: it aborts cleanly, and it is not transient, so
    // it propagates on the first attempt rather than being retried.
    await session.withTransaction(async () => {
      board = await Board.findByIdAndDelete(id, { session });

      if (!board) {
        throw new ApiError(404, 'Board not found');
      }

      await Task.deleteMany({ boardId: id }, { session });
    });
  } finally {
    await session.endSession();
  }

  return board;
};

// Pagination is opt-in: `limit` undefined means "return everything", exactly
// as before this parameter existed. `pagination` is always returned
// alongside the boards so a client can discover `total` either way; only
// whether `boards` itself is truncated depends on `limit` being present.
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
 * @returns {Promise<object>} a filter for Board.find
 */
export const visibleBoardFilter = async userId => {
  const workspaces = await Workspace.find({ 'members.user': userId }).select('members');

  const memberOf = [];
  const adminOf = [];

  for (const workspace of workspaces) {
    memberOf.push(workspace._id);

    if (resolveWorkspaceRole(workspace, userId) === 'admin') {
      adminOf.push(workspace._id);
    }
  }

  return {
    $and: [
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
 * plain getter. Finding P2-4.
 *
 * A task counts as complete when it sits in its board's last column, or when
 * it has a checklist and every item on it is ticked. That second rule is
 * what the old virtual intended; the first is what it meant to express by
 * comparing `status` to the literal 'done', which could never match because
 * status holds a column id.
 *
 * Matching every board's done column in one `$in` is correct rather than
 * merely convenient, and only became so in Phase 4b: column ids belong to a
 * single board now, so a task whose status is in that set is necessarily in
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
    { $match: { boardId: { $in: boards.map(board => board._id) } } },
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
    ])
  );
};

export const getUserBoards = async (userId, { limit, offset } = {}) => {
  const filter = await visibleBoardFilter(userId);

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
      taskCount: summary?.total ?? 0,
      memberCount: (board.members ?? []).length,
      progress: summary?.progress ?? 0,
    };
  });

  const pagination = hasLimit ? { total, limit, offset: safeOffset } : { total };

  return { boards: withCounts, pagination };
};

export const addBoardMembers = async (boardId, members) => {
  const target = await Board.findById(boardId).select('workspaceId');

  if (!target) {
    throw new ApiError(404, 'Board not found');
  }

  // Board membership is inert without workspace membership: resolveBoardRole
  // gives no role at all to somebody outside the workspace, so they would
  // land in Board.members and still be refused on every request. See
  // ensureWorkspaceMembership for why this grants rather than refuses, and
  // what to revisit once workspace management has a real interface.
  await ensureWorkspaceMembership(target.workspaceId, members);

  const board = await Board.findByIdAndUpdate(boardId, { $addToSet: { members: { $each: members } } }, { new: true })
    .populate('members', 'firstName lastName email role department avatar')
    .populate('color', 'name value')
    .populate('columns.color', 'name value')
    .populate('template', 'name iconName');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};
