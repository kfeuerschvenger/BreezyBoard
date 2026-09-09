import express from 'express';
import * as TaskController from '../controllers/task.controller.js';
import { authenticate, requireBoardRole, requireTaskBoardRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  boardIdParamSchema,
  checklistParamsSchema,
  createTaskSchema,
  idParamSchema,
  moveTaskSchema,
  updateChecklistItemSchema,
  updateOrdersSchema,
  updateTaskSchema,
} from '../validation/task.validation.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

// Board specific routes
router.get(
  '/board/:boardId',
  validate({ params: boardIdParamSchema }),
  requireBoardRole('member'),
  TaskController.getBoardTasks
);
router.post(
  '/board/:boardId',
  validate({ params: boardIdParamSchema, body: createTaskSchema }),
  requireBoardRole('member'),
  TaskController.createTask
);
router.patch(
  '/board/:boardId/orders',
  validate({ params: boardIdParamSchema, body: updateOrdersSchema }),
  requireBoardRole('member'),
  TaskController.updateOrders
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
