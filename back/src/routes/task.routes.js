import express from 'express';
import * as TaskController from '../controllers/task.controller.js';
import { authenticate, authorizeBoard } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

// Board specific routes
router.get('/board/:boardId', authorizeBoard, TaskController.getBoardTasks);
router.post('/board/:boardId', authorizeBoard, TaskController.createTask);
router.patch('/board/:boardId/orders', authorizeBoard, TaskController.updateOrders);

// Individual task routes
router.get('/:id', TaskController.getTask);
router.put('/:id', TaskController.updateTask);
router.delete('/:id', TaskController.deleteTask);
router.patch('/:id/move', TaskController.moveTask);

// Checklist management
router.patch('/:taskId/checklist/:itemId', TaskController.updateChecklistItem);
router.delete('/:taskId/checklist/:itemId', TaskController.deleteChecklistItem);

export default router;
