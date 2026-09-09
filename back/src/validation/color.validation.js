import { z } from 'zod';
import { objectIdSchema } from './common.validation.js';

// Closes finding L3: GET /api/colors accepted any value for `type` and
// passed it straight into the Mongo filter with no validation.
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
