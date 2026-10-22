import { z } from 'zod';
import { objectIdSchema } from './common.validation.js';

// GET /api/colors validates `type` so that an arbitrary value is never passed
// straight into the Mongo filter.
export const getColorsQuerySchema = z
  .object({
    type: z.enum(['board', 'task', 'column']).optional(),
  })
  .strict();

export const idParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();
