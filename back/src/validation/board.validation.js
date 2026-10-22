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
//
// workspaceId is optional and omitting it is the normal case: the service
// falls back to the caller's personal workspace, so the existing frontend,
// which knows nothing about workspaces, keeps working unchanged. A supplied
// value is checked against the caller's membership in the service, never
// trusted from here.
export const createBoardSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    description: z.string().trim().optional(),
    color: objectIdSchema,
    template: objectIdSchema.nullable().optional(),
    workspaceId: objectIdSchema.optional(),
    members: z.array(objectIdSchema).optional(),
  })
  .strict();

// Whitelist for PUT /api/boards/:id. createdBy, members, _id and timestamps
// are intentionally excluded: members has its own endpoint, and createdBy
// must never be reassignable through a generic update. Deliberately
// NOT .strict(): an unexpected field (e.g. a hijack attempt sending
// createdBy/members) is silently stripped from result.data rather than
// rejected, so the request still reaches requireBoardRole('owner') and is
// judged on authorization, not on payload shape.
//
// `template` is excluded too, and that is a change. Columns are copied onto
// the board at creation and no longer track the template, so repointing a
// board at a different one would swap the icon on the dashboard and leave
// every column and every task status exactly where they were. A field whose
// only remaining effect is cosmetic, and whose name promises something much
// larger, is worse than no field.
export const updateBoardSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').optional(),
  description: z.string().trim().optional(),
  color: objectIdSchema.optional(),
});

export const addBoardMembersSchema = z
  .object({
    members: z.array(objectIdSchema).min(1, 'At least one member is required'),
  })
  .strict();
