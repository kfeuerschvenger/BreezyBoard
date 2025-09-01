import path from 'path';
import fs from 'fs';
import User from '../models/User.js';
import Board from '../models/Board.js';
import ApiError from '../utils/apiError.js';

export const searchUsers = async (q, excludeUserId, excludeBoardId = null) => {
  // If a boardId is provided, get the existing members of that board
  let excludeUserIds = [excludeUserId];

  if (excludeBoardId) {
    try {
      const board = await Board.findById(excludeBoardId).populate('members');
      if (board) {
        // Include creator and existing members
        const existingMembers = [board.createdBy, ...board.members.map(m => m._id)];
        excludeUserIds = [...excludeUserIds, ...existingMembers];

        // Delete duplicates
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
  const user = await User.findById(id).select('-password');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return user;
};

/**
 * Update user
 * - Only allow certain fields to be updated (whitelist)
 * - Basic authorization: only the owner can update
 */
export const updateUser = async (id, updateData, actor = null) => {
  if (actor && actor.id && actor.id.toString() !== id.toString()) {
    throw new ApiError(403, 'Forbidden: you can only update your own profile');
  }

  const allowedFields = ['firstName', 'lastName', 'email', 'location', 'role', 'department', 'avatar'];
  const payload = {};

  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(updateData, key) && updateData[key] !== undefined) {
      payload[key] = updateData[key];
    }
  }

  const updated = await User.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
    context: 'query',
  }).select('-password');

  if (!updated) {
    throw new ApiError(404, 'User not found');
  }

  return updated;
};

/**
 * Upload avatar
 * - Expects `file` to be the multer file object
 * - Stores the public URL/path in user.avatar and returns that URL
 */
export const uploadAvatar = async (id, file, actor = null) => {
  if (!file) {
    throw new ApiError(400, 'No file provided');
  }

  // Authorization: only user can update their avatar
  if (actor && actor.id && actor.id.toString() !== id.toString()) {
    throw new ApiError(403, 'Forbidden: you can only update your own avatar');
  }

  const user = await User.findById(id);
  if (!user) {
    try {
      // delete uploaded file if user doesn't exist
      fs.unlinkSync(file.path);
    } catch (e) {
      // swallow
    }
    throw new ApiError(404, 'User not found');
  }

  // Optional: delete old avatar file if it points to local uploads
  if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('/uploads/avatars/')) {
    try {
      const oldPath = path.join(process.cwd(), user.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch (err) {
      console.warn('Failed to remove old avatar file', err);
    }
  }

  // Build public path for the uploaded file
  const publicPath = `/uploads/avatars/${path.basename(file.filename)}`;

  // Save to user and return new avatar URL
  user.avatar = publicPath;
  await user.save();

  return publicPath;
};
