import { z } from 'zod';

/**
 * The strength rule the server applies to registration, a reset and a password
 * change, written once for a form that sets a new password: a password this
 * accepts is never refused after the request has been sent.
 */
export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/(?=.*[a-z])/, 'Password must contain a lowercase letter')
  .regex(/(?=.*[A-Z])/, 'Password must contain an uppercase letter')
  .regex(/(?=.*\d)/, 'Password must contain a number');

/** The sentence under a field that sets one, in the words of the rule above. */
export const PASSWORD_RULE_HINT = 'At least 8 characters, with a lowercase letter, an uppercase letter and a number.';
