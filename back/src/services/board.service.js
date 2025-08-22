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

export const getUserBoards = async userId => {
  const boards = await Board.find({
    $or: [{ createdBy: userId }, { members: userId }],
  })
    .populate('createdBy', 'firstName lastName avatar')
    .populate('color', 'name value')
    .populate({
      path: 'template',
      select: 'name iconName',
    })
    .sort({ updatedAt: -1 });

  return boards;
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
