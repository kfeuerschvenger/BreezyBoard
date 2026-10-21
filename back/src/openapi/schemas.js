import { z } from 'zod';
import { ErrorCode } from '../constants/errorCodes.js';
import { BREEZE_LEVELS } from '../models/User.js';
import { objectIdSchema } from '../validation/common.validation.js';

/**
 * The shapes the API answers with, written as Zod schemas so the OpenAPI
 * document and the contract test read the same definitions. The request
 * schemas live next to the routes in src/validation and are imported by
 * operations.js; nothing here duplicates them.
 *
 * Responses are loose objects: the documents carry Mongoose internals such as
 * `__v` that are not part of the contract, and a client must tolerate fields
 * it does not know.
 */

const timestamp = z.iso.datetime();

const timestamps = {
  createdAt: timestamp,
  updatedAt: timestamp,
};

/** A person as the API presents them: names capitalized, no secrets. */
export const UserSchema = z.looseObject({
  _id: objectIdSchema,
  id: objectIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  avatar: z.string().describe('An absolute URL, or an empty string when the person has no picture.'),
  role: z.string(),
  department: z.string(),
  location: z.string(),
  breeze: z.enum(BREEZE_LEVELS),
  ...timestamps,
});

/** The few fields of a person that are populated into another document. */
export const UserSummarySchema = z.looseObject({
  _id: objectIdSchema,
  id: objectIdSchema.optional(),
  firstName: z.string(),
  lastName: z.string(),
  avatar: z.string().optional(),
  email: z.string().optional(),
  location: z.string().optional(),
});

export const ColorRefSchema = z.looseObject({
  _id: objectIdSchema,
  name: z.string(),
  value: z.string().describe('A hue key (`sky`, `teal`, `green`, `sand`, `coral`, `lavender`) for a board colour, a hex string otherwise.'),
});

export const ColorSchema = z.looseObject({
  _id: objectIdSchema,
  name: z.string(),
  value: z.string(),
  type: z.enum(['board', 'task', 'column']),
  ...timestamps,
});

export const TemplateRefSchema = z.looseObject({
  _id: objectIdSchema,
  name: z.string(),
  iconName: z.string().optional(),
});

export const TemplateColumnSchema = z.looseObject({
  _id: objectIdSchema,
  title: z.string(),
  color: objectIdSchema,
  order: z.number(),
});

export const TemplateSchema = z.looseObject({
  _id: objectIdSchema,
  name: z.string(),
  description: z.string().optional(),
  columns: z.array(TemplateColumnSchema),
  iconName: z.string().optional(),
  ...timestamps,
});

export const ColumnSchema = z.looseObject({
  _id: objectIdSchema,
  title: z.string(),
  color: z.union([objectIdSchema, ColorRefSchema]).describe('A colour id in the board list, the populated colour everywhere else.'),
  order: z.number(),
});

export const BoardSchema = z.looseObject({
  _id: objectIdSchema,
  id: objectIdSchema.optional(),
  title: z.string(),
  description: z.string().optional(),
  color: ColorRefSchema,
  template: TemplateRefSchema.nullable(),
  columns: z.array(ColumnSchema),
  workspaceId: objectIdSchema,
  createdBy: z.union([objectIdSchema, UserSummarySchema]).describe('The creator, populated in reads and left as an id in write responses.'),
  members: z.array(z.union([objectIdSchema, UserSummarySchema])).describe('Member ids, or populated people when the response lists members.'),
  deletedAt: timestamp.nullable().describe('Set while the board is soft deleted; only the restore route answers with a board in that state.'),
  memberCount: z.number().int().optional(),
  taskCount: z.number().int().optional().describe('Live tasks only. Present in the board list.'),
  progress: z.number().int().optional().describe('Whole percentage of live tasks that are complete: in the last column, or with every checklist item ticked. Present in the board list.'),
  viewerRole: z.enum(['owner', 'member']).optional().describe("The caller's own role on the board. Present in the list and the single read."),
  ...timestamps,
});

export const ChecklistItemSchema = z.looseObject({
  _id: objectIdSchema,
  text: z.string(),
  completed: z.boolean(),
});

export const TaskSchema = z.looseObject({
  _id: objectIdSchema,
  title: z.string(),
  description: z.string().optional(),
  status: objectIdSchema.describe('The id of one of the board columns.'),
  priority: z.enum(['low', 'medium', 'high']),
  color: ColorRefSchema,
  owner: UserSummarySchema.optional(),
  boardId: objectIdSchema,
  order: z.string().describe('A fractional index, base 62. Tasks of a column sort ascending on it; the server mints it and a client never sends one.'),
  checklist: z.array(ChecklistItemSchema),
  deletedAt: timestamp.nullable(),
  ...timestamps,
});

/**
 * A task as the checklist routes answer: the document as saved, with `color`
 * and `owner` left as ids where every other task response populates them.
 */
export const TaskWithIdsSchema = TaskSchema.extend({
  color: objectIdSchema,
  owner: objectIdSchema.optional(),
});

export const WorkspaceSchema = z.looseObject({
  _id: objectIdSchema,
  name: z.string(),
  createdBy: objectIdSchema,
  members: z.array(
    z.looseObject({
      user: UserSummarySchema,
      role: z.enum(['admin', 'member']),
    })
  ),
  isPersonal: z.boolean(),
  ...timestamps,
});

export const DashboardStatsSchema = z.looseObject({
  totalBoards: z.number().int(),
  totalMembers: z.number().int(),
  totalTasks: z.number().int(),
  avgProgress: z.number().int().describe('Whole percentage, averaged over boards, empty boards counting as zero.'),
});

export const PaginationSchema = z.looseObject({
  total: z.number().int(),
  limit: z.number().int().optional().describe('Echoed only when the request sent `limit`.'),
  offset: z.number().int().optional().describe('Echoed only when the request sent `limit`.'),
});

/**
 * The body every failure carries, produced by middleware/error.middleware.js
 * and by the rate limiters. `errors` is absent on a 429 and on the generic 500.
 */
export const ErrorBodySchema = z.looseObject({
  success: z.literal(false),
  message: z.string(),
  code: z.enum(Object.values(ErrorCode)),
  errors: z
    .array(
      z.union([
        z.looseObject({ field: z.string(), message: z.string() }),
        z.string(),
      ])
    )
    .optional()
    .describe('Per field issues on a validation failure, as `{ field, message }`. Mongoose validation failures list plain messages.'),
});

/** `{ success: true, data }`, with `pagination` beside `data` on a paginated list. */
export const envelope = (data, { paginated = false } = {}) =>
  z.looseObject({
    success: z.literal(true),
    data,
    ...(paginated && { pagination: PaginationSchema }),
  });
