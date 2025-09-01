class ApiError extends Error {
  constructor(statusCode = 500, message = 'Internal Server Error', errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
