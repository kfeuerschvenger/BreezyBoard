import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import { ErrorCode } from '../constants/errorCodes.js';

/**
 * The authentication endpoints had no limit of any kind, so credential
 * stuffing against /api/auth/login was bounded only by how fast an attacker
 * could send requests.
 *
 * Disabled under test, where the suite legitimately logs in dozens of times in
 * a few seconds and a limiter would make failures look like flakes.
 */
/**
 * The switch a test flips to exercise a limiter that is otherwise skipped.
 * Without it nothing could prove a route is actually behind its limiter,
 * since removing the limiter from the route would change no test result.
 */
export const rateLimitTesting = { enabled: false };

// Every limiter below is keyed on req.ip, the client's IP address as the
// trusted proxies report it (see TRUST_PROXY_HOPS in config/env.js). A budget
// is therefore per client address, never per account or per email address, and
// clients behind one shared address (an office, a mobile carrier) share it.
const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test' && !rateLimitTesting.enabled,
  message: {
    success: false,
    message: 'Too many attempts. Please wait before trying again.',
    code: ErrorCode.RATE_LIMITED,
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

/**
 * Registration, limited per client IP address to slow bulk account creation.
 *
 * Configurable, unlike the login limiter above, and the distinction is the
 * point rather than an inconsistency. That one bounds credential stuffing
 * and has no business being tuned; this one bounds spam signups, and the
 * standing verification scripts create real accounts, so twenty an hour is
 * a budget a single full run plus the end to end suite very nearly spends.
 * Exceeding it surfaces as a browser test timing out, which reads as a
 * product defect and has repeatedly been diagnosed as one.
 *
 * The default is the production value, so a deployment that sets nothing
 * gets the strict limit. docker-compose.yml raises it for development only,
 * and docker-compose.prod.yml deliberately does not mention it.
 */
export const registrationLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: env.REGISTRATION_LIMIT_PER_HOUR,
});

/**
 * Password recovery, both the request for a link and the use of one.
 *
 * Counts every request, which is the opposite of authLimiter and is
 * required rather than chosen: a reset request always succeeds, by design,
 * since it must answer the same for an address that exists and one that
 * does not. A limiter that skipped successful requests would therefore
 * never count one, and the route would be unlimited while appearing
 * protected. What it bounds is the number of emails one client can make
 * the system send to somebody else's mailbox.
 *
 * Configurable for the reason registrationLimiter is: the end to end suite
 * requests resets from one client, and development raises the budget.
 * The default is the production value, and docker-compose.prod.yml does not
 * mention it.
 */
export const passwordRecoveryLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: env.PASSWORD_RECOVERY_LIMIT_PER_15_MIN,
});
