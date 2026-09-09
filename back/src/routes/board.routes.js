import express from 'express';
import * as BoardController from '../controllers/board.controller.js';
import { authenticate, requireBoardRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', BoardController.getUserBoards);
router.post('/', BoardController.createBoard);
router.get('/:id', requireBoardRole('member'), BoardController.getBoard);
// Destructive/ownership-changing operations require the creator, not just any member.
router.put('/:id', requireBoardRole('owner'), BoardController.updateBoard);
router.delete('/:id', requireBoardRole('owner'), BoardController.deleteBoard);
router.patch('/:id/members', requireBoardRole('owner'), BoardController.addBoardMembers);

export default router;
