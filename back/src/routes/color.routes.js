import express from 'express';
import { getColorById, getColors } from '../controllers/color.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', getColors);
router.get('/:id', getColorById);

export default router;
