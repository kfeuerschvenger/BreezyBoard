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
  // A password reset token that is unknown, expired or already used. One
  // code for all three: telling them apart would tell a guesser which part of
  // the token was right.
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  // The current password given to a password change does not match. It is a
  // 400 and never a 401: a client treats every 401 as an ended session and
  // signs the person out, and a mistyped password is not that.
  WRONG_CURRENT_PASSWORD: 'WRONG_CURRENT_PASSWORD',
  // An upload rejected before it is stored: a declared type that is not an
  // image, or a file over the size limit. Both are the caller's mistake, so a
  // 400, and a client can word each one differently.
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
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
