import express from 'express';
import {
  addBoardMembers,
  createBoard,
  deleteBoard,
  getBoard,
  getUserBoards,
  updateBoard,
} from '../controllers/board.controller.js';
import { authenticate, authorizeBoard } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', getUserBoards);
router.post('/', createBoard);
router.get('/:id', authorizeBoard, getBoard);
router.put('/:id', authorizeBoard, updateBoard);
router.delete('/:id', authorizeBoard, deleteBoard);
router.patch('/:id/members', authorizeBoard, addBoardMembers);

export default router;
