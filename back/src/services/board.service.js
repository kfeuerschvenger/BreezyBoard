import mongoose from 'mongoose';

import Board from '../models/Board.js';
import BoardTemplate from '../models/BoardTemplate.js';
import Task from '../models/Task.js';
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

export const createBoard = async (boardData, userId) => {
  // Ensures that the creator is included in the members
  const members = boardData.members || [];
  if (!members.includes(userId)) {
    members.push(userId);
  }

  const board = await Board.create({
    ...boardData,
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
export const getUserBoards = async (userId, { limit, offset } = {}) => {
  const filter = { $or: [{ createdBy: userId }, { members: userId }] };

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

  const boards = await query;

  const pagination = hasLimit ? { total, limit, offset: safeOffset } : { total };

  return { boards, pagination };
};

export const addBoardMembers = async (boardId, members) => {
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
