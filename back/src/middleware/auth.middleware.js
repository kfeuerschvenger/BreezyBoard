import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Board from '../models/Board.js';
import Task from '../models/Task.js';
import ApiError from '../utils/apiError.js';
import env from '../config/env.js';
import { isAbsoluteSessionExpired, renewSessionToken } from '../services/auth.service.js';

/**
 * Verifies the bearer token, enforces the sliding-session rules, and, when
 * the token is genuinely still good, renews it as a side effect and sets it
 * on the response as X-Auth-Token before the route handler ever runs.
 *
 * That ordering is not incidental. The header is set here, before next(),
 * because this middleware cannot know what the eventual response status
 * will be, and because the response may already be committed by the time a
 * "was this successful" check downstream would run. A 403 or a 500 from the
 * handler still proves a human made the request, so renewal happens
 * regardless of what the handler ends up returning.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const token = authHeader.split(' ')[1];

    // Verify and decode the token
    // The algorithm is pinned rather than read from the token header, so a
    // token asking to be verified with a different one is rejected outright.
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [env.JWT_ALGORITHM] });

    // Search for the user in the database. This lookup is not a new cost
    // introduced by tokenVersion: every authenticated request already loads
    // the user document here to populate req.user, and tokenVersion is a
    // field on that same document, not a separate query.
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new ApiError(401, 'User not found'));
    }

    // Real revocation: a token minted before a logout or a password change
    // carries the old tokenVersion and is rejected here even though its
    // signature and exp are both still perfectly valid.
    if (decoded.tokenVersion !== user.tokenVersion) {
      return next(new ApiError(401, 'Token has been revoked, please sign in again'));
    }

    // The absolute cap. Anchored on sessionStartedAt (stamped once at login,
    // never refreshed), not on iat (rewritten on every renewal). No renewal
    // header is issued once this fires.
    if (isAbsoluteSessionExpired(decoded.sessionStartedAt)) {
      return next(new ApiError(401, 'Session expired, please sign in again'));
    }

    // Renewal is a side effect of any authenticated request, not an
    // endpoint the client calls. sessionStartedAt and tokenVersion are
    // copied verbatim; only iat and exp move forward.
    res.set('X-Auth-Token', renewSessionToken(decoded));

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Token expired'));
    }

    if (error.name === 'JsonWebTokenError') {
      return next(new ApiError(401, 'Invalid token'));
    }

    next(new ApiError(401, 'Authentication failed'));
  }
};

// Role ranking used to compare a resolved role against a minimum requirement.
// 'owner' outranks 'member', so adding a future role only means adding one
// entry here instead of touching every route that checks access.
const ROLE_RANK = {
  member: 1,
  owner: 2,
};

/**
 * Resolve the caller's role on a board from the board's own `createdBy` and
 * `members` fields. Plain helper, not Express middleware, so it can be
 * reused (or unit tested) without a request/response pair.
 *
 * @param {object} board - a loaded Board document (or plain object with the same shape)
 * @param {string} userId - the id of the user whose role is being resolved
 * @returns {'owner' | 'member' | null}
 */
export const resolveBoardRole = (board, userId) => {
  if (!board || !userId) {
    return null;
  }

  const requesterId = userId.toString();

  if (board.createdBy && board.createdBy.toString() === requesterId) {
    return 'owner';
  }

  const isMember = (board.members || []).some(member => member.toString() === requesterId);

  return isMember ? 'member' : null;
};

const meetsMinimumRole = (role, minimumRole) => {
  if (!role) {
    return false;
  }
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
};

const resolveRequestedBoardId = req => req.params.boardId || req.params.id || req.query.boardId;

/**
 * Middleware factory for routes identified by a board id (`:boardId` or
 * `:id`, or a `boardId` query param). Loads the board, resolves the
 * caller's role, and only calls next() when that role meets `minimumRole`.
 * Missing board -> 404. Insufficient role -> 403.
 *
 * @param {'member' | 'owner'} minimumRole
 * @returns {import('express').RequestHandler}
 */
export const requireBoardRole = minimumRole => async (req, _res, next) => {
  try {
    const boardId = resolveRequestedBoardId(req);
    const board = await Board.findById(boardId);

    if (!board) {
      throw new ApiError(404, 'Board not found');
    }

    const role = resolveBoardRole(board, req.user.id);

    if (!meetsMinimumRole(role, minimumRole)) {
      throw new ApiError(403, 'Not authorized to access this board');
    }

    req.board = board;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware factory for routes identified by a task id (`:id` or
 * `:taskId`) rather than a board id. Loads the task, then its board, then
 * applies the same role rule as requireBoardRole. Missing task -> 404,
 * insufficient role -> 403.
 *
 * Note the tradeoff those two codes make: because they differ, a caller can
 * tell "this task exists but is not yours" from "no such task". That is
 * accepted here because task ids are Mongo ObjectIds, which are not
 * practically enumerable, and because a uniform 404 makes genuine
 * not-found bugs much harder to diagnose. Revisit if ids ever become
 * guessable or sequential.
 *
 * @param {'member' | 'owner'} minimumRole
 * @returns {import('express').RequestHandler}
 */
export const requireTaskBoardRole = minimumRole => async (req, _res, next) => {
  try {
    const taskId = req.params.id || req.params.taskId;
    const task = await Task.findById(taskId);

    if (!task) {
      throw new ApiError(404, 'Task not found');
    }

    const board = await Board.findById(task.boardId);

    if (!board) {
      throw new ApiError(404, 'Board not found');
    }

    const role = resolveBoardRole(board, req.user.id);

    if (!meetsMinimumRole(role, minimumRole)) {
      throw new ApiError(403, 'Not authorized to access this task');
    }

    req.task = task;
    req.board = board;
    next();
  } catch (error) {
    next(error);
  }
};
