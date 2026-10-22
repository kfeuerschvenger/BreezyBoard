import express from 'express';
import * as WorkspaceController from '../controllers/workspace.controller.js';
import { authenticate, requireWorkspaceRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  addWorkspaceMembersSchema,
  createWorkspaceSchema,
  idParamSchema,
} from '../validation/workspace.validation.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

// Scoped to the caller by the service, so it needs no role check of its own.
router.get('/', WorkspaceController.getUserWorkspaces);
router.post('/', validate({ body: createWorkspaceSchema }), WorkspaceController.createWorkspace);
router.get('/:id', validate({ params: idParamSchema }), requireWorkspaceRole('member'), WorkspaceController.getWorkspace);
// Changing who is in a workspace is an admin act: a plain member being able
// to do it would make the two roles the same role.
router.patch(
  '/:id/members',
  validate({ params: idParamSchema, body: addWorkspaceMembersSchema }),
  requireWorkspaceRole('admin'),
  WorkspaceController.addWorkspaceMembers
);

export default router;
