import express from 'express';
import { getColorById, getColors } from '../controllers/color.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { getColorsQuerySchema, idParamSchema } from '../validation/color.validation.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', validate({ query: getColorsQuerySchema }), getColors);
router.get('/:id', validate({ params: idParamSchema }), getColorById);

export default router;
