import User from '../models/User.js';
import Board from '../models/Board.js';

export const searchUsers = async (q, excludeUserId, excludeBoardId = null) => {
  // Si se proporciona un boardId, obtener los miembros existentes de ese board
  let excludeUserIds = [excludeUserId];

  if (excludeBoardId) {
    try {
      const board = await Board.findById(excludeBoardId).populate('members');
      if (board) {
        // Incluir al creador y a los miembros existentes
        const existingMembers = [board.createdBy, ...board.members.map(m => m._id)];
        excludeUserIds = [...excludeUserIds, ...existingMembers];

        // Eliminar duplicados
        excludeUserIds = [...new Set(excludeUserIds.map(id => id.toString()))];
      }
    } catch (error) {
      console.error('Error fetching board members:', error);
    }
  }

  const filter = {
    $and: [
      {
        $or: [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { role: { $regex: q, $options: 'i' } },
          { department: { $regex: q, $options: 'i' } },
        ],
      },
      { _id: { $nin: excludeUserIds } },
    ],
  };

  const users = await User.find(filter).select('-password').limit(10);
  return users;
};

export const getBoardMembers = async boardId => {
  if (!boardId) return [];
  const board = await Board.findById(boardId).populate('members');
  if (!board) {
    throw new ApiError(404, 'Board not found');
  }
  const memberIds = board.members.map(m => m._id);
  const users = await User.find({ _id: { $in: memberIds } }).select('-password');
  return users;
};

export const getUserById = async id => {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return user;
};
