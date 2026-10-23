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

export const COLUMN_NAME_MAX_LENGTH = 40;
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 8;

// One column as an edit sends it. A column that already exists carries its
// `_id`, which is how it keeps the id every task's `status` points at; a new
// column has none and is given one by the server. There is no `order`: the
// position of a column in the array is its position on the board.
const boardColumnSchema = z.object({
  _id: objectIdSchema.optional(),
  title: z
    .string()
    .trim()
    .min(1, 'A column needs a name')
    .max(COLUMN_NAME_MAX_LENGTH, `A column name is at most ${COLUMN_NAME_MAX_LENGTH} characters`),
  color: objectIdSchema,
});

/**
 * The complete, ordered list of a board's columns, as the edit dialog sends it
 * on Save. It replaces the stored list: a column that is absent is removed,
 * which the service allows only for a column with no live tasks.
 *
 * Names are compared ignoring case because the task modal's move buttons, the
 * dialog's positions and the landed toast all name a column by its title.
 */
export const boardColumnsSchema = z
  .array(boardColumnSchema)
  .min(MIN_COLUMNS, `A board keeps at least ${MIN_COLUMNS} columns`)
  .max(MAX_COLUMNS, `A board has at most ${MAX_COLUMNS} columns`)
  .superRefine((columns, context) => {
    const seenTitles = new Set();
    const seenIds = new Set();

    columns.forEach((column, index) => {
      const key = column.title.toLowerCase();

      if (seenTitles.has(key)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'title'],
          message: `Two columns are called "${column.title}". Column names must be different`,
        });
      }
      seenTitles.add(key);

      if (column._id) {
        const id = column._id.toLowerCase();

        if (seenIds.has(id)) {
          context.addIssue({ code: 'custom', path: [index, '_id'], message: 'A column appears twice' });
        }
        seenIds.add(id);
      }
    });
  });

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
  columns: boardColumnsSchema.optional(),
});

export const addBoardMembersSchema = z
  .object({
    members: z.array(objectIdSchema).min(1, 'At least one member is required'),
  })
  .strict();
