import * as boardService from '../services/board.service.js';
import responseHandler from '../utils/responseHandler.js';

export const createBoard = async (req, res, next) => {
  try {
    const board = await boardService.createBoard(req.body, req.user.id);
    responseHandler(res, 201, board);
  } catch (error) {
    next(error);
  }
};

export const getBoard = async (req, res, next) => {
  try {
    const board = await boardService.getBoardById(req.params.id);
    responseHandler(res, 200, board);
  } catch (error) {
    next(error);
  }
};

export const updateBoard = async (req, res, next) => {
  try {
    const board = await boardService.updateBoard(req.params.id, req.body);
    responseHandler(res, 200, board);
  } catch (error) {
    next(error);
  }
};

export const deleteBoard = async (req, res, next) => {
  try {
    const board = await boardService.deleteBoard(req.params.id);
    responseHandler(res, 200, { message: 'Board deleted successfully', deletedAt: board.deletedAt });
  } catch (error) {
    next(error);
  }
};

export const restoreBoard = async (req, res, next) => {
  try {
    const board = await boardService.restoreBoard(req.params.id);
    responseHandler(res, 200, board);
  } catch (error) {
    next(error);
  }
};

export const getUserBoards = async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const { boards, pagination } = await boardService.getUserBoards(req.user.id, { limit, offset });
    responseHandler(res, 200, boards, { pagination });
  } catch (error) {
    next(error);
  }
};

export const addBoardMembers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { members } = req.body;
    const board = await boardService.addBoardMembers(id, members);
    responseHandler(res, 200, board);
  } catch (error) {
    next(error);
  }
};
