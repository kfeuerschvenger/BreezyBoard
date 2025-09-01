import express from 'express';
import * as UserController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/search', UserController.searchUsers);
router.get('/board-members', UserController.getBoardMembers);
router.get('/:id', UserController.getUser);
router.put('/:id', UserController.updateUser);
router.post('/:id/avatar', upload.single('avatar'), UserController.uploadAvatar);

export default router;
