import { z } from 'zod';
import { objectIdSchema } from './common.validation.js';

export const boardIdParamSchema = z
  .object({
    boardId: objectIdSchema,
  })
  .strict();

export const idParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const checklistParamsSchema = z
  .object({
    taskId: objectIdSchema,
    itemId: objectIdSchema,
  })
  .strict();

// Deliberately NOT .strict(): the frontend echoes each checklist item's
// client-side id back as `_id` (see TaskDrawer.tsx), which for a freshly
// added item is a crypto.randomUUID(), not a Mongo ObjectId. Rather than
// reject the whole request, that field is silently stripped here and
// Mongoose assigns its own subdocument _id.
const checklistItemInputSchema = z.object({
  text: z.string().trim().min(1, 'Checklist item text is required'),
  completed: z.boolean().optional(),
});

// task.service.js createTask reads title/description/status/priority/color/
// owner/boardId/checklist from the body. `order` is absent on purpose: the
// ordering key is a fractional index minted server side, so a client has no
// way to propose one. boardId is accepted here
// only because the real frontend (TaskDrawer.tsx) echoes it back in the
// create payload; task.controller.js createTask always overwrites it with
// req.params.boardId before calling the service, so a client-supplied value
// here is never actually trusted.
//
// status is an id, not a label: it names a column subdocument of the board's
// template. It is required rather than optional because the model requires
// it anyway, and failing here gives the caller the field name instead of a
// Mongoose validation error. Whether that id belongs to this board in
// particular is settled in task.service.js, which is the only layer that can
// see the board.
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    description: z.string().trim().optional(),
    status: objectIdSchema,
    priority: z.enum(['low', 'medium', 'high']).optional(),
    color: objectIdSchema,
    owner: objectIdSchema.optional(),
    boardId: objectIdSchema.optional(),
    checklist: z.array(checklistItemInputSchema).optional(),
  })
  .strict();

// Whitelist for PUT /api/tasks/:id. boardId, order, _id and timestamps are
// intentionally excluded: boardId is excluded to prevent mass assignment (a client
// cannot relocate a task into another board through this route), and
// `order` is never client-supplied anywhere, since the ordering key is
// minted by the server from the neighbours a move names.
// Deliberately NOT .strict(): an unexpected field (boardId included) is
// silently stripped from result.data instead of rejected, so the update
// still succeeds (200) with the extra field simply gone rather than the
// whole request being bounced as invalid.
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').optional(),
  description: z.string().trim().optional(),
  status: objectIdSchema.optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  color: objectIdSchema.optional(),
  owner: objectIdSchema.optional(),
  checklist: z.array(checklistItemInputSchema).optional(),
});

// A move is expressed as the two cards the task was dropped between, not as
// a position. Both are nullable and both may be absent: no afterId means the
// top of the column, no beforeId means the bottom, neither means the column
// was empty. The server mints the ordering key from them, so there is
// deliberately no way for a client to send one.
export const moveTaskSchema = z
  .object({
    status: objectIdSchema,
    afterId: objectIdSchema.nullable().optional(),
    beforeId: objectIdSchema.nullable().optional(),
  })
  .strict();

export const updateChecklistItemSchema = z
  .object({
    text: z.string().trim().min(1, 'Checklist item text is required').optional(),
    completed: z.boolean().optional(),
  })
  .strict();
