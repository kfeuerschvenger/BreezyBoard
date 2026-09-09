import { z } from 'zod';

// Mirrors front/src/components/RegisterForm.tsx registerSchema so the
// backend never rejects something the real registration form already
// accepted client side.
export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    email: z.string().trim().toLowerCase().email('Email is invalid'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/(?=.*[a-z])/, 'Password must contain a lowercase letter')
      .regex(/(?=.*[A-Z])/, 'Password must contain an uppercase letter')
      .regex(/(?=.*\d)/, 'Password must contain a number'),
  })
  .strict();

// email must be a string in valid email format before it ever reaches
// User.findOne({ email }) - this is what closes the NoSQL-injection hole
// where an object like { $ne: null } was interpreted as a Mongo operator.
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email is invalid'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();
