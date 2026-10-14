import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Board from '../models/Board.js';
import Task from '../models/Task.js';
import Workspace from '../models/Workspace.js';
import ApiError from '../utils/apiError.js';
import env from '../config/env.js';
import { ErrorCode } from '../constants/errorCodes.js';
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
      return next(new ApiError(401, 'Token has been revoked, please sign in again', [], ErrorCode.TOKEN_REVOKED));
    }

    // The absolute cap. Anchored on sessionStartedAt (stamped once at login,
    // never refreshed), not on iat (rewritten on every renewal). No renewal
    // header is issued once this fires.
    if (isAbsoluteSessionExpired(decoded.sessionStartedAt)) {
      return next(new ApiError(401, 'Session expired, please sign in again', [], ErrorCode.SESSION_EXPIRED));
    }

    // Renewal is a side effect of any authenticated request, not an
    // endpoint the client calls. sessionStartedAt and tokenVersion are
    // copied verbatim; only iat and exp move forward.
    res.set('X-Auth-Token', renewSessionToken(decoded));

    req.user = user;
    next();
  } catch (error) {
    req.log?.warn({ errorName: error.name }, 'Authentication error');

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
 * Resolve the caller's role in a workspace. Plain helper, not Express
 * middleware, so it can be reused or unit tested without a request.
 *
 * @param {object} workspace - a loaded Workspace document (or plain object with the same shape)
 * @param {string} userId - the id of the user whose role is being resolved
 * @returns {'admin' | 'member' | null}
 */
export const resolveWorkspaceRole = (workspace, userId) => {
  if (!workspace || !userId) {
    return null;
  }

  const requesterId = userId.toString();
  const membership = (workspace.members || []).find(member => member.user.toString() === requesterId);

  return membership ? membership.role : null;
};

/**
 * Resolve the caller's role on a board. Access is two levels, and both are
 * decided here so that no route has to know either of them exists.
 *
 * Workspace membership is a prerequisite, not a shortcut: belonging to the
 * workspace is what makes a person eligible for its boards, and they still
 * have to be added to each board individually. The one exception is a
 * workspace admin, who administers every board in their workspace whether
 * or not anyone ever added them to it.
 *
 * Plain helper, not Express middleware, so it can be reused or unit tested
 * without a request/response pair.
 *
 * @param {object} board - a loaded Board document (or plain object with the same shape)
 * @param {string} userId - the id of the user whose role is being resolved
 * @param {'admin' | 'member' | null} workspaceRole - the caller's role in the board's workspace
 * @returns {'owner' | 'member' | null}
 */
export const resolveBoardRole = (board, userId, workspaceRole) => {
  if (!board || !userId) {
    return null;
  }

  // Outside the workspace there is nothing to resolve, however the board's
  // own member list reads. This is what stops a stale board membership from
  // outliving a workspace someone was removed from.
  if (!workspaceRole) {
    return null;
  }

  const requesterId = userId.toString();

  if (workspaceRole === 'admin') {
    return 'owner';
  }

  if (board.createdBy && board.createdBy.toString() === requesterId) {
    return 'owner';
  }

  const isMember = (board.members || []).some(member => member.toString() === requesterId);

  return isMember ? 'member' : null;
};

/**
 * Load a board's workspace and resolve the caller's role in it. Every board
 * carries a required `workspaceId`, so a board whose workspace is missing is
 * a broken invariant rather than a request to refuse politely, and it
 * resolves to no role at all.
 *
 * @param {object} board - a loaded Board document
 * @param {string} userId
 * @returns {Promise<'admin' | 'member' | null>}
 */
const loadWorkspaceRole = async (board, userId) => {
  const workspace = await Workspace.findById(board.workspaceId).select('members');

  return resolveWorkspaceRole(workspace, userId);
};

const meetsMinimumRole = (role, minimumRole) => {
  if (!role) {
    return false;
  }
  return ROLE_RANK[role] >= ROLE_RANK[minimumRole];
};

const WORKSPACE_ROLE_RANK = {
  member: 1,
  admin: 2,
};

/**
 * Middleware factory for routes identified by a workspace id in `:id`.
 *
 * A workspace that does not exist and a workspace the caller is not in
 * return the same 403, rather than 404 and 403 respectively. Workspace ids
 * are handed around in invitations, and answering the two cases differently
 * turns this route into a way to ask whether an id is real. The board
 * middleware above still distinguishes them, which is the older behaviour
 * and out of scope to change here.
 *
 * @param {'member' | 'admin'} minimumRole
 * @returns {import('express').RequestHandler}
 */
export const requireWorkspaceRole = minimumRole => async (req, _res, next) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    const role = resolveWorkspaceRole(workspace, req.user.id);

    if (!role || WORKSPACE_ROLE_RANK[role] < WORKSPACE_ROLE_RANK[minimumRole]) {
      throw new ApiError(403, 'Not authorized to access this workspace');
    }

    req.workspace = workspace;
    next();
  } catch (error) {
    next(error);
  }
};

const resolveRequestedBoardId = req => req.params.boardId || req.params.id || req.query.boardId;

/**
 * Middleware factory for routes identified by a board id (`:boardId` or
 * `:id`, or a `boardId` query param). Loads the board, resolves the
 * caller's role, and only calls next() when that role meets `minimumRole`.
 * Missing board -> 404. Insufficient role -> 403.
 *
 * A soft-deleted board is a missing board, for everybody, which is what
 * keeps every route behind this middleware from serving it. The restore
 * route alone opts in with `includeDeleted`, and still resolves the role
 * first, so a stranger learns nothing about a deleted board either.
 *
 * @param {'member' | 'owner'} minimumRole
 * @param {{ includeDeleted?: boolean }} [options]
 * @returns {import('express').RequestHandler}
 */
export const requireBoardRole =
  (minimumRole, { includeDeleted = false } = {}) =>
  async (req, _res, next) => {
    try {
      const boardId = resolveRequestedBoardId(req);
      const board = await Board.findById(boardId);

      if (!board || (board.deletedAt && !includeDeleted)) {
        throw new ApiError(404, 'Board not found');
      }

      const role = resolveBoardRole(board, req.user.id, await loadWorkspaceRole(board, req.user.id));

      if (!meetsMinimumRole(role, minimumRole)) {
        throw new ApiError(403, 'Not authorized to access this board');
      }

      req.board = board;
      req.boardRole = role;
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
 * A soft-deleted task is a missing task, as a soft-deleted board is a missing
 * board. The restore route alone opts in with `includeDeleted`, and still
 * resolves the role on the board first.
 *
 * @param {'member' | 'owner'} minimumRole
 * @param {{ includeDeleted?: boolean }} [options]
 * @returns {import('express').RequestHandler}
 */
export const requireTaskBoardRole =
  (minimumRole, { includeDeleted = false } = {}) =>
  async (req, _res, next) => {
    try {
      const taskId = req.params.id || req.params.taskId;
      const task = await Task.findById(taskId);

      if (!task || (task.deletedAt && !includeDeleted)) {
        throw new ApiError(404, 'Task not found');
      }

      const board = await Board.findById(task.boardId);

      if (!board || board.deletedAt) {
        throw new ApiError(404, 'Board not found');
      }

      const role = resolveBoardRole(board, req.user.id, await loadWorkspaceRole(board, req.user.id));

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
