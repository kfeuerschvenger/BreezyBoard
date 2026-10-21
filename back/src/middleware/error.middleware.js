import ApiError from '../utils/apiError.js';
import { ErrorCode } from '../constants/errorCodes.js';
import logger from '../utils/logger.js';

// A routine 4xx is expected traffic, not a system fault, so it is logged at
// warn without a stack trace. A 5xx is a real fault and gets a full error
// log with the stack, via pino's err serializer. req.log carries this
// request's id (set by the pino-http middleware in app.js); it falls back
// to the bare logger only if this handler is ever exercised without it.
const logFailure = (req, statusCode, err) => {
  const log = req?.log || logger;

  if (statusCode >= 500) {
    log.error({ err }, err.message);
  } else {
    log.warn({ statusCode }, err.message);
  }
};

// Express identifies an error handler by its four parameters, so the unused
// fourth one cannot be dropped.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    logFailure(req, err.statusCode, err);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.errors && { errors: err.errors }),
    });
  }

  // Mongoose error
  if (err.name === 'CastError') {
    logFailure(req, 400, err);
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      code: ErrorCode.VALIDATION_ERROR,
    });
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    logFailure(req, 400, err);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      code: ErrorCode.VALIDATION_ERROR,
      errors,
    });
  }

  // Default error response
  logFailure(req, 500, err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    code: ErrorCode.INTERNAL,
  });
};
