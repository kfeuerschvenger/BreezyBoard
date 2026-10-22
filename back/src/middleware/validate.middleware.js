import ApiError from '../utils/apiError.js';

// Maps the failing keys of a set of Zod schemas onto a single ApiError,
// following the request-validation layer design: params validated before
// body/query so path-shaped mistakes fail first, but all provided schemas
// are checked and every issue is collected before responding once.
const collectIssues = (key, zodError) =>
  zodError.issues.map(issue => ({
    field: issue.path.join('.') || key,
    message: issue.message,
  }));

/**
 * Build an Express middleware that validates and whitelists parts of the
 * request against Zod schemas.
 *
 * @param {object} schemas
 * @param {import('zod').ZodType} [schemas.body]
 * @param {import('zod').ZodType} [schemas.params]
 * @param {import('zod').ZodType} [schemas.query]
 * @returns {import('express').RequestHandler}
 */
export const validate = schemas => (req, res, next) => {
  const allIssues = [];

  for (const key of ['params', 'body', 'query']) {
    const schema = schemas?.[key];
    if (!schema) {
      continue;
    }

    const result = schema.safeParse(req[key]);

    if (!result.success) {
      allIssues.push(...collectIssues(key, result.error));
      continue;
    }

    if (key === 'query') {
      // Express 5 exposes req.query as a getter-only accessor with no
      // setter, so a plain assignment throws in strict-mode ESM. This is
      // the only way to replace it with the parsed/whitelisted value.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      req[key] = result.data;
    }
  }

  if (allIssues.length > 0) {
    return next(new ApiError(400, 'Validation error', allIssues));
  }

  next();
};

export default validate;
