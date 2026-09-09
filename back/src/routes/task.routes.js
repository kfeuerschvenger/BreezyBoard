import express from 'express';
import * as TaskController from '../controllers/task.controller.js';
import { authenticate, requireBoardRole, requireTaskBoardRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

// Board specific routes
router.get('/board/:boardId', requireBoardRole('member'), TaskController.getBoardTasks);
router.post('/board/:boardId', requireBoardRole('member'), TaskController.createTask);
router.patch('/board/:boardId/orders', requireBoardRole('member'), TaskController.updateOrders);

// Individual task routes
router.get('/:id', requireTaskBoardRole('member'), TaskController.getTask);
router.put('/:id', requireTaskBoardRole('member'), TaskController.updateTask);
router.delete('/:id', requireTaskBoardRole('member'), TaskController.deleteTask);
router.patch('/:id/move', requireTaskBoardRole('member'), TaskController.moveTask);

// Checklist management
router.patch('/:taskId/checklist/:itemId', requireTaskBoardRole('member'), TaskController.updateChecklistItem);
router.delete('/:taskId/checklist/:itemId', requireTaskBoardRole('member'), TaskController.deleteChecklistItem);

export default router;
