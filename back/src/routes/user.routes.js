import express from 'express';
import { getBoardMembers, getUser, searchUsers } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/search', searchUsers);
router.get('/board-members', getBoardMembers);
router.get('/:id', getUser);

export default router;
