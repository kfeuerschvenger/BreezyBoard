import { z } from 'zod';
import { objectIdSchema } from './common.validation.js';

export const idParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

// board.service.js createBoard reads title/description/color/template from
// the body and adds createdBy/members itself. members can also be supplied
// up front (it defaults to an empty array plus the creator otherwise).
export const createBoardSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    description: z.string().trim().optional(),
    color: objectIdSchema,
    template: objectIdSchema.nullable().optional(),
    members: z.array(objectIdSchema).optional(),
  })
  .strict();

// Whitelist for PUT /api/boards/:id. createdBy, members, _id and timestamps
// are intentionally excluded: members has its own endpoint, and createdBy
// must never be reassignable through a generic update (P1-2). Deliberately
// NOT .strict(): an unexpected field (e.g. a hijack attempt sending
// createdBy/members) is silently stripped from result.data rather than
// rejected, so the request still reaches requireBoardRole('owner') and is
// judged on authorization, not on payload shape.
export const updateBoardSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').optional(),
  description: z.string().trim().optional(),
  color: objectIdSchema.optional(),
  template: objectIdSchema.nullable().optional(),
});

export const addBoardMembersSchema = z
  .object({
    members: z.array(objectIdSchema).min(1, 'At least one member is required'),
  })
  .strict();
