import Board from '../models/Board.js';
import Task from '../models/Task.js';
import ApiError from '../utils/apiError.js';

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
  });

  await board.populate([
    { path: 'color', select: 'name value' },
    {
      path: 'template',
      select: 'name iconName columns',
      populate: {
        path: 'columns.color',
        select: 'name value',
      },
    },
  ]);

  return board;
};

export const getBoardById = async id => {
  const board = await Board.findById(id)
    .populate('color', 'name value')
    .populate({
      path: 'template',
      select: 'name iconName columns',
      populate: {
        path: 'columns.color',
        select: 'name value',
      },
    });

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
    .populate({
      path: 'template',
      select: 'name iconName columns',
      populate: {
        path: 'columns.color',
        select: 'name value',
      },
    });

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};

export const deleteBoard = async id => {
  const board = await Board.findByIdAndDelete(id);

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  // Delete tasks associated with the board
  await Task.deleteMany({ boardId: id });

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
    .populate({
      path: 'template',
      select: 'name iconName columns',
      populate: {
        path: 'columns.color',
        select: 'name value',
      },
    });

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return board;
};
