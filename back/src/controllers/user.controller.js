import * as userService from '../services/user.service.js';
import responseHandler from '../utils/responseHandler.js';
import ApiError from '../utils/apiError.js';

/**
 * Convert a Mongoose document (or plain object) into a public object
 * and convert relative avatar paths to absolute URLs using request info.
 */
const toPublicUser = (userDoc, req) => {
  if (!userDoc) return null;

  // If it's a Mongoose document, toObject() for safe manipulation
  const user = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };

  // If avatar is present and starts with a slash, build a full URL
  if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('/')) {
    try {
      const host = req.get('host');
      const protocol = req.protocol;
      user.avatar = `${protocol}://${host}${user.avatar}`;
    } catch (e) {
      // fallback: keep stored avatar
    }
  }

  // Ensure password and internal fields are not leaked (in case)
  if (user.password) delete user.password;
  if (user.__v) delete user.__v;

  return user;
};

const getActor = req => {
  if (!req.user) return null;
  return { id: req.user.id ?? req.user._id ?? null, raw: req.user };
};

export const searchUsers = async (req, res, next) => {
  try {
    const { q = '', excludeBoardId } = req.query;
    const users = await userService.searchUsers(q, req.user?.id ?? req.user?._id, excludeBoardId);
    const publicUsers = (users || []).map(u => toPublicUser(u, req));
    responseHandler(res, 200, publicUsers);
  } catch (error) {
    next(error);
  }
};

export const getBoardMembers = async (req, res, next) => {
  try {
    const { boardId } = req.query;
    const members = await userService.getBoardMembers(boardId);
    const publicMembers = (members || []).map(m => toPublicUser(m, req));
    responseHandler(res, 200, publicMembers);
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    const publicUser = toPublicUser(user, req);
    responseHandler(res, 200, publicUser);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const actor = getActor(req);
    const user = await userService.updateUser(req.params.id, req.body, actor);
    const publicUser = toPublicUser(user, req);
    responseHandler(res, 200, publicUser);
  } catch (error) {
    next(error);
  }
};

export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }
    const actor = getActor(req);
    const avatarPath = await userService.uploadAvatar(req.params.id, req.file, actor);
    // Convert to full URL (same logic as toPublicUser)
    const fullUrl = `${req.protocol}://${req.get('host')}${avatarPath}`;
    responseHandler(res, 200, { avatar: fullUrl });
  } catch (error) {
    next(error);
  }
};
