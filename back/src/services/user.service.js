import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Board from '../models/Board.js';
import ApiError from '../utils/apiError.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const MAX_SEARCH_TERM_LENGTH = 100;

/** Escapes every regex metacharacter so a search term is matched literally. */
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
      logger.error({ err: error }, 'Error fetching board members');
    }
  }

  // The search term went into $regex verbatim, so a caller could send regex
  // metacharacters and have Mongo evaluate them: at best a search that matches
  // nothing sensible, at worst a pattern that scans the collection slowly.
  // Escaped, and capped, so it can only ever be a literal substring.
  const term = escapeRegex(String(q ?? '').slice(0, MAX_SEARCH_TERM_LENGTH));

  const filter = {
    $and: [
      {
        $or: [
          { firstName: { $regex: term, $options: 'i' } },
          { lastName: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },
          { role: { $regex: term, $options: 'i' } },
          { department: { $regex: term, $options: 'i' } },
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
 * Change a user's password. Verifies the current password, hashes the new
 * one, and bumps tokenVersion so every token issued before this call fails
 * the auth middleware's version check on its next use, per the sliding
 * session's revocation design. This is the sole reason this service
 * imports bcrypt and env.
 *
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<import('mongoose').Document>}
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  const salt = await bcrypt.genSalt(env.SALT);
  user.password = await bcrypt.hash(newPassword, salt);
  user.tokenVersion += 1;
  // A reset link requested before this change must not outlive it: whoever
  // holds the link would otherwise be able to overwrite the password the
  // person has just chosen.
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  return user;
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
      logger.warn({ err }, 'Failed to remove old avatar file');
    }
  }

  // Build public path for the uploaded file
  const publicPath = `/uploads/avatars/${path.basename(file.filename)}`;

  // Save to user and return new avatar URL
  user.avatar = publicPath;
  await user.save();

  return publicPath;
};
