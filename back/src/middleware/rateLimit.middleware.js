import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/**
 * The authentication endpoints had no limit of any kind, so credential
 * stuffing against /api/auth/login was bounded only by how fast an attacker
 * could send requests.
 *
 * Disabled under test, where the suite legitimately logs in dozens of times in
 * a few seconds and a limiter would make failures look like flakes.
 */
const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many attempts. Please wait before trying again.',
  },
};

/** Login and any other credential-checking route. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Count only failures, so a person legitimately using the app is never
  // locked out by their own successful logins.
  skipSuccessfulRequests: true,
});

/** Registration, limited per address to slow bulk account creation. */
export const registrationLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 20,
});
