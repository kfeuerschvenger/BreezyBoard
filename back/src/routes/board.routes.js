import express from 'express';
import * as BoardController from '../controllers/board.controller.js';
import { authenticate, requireBoardRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  addBoardMembersSchema,
  createBoardSchema,
  idParamSchema,
  updateBoardSchema,
} from '../validation/board.validation.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', BoardController.getUserBoards);
router.post('/', validate({ body: createBoardSchema }), BoardController.createBoard);
router.get('/:id', validate({ params: idParamSchema }), requireBoardRole('member'), BoardController.getBoard);
// Destructive/ownership-changing operations require the creator, not just any member.
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateBoardSchema }),
  requireBoardRole('owner'),
  BoardController.updateBoard
);
router.delete('/:id', validate({ params: idParamSchema }), requireBoardRole('owner'), BoardController.deleteBoard);
router.patch(
  '/:id/members',
  validate({ params: idParamSchema, body: addBoardMembersSchema }),
  requireBoardRole('owner'),
  BoardController.addBoardMembers
);

export default router;
