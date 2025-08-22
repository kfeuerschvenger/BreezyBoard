import express from 'express';
import { getTemplates } from '../controllers/template.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/', getTemplates);

export default router;
