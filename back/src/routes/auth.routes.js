import express from 'express';
import { register, login, validateToken } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/validate-token', authenticate, validateToken);

export default router;
