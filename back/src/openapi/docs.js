export const API_DOCS_PATH = '/api/docs';

/**
 * Serves Swagger UI over the OpenAPI document at /api/docs, in development and
 * nowhere else.
 *
 * The comparison is against the literal environment variable, not against the
 * `env` config object: that object defaults NODE_ENV to `development` when it
 * is unset, and a deployment that forgot to set it must not start publishing
 * its own route list. Test and production never mount the route, so it
 * answers 404 like any unknown path and the production policy is untouched.
 *
 * Swagger UI is a development dependency and is imported here, after the
 * check, so a production image that installed only production dependencies
 * never looks for it. Its page and script are same origin and its inline
 * styles are allowed by helmet's default policy, so no directive is relaxed.
 *
 * @param {import('express').Express} app
 * @param {string | undefined} [nodeEnv]
 * @returns {Promise<boolean>} whether the route was mounted
 */
export const mountApiDocs = async (app, nodeEnv = process.env.NODE_ENV) => {
  if (nodeEnv !== 'development') {
    return false;
  }

  const [{ default: swaggerUi }, { buildOpenApiSpec }] = await Promise.all([
    import('swagger-ui-express'),
    import('./spec.js'),
  ]);

  app.use(
    API_DOCS_PATH,
    swaggerUi.serve,
    swaggerUi.setup(buildOpenApiSpec(), { customSiteTitle: 'BreezyBoard API' })
  );

  return true;
};
