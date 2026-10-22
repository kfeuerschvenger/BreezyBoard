import { z } from 'zod';

// The one password strength rule. Registration, a password change and a
// password reset all take it from here, so a password accepted by one can
// never be refused by another. Mirrors front/src/features/auth
// RegisterForm's schema, so the backend never rejects something the form
// already accepted client side.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/(?=.*[a-z])/, 'Password must contain a lowercase letter')
  .regex(/(?=.*[A-Z])/, 'Password must contain an uppercase letter')
  .regex(/(?=.*\d)/, 'Password must contain a number');

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    email: z.string().trim().toLowerCase().email('Email is invalid'),
    password: passwordSchema,
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

// A successful change also bumps the user's tokenVersion (see
// user.service.js changePassword), which is what invalidates every token
// issued before the change.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .strict();

// Same email rule as login, for the same reason: a string in email format
// is all that ever reaches User.findOne.
export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Email is invalid'),
  })
  .strict();

// The token is bounded and otherwise opaque. Its shape is deliberately not
// checked beyond a length cap: a malformed token has to fail in the service
// with the same single error as an unknown or expired one, not here with a
// different message.
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token is required').max(256, 'Token is too long'),
    newPassword: passwordSchema,
  })
  .strict();
