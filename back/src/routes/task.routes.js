import express from 'express';
import {
  createTask,
  deleteChecklistItem,
  deleteTask,
  getBoardTasks,
  getTask,
  moveTask,
  updateChecklistItem,
  updateOrders,
  updateTask,
} from '../controllers/task.controller.js';
import { authenticate, authorizeBoard } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

// Board specific routes
router.get('/board/:boardId', authorizeBoard, getBoardTasks);
router.post('/board/:boardId', authorizeBoard, createTask);
router.patch('/board/:boardId/orders', authorizeBoard, updateOrders);

// Individual task routes
router.get('/:id', getTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);
router.patch('/:id/move', moveTask);

// Checklist management
router.patch('/:taskId/checklist/:itemId', updateChecklistItem);
router.delete('/:taskId/checklist/:itemId', deleteChecklistItem);

export default router;
