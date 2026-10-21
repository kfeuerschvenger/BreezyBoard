import express from 'express';
import * as UserController from '../controllers/user.controller.js';
import { authenticate, requireBoardRole } from '../middleware/auth.middleware.js';
import { uploadAvatarImage } from '../middleware/upload.middleware.js';
import { verifyUploadedImage } from '../middleware/verifyImage.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  boardMembersQuerySchema,
  idParamSchema,
  searchUsersQuerySchema,
  updateUserSchema,
} from '../validation/user.validation.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(authenticate);

router.get('/search', validate({ query: searchUsersQuerySchema }), UserController.searchUsers);
// requireBoardRole reads the target board from req.query.boardId here (no boardId route param),
// so the query is validated first: it never looks a malformed id up.
router.get(
  '/board-members',
  validate({ query: boardMembersQuerySchema }),
  requireBoardRole('member'),
  UserController.getBoardMembers
);
router.get('/:id', validate({ params: idParamSchema }), UserController.getUser);
router.put('/:id', validate({ params: idParamSchema, body: updateUserSchema }), UserController.updateUser);
router.post(
  '/:id/avatar',
  validate({ params: idParamSchema }),
  uploadAvatarImage,
  verifyUploadedImage,
  UserController.uploadAvatar
);

export default router;
