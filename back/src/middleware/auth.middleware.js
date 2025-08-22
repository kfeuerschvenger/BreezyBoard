import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Board from '../models/Board.js';
import ApiError from '../utils/apiError.js';
import env from '../config/env.js';

export const authenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const token = authHeader.split(' ')[1];

    // Verify and decode the token
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // Search for the user in the database
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new ApiError(401, 'User not found'));
    }

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

export const authorizeBoard = async (req, _res, next) => {
  try {
    const boardId = req.params.id || req.params.boardId;
    const board = await Board.findById(boardId);

    if (!board) {
      throw new ApiError(404, 'Board not found');
    }

    // Verify if the user is the creator or a member of the board
    const isOwner = board.createdBy.toString() === req.user.id;
    const isMember = board.members.some(member => member.toString() === req.user.id);

    if (!isOwner && !isMember) {
      throw new ApiError(403, 'Not authorized to access this board');
    }

    next();
  } catch (error) {
    next(error);
  }
};
