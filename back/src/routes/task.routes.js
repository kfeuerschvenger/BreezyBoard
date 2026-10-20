import express from 'express';
import * as TaskController from '../controllers/task.controller.js';
import { authenticate, requireBoardRole, requireTaskBoardRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { paginationQuerySchema } from '../validation/common.validation.js';
import {
  boardIdParamSchema,
  checklistParamsSchema,
  createTaskSchema,
  idParamSchema,
  moveTaskSchema,
  updateChecklistItemSchema,
  updateTaskSchema,
} from '../validation/task.validation.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

// Board specific routes
router.get(
  '/board/:boardId',
  validate({ params: boardIdParamSchema, query: paginationQuerySchema }),
  requireBoardRole('member'),
  TaskController.getBoardTasks
);
router.post(
  '/board/:boardId',
  validate({ params: boardIdParamSchema, body: createTaskSchema }),
  requireBoardRole('member'),
  TaskController.createTask
);

// Individual task routes
router.get('/:id', validate({ params: idParamSchema }), requireTaskBoardRole('member'), TaskController.getTask);
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateTaskSchema }),
  requireTaskBoardRole('member'),
  TaskController.updateTask
);
router.delete('/:id', validate({ params: idParamSchema }), requireTaskBoardRole('member'), TaskController.deleteTask);
// The one route that reaches a soft deleted task. It still resolves the
// caller's role on the task's board first, and answers a stranger 404 whether
// the task exists or not, so a stranger learns nothing.
router.post(
  '/:id/restore',
  validate({ params: idParamSchema }),
  requireTaskBoardRole('member', { includeDeleted: true }),
  TaskController.restoreTask
);
router.patch(
  '/:id/move',
  validate({ params: idParamSchema, body: moveTaskSchema }),
  requireTaskBoardRole('member'),
  TaskController.moveTask
);

// Checklist management
router.patch(
  '/:taskId/checklist/:itemId',
  validate({ params: checklistParamsSchema, body: updateChecklistItemSchema }),
  requireTaskBoardRole('member'),
  TaskController.updateChecklistItem
);
router.delete(
  '/:taskId/checklist/:itemId',
  validate({ params: checklistParamsSchema }),
  requireTaskBoardRole('member'),
  TaskController.deleteChecklistItem
);

export default router;
