import express from 'express';
import * as BoardController from '../controllers/board.controller.js';
import { authenticate, authorizeBoard } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', BoardController.getUserBoards);
router.post('/', BoardController.createBoard);
router.get('/:id', authorizeBoard, BoardController.getBoard);
router.put('/:id', authorizeBoard, BoardController.updateBoard);
router.delete('/:id', authorizeBoard, BoardController.deleteBoard);
router.patch('/:id/members', authorizeBoard, BoardController.addBoardMembers);

export default router;
