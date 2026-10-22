import { z } from 'zod';
import { BREEZE_LEVELS } from '../models/User.js';
import { objectIdSchema } from './common.validation.js';

export const idParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

/** The longest search term that is matched. The search ignores nothing past it, so a longer one is refused. */
export const MAX_SEARCH_TERM_LENGTH = 100;

export const searchUsersQuerySchema = z
  .object({
    q: z
      .string()
      .max(MAX_SEARCH_TERM_LENGTH)
      .optional()
      .describe(
        'Matched case insensitively as a literal substring of the first name, last name, email, role and department. At most 100 characters; omitted, everybody is a match.'
      ),
    excludeBoardId: objectIdSchema
      .optional()
      .describe('Leaves out the creator and the members of this board, so a picker never offers somebody already on it.'),
  })
  .strict();

export const boardMembersQuerySchema = z
  .object({
    boardId: objectIdSchema.describe('The board whose members are listed. The caller needs the member role on it.'),
  })
  .strict();

// Mirrors the manual whitelist already enforced in user.service.js
// updateUser (firstName, lastName, email, location, role, department,
// avatar, breeze). Kept in sync deliberately: the service whitelist stays in place
// as a harmless second safety net.
export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email('Email is invalid').optional(),
    location: z.string().trim().optional(),
    role: z.string().trim().optional(),
    department: z.string().trim().optional(),
    avatar: z.string().optional(),
    breeze: z.enum(BREEZE_LEVELS).optional(),
  })
  .strict();
