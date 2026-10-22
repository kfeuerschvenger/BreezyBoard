import { z } from 'zod';
import { objectIdSchema } from './common.validation.js';

export const idParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

// `createdBy`, `members` and `isPersonal` are all absent on purpose. The
// creator is set from the authenticated user, the member list starts as that
// creator alone, and `isPersonal` is never client-supplied: the one personal
// workspace an account has is the one registration created for it, and a
// second would leave the fallback in createBoard with two candidates.
export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
  })
  .strict();

export const addWorkspaceMembersSchema = z
  .object({
    members: z
      .array(
        z
          .object({
            user: objectIdSchema,
            role: z.enum(['admin', 'member']).optional(),
          })
          .strict()
      )
      .min(1, 'At least one member is required'),
  })
  .strict();
