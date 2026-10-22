import { z } from 'zod';

// A MongoDB ObjectId as sent over the wire: a 24-character hex string.
// Reused for every :id / :boardId / :taskId / :itemId param and every
// ObjectId-shaped body field across the API.
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'Must be a valid id');

// Pagination is opt-in: both fields are optional and there is deliberately
// no default for `limit`. A request that sends neither gets the full list,
// exactly like before this schema existed; a request that sends `limit`
// gets that page, with `offset` defaulting to 0 alongside it. Reused by
// every list endpoint that supports pagination (boards, tasks by board).
export const paginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();
