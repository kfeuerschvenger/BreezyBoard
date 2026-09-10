import express from 'express';
import { register, login, validateToken, logout, ping, me, changePassword } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter, registrationLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { registerSchema, loginSchema, changePasswordSchema } from '../validation/auth.validation.js';

const router = express.Router();

router.post('/register', registrationLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);

// Kept working for the currently deployed frontend, which still calls this
// on session restore. Retire once the frontend migrates.
router.get('/validate-token', authenticate, validateToken);

router.post('/logout', authenticate, logout);
router.get('/ping', authenticate, ping);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), changePassword);

export default router;
