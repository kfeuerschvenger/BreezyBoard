import express from 'express';
import { register, login, validateToken } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter, registrationLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { registerSchema, loginSchema } from '../validation/auth.validation.js';

const router = express.Router();

router.post('/register', registrationLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.get('/validate-token', authenticate, validateToken);

export default router;
