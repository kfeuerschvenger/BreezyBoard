import express from 'express';
import {
  register,
  login,
  validateToken,
  logout,
  ping,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter, passwordRecoveryLimiter, registrationLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validation/auth.validation.js';

const router = express.Router();

router.post('/register', registrationLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);

// Public, so there is no session to protect them: the limiter is the only
// thing between these routes and a mailbox being flooded.
router.post('/forgot-password', passwordRecoveryLimiter, validate({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', passwordRecoveryLimiter, validate({ body: resetPasswordSchema }), resetPassword);

// Kept working for the currently deployed frontend, which still calls this
// on session restore. Retire once the frontend migrates.
router.get('/validate-token', authenticate, validateToken);

router.post('/logout', authenticate, logout);
router.get('/ping', authenticate, ping);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), changePassword);

export default router;
