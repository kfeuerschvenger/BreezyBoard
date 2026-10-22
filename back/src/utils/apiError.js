import { defaultCodeForStatus } from '../constants/errorCodes.js';

class ApiError extends Error {
  constructor(statusCode = 500, message = 'Internal Server Error', errors = [], code) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    // A machine-readable code, additive next to message. Most call sites
    // pass nothing and get a sensible default derived from statusCode; only
    // cases that need a code more specific than their status (a 401 that is
    // specifically a revoked token or an expired session) pass one.
    this.code = code || defaultCodeForStatus(statusCode);
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
