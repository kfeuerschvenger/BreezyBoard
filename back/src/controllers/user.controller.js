import * as userService from '../services/user.service.js';
import responseHandler from '../utils/responseHandler.js';

export const searchUsers = async (req, res, next) => {
  try {
    const { q = '', excludeBoardId } = req.query;
    const users = await userService.searchUsers(q, req.user.id, excludeBoardId);
    responseHandler(res, 201, users);
  } catch (error) {
    next(error);
  }
};

export const getBoardMembers = async (req, res, next) => {
  try {
    const { boardId } = req.query;
    const members = await userService.getBoardMembers(boardId);
    responseHandler(res, 200, members);
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    responseHandler(res, 200, user);
  } catch (error) {
    next(error);
  }
};
