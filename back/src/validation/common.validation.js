import { z } from 'zod';

// A MongoDB ObjectId as sent over the wire: a 24-character hex string.
// Reused for every :id / :boardId / :taskId / :itemId param and every
// ObjectId-shaped body field across the API.
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i, 'Must be a valid id');
