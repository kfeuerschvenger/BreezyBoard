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
// owner/boardId/checklist/order from the body. boardId is accepted here
// only because the real frontend (TaskDrawer.tsx) echoes it back in the
// create payload; task.controller.js createTask always overwrites it with
// req.params.boardId before calling the service, so a client-supplied value
// here is never actually trusted. status has no enum on the model today, so
// it stays a plain string.
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    description: z.string().trim().optional(),
    status: z.string().trim().min(1).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    color: objectIdSchema,
    owner: objectIdSchema.optional(),
    boardId: objectIdSchema.optional(),
    order: z.number().optional(),
    checklist: z.array(checklistItemInputSchema).optional(),
  })
  .strict();

// Whitelist for PUT /api/tasks/:id. boardId, order, _id and timestamps are
// intentionally excluded: boardId is the P1-3 mass-assignment fix (a client
// can no longer relocate a task into another board through this route), and
// order/status changes go through the dedicated move/orders endpoints.
// Deliberately NOT .strict(): an unexpected field (boardId included) is
// silently stripped from result.data instead of rejected, so the update
// still succeeds (200) with the extra field simply gone rather than the
// whole request being bounced as invalid.
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').optional(),
  description: z.string().trim().optional(),
  status: z.string().trim().min(1).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  color: objectIdSchema.optional(),
  owner: objectIdSchema.optional(),
  checklist: z.array(checklistItemInputSchema).optional(),
});

export const moveTaskSchema = z
  .object({
    status: z.string().trim().min(1, 'Status is required'),
    order: z.number(),
  })
  .strict();

const orderUpdateEntrySchema = z
  .object({
    id: objectIdSchema,
    order: z.number(),
  })
  .strict();

export const updateOrdersSchema = z
  .object({
    updates: z.array(orderUpdateEntrySchema).min(1, 'At least one update is required'),
  })
  .strict();

export const updateChecklistItemSchema = z
  .object({
    text: z.string().trim().min(1, 'Checklist item text is required').optional(),
    completed: z.boolean().optional(),
  })
  .strict();
