import { z } from 'zod';
import { BREEZE_LEVELS } from '../models/User.js';
import { objectIdSchema } from './common.validation.js';

export const idParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

// Mirrors the manual whitelist already enforced in user.service.js
// updateUser (firstName, lastName, email, location, role, department,
// avatar, breeze). Kept in sync deliberately: the service whitelist stays in place
// as a harmless second safety net.
export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email('Email is invalid').optional(),
    location: z.string().trim().optional(),
    role: z.string().trim().optional(),
    department: z.string().trim().optional(),
    avatar: z.string().optional(),
    breeze: z.enum(BREEZE_LEVELS).optional(),
  })
  .strict();
