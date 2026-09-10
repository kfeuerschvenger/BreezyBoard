// Single source of truth for the machine-readable `code` field returned in
// every error envelope, additive next to the existing `message` field. Add a
// new failure case here rather than inventing a string literal at the call
// site: the codes are meant to be a stable contract a client can switch on.
export const ErrorCode = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
});

// Fallback applied when an ApiError is thrown without an explicit code,
// keyed by HTTP status. This is what lets most existing `throw new
// ApiError(404, '...')` call sites keep working unchanged: only the cases
// that need a code more specific than their status (TOKEN_REVOKED and
// SESSION_EXPIRED, both otherwise 401) pass one explicitly.
const DEFAULT_CODE_BY_STATUS = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

export const defaultCodeForStatus = statusCode => DEFAULT_CODE_BY_STATUS[statusCode] || ErrorCode.INTERNAL;
