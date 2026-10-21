import fs from 'fs';
import { z } from 'zod';
import { ErrorCode } from '../constants/errorCodes.js';
import { operations, requestModels, responseModels } from './operations.js';
import {
  BoardSchema,
  ChecklistItemSchema,
  ColorRefSchema,
  ColorSchema,
  ColumnSchema,
  DashboardStatsSchema,
  ErrorBodySchema,
  PaginationSchema,
  TaskSchema,
  TaskWithIdsSchema,
  TemplateColumnSchema,
  TemplateRefSchema,
  TemplateSchema,
  UserSchema,
  UserSummarySchema,
  WorkspaceSchema,
} from './schemas.js';

/**
 * The OpenAPI 3.1 document, built in memory from the Zod schemas the routes
 * validate with and the response schemas next to them. `npm run openapi`
 * writes it to docs/openapi.yaml, `npm run openapi:check` fails when that file
 * is out of date, and the development server serves it at /api/docs.
 *
 * Zod 4 converts its own schemas (`z.toJSONSchema`), and OpenAPI 3.1 takes
 * JSON Schema 2020-12 as it comes, so no converter library is involved.
 */

const SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const entityModels = {
  User: UserSchema,
  UserSummary: UserSummarySchema,
  ColorRef: ColorRefSchema,
  Color: ColorSchema,
  TemplateRef: TemplateRefSchema,
  TemplateColumn: TemplateColumnSchema,
  Template: TemplateSchema,
  Column: ColumnSchema,
  Board: BoardSchema,
  ChecklistItem: ChecklistItemSchema,
  Task: TaskSchema,
  TaskWithIds: TaskWithIdsSchema,
  Workspace: WorkspaceSchema,
  DashboardStats: DashboardStatsSchema,
  Pagination: PaginationSchema,
  ErrorBody: ErrorBodySchema,
};

const refTo = name => `#/components/schemas/${name}`;

/**
 * Trims what Zod emits that says nothing a reader or a validator needs: the
 * `$schema` and `$id` of each component, the pattern Zod attaches next to a
 * `date-time` or `email` format, and the safe integer bounds of every integer.
 * The ObjectId pattern is widened to both cases, because the schema carries
 * the `i` flag and a JSON Schema pattern cannot.
 */
const clean = node => {
  if (Array.isArray(node)) {
    return node.map(clean);
  }

  if (node === null || typeof node !== 'object') {
    return node;
  }

  const result = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === '$id') continue;
    if (key === 'pattern' && (node.format === 'date-time' || node.format === 'email')) continue;
    if ((key === 'maximum' && value === SAFE_INTEGER) || (key === 'minimum' && value === -SAFE_INTEGER)) continue;

    result[key] = key === 'pattern' && value === '^[0-9a-f]{24}$' ? '^[0-9a-fA-F]{24}$' : clean(value);
  }

  return result;
};

const toJsonSchema = (schema, io) => clean(z.toJSONSchema(schema, { target: 'draft-2020-12', io }));

const componentSchemas = () => {
  const build = (models, io) => {
    const registry = z.registry();
    for (const [id, schema] of Object.entries(models)) {
      registry.add(schema, { id });
    }
    return z.toJSONSchema(registry, { target: 'draft-2020-12', io, uri: refTo }).schemas;
  };

  return clean({
    ...build(requestModels, 'input'),
    ...build({ ...entityModels, ...responseModels }, 'output'),
  });
};

/** A parameter list from the properties of a Zod object schema. */
const parametersFrom = (schema, location) => {
  const json = toJsonSchema(schema, 'input');
  const required = new Set(json.required ?? []);

  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, ...rest } = property;

    return {
      name,
      in: location,
      required: location === 'path' || required.has(name),
      ...(description && { description }),
      schema: rest,
    };
  });
};

const operationId = (method, path) => {
  const words = path
    .split('/')
    .filter(Boolean)
    .map(segment => (segment.startsWith('{') ? `By${capitalize(segment.slice(1, -1))}` : capitalize(segment)))
    .map(word => word.replace(/-(\w)/g, (_, letter) => letter.toUpperCase()));

  return `${method}${words.join('')}`;
};

const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);

const ERROR_RESPONSES = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  429: 'TooManyRequests',
  500: 'InternalError',
  503: 'ServiceUnavailable',
};

const buildOperation = operation => {
  const { method, path, tag, summary, description, access, deprecated, request = {}, body, bodyKind, success } = operation;
  const authenticated = !operation.public;

  const parameters = [
    ...(request.params ? parametersFrom(request.params, 'path') : []),
    ...(request.query ? parametersFrom(request.query, 'query') : []),
  ];

  const validated = Boolean(request.params || request.query || body || bodyKind);
  const statuses = new Set([...(operation.errors ?? []), 500]);

  if (validated) statuses.add(400);
  if (authenticated) statuses.add(401);

  const headers = {
    'X-Request-Id': { $ref: '#/components/headers/XRequestId' },
    ...(authenticated && { 'X-Auth-Token': { $ref: '#/components/headers/XAuthToken' } }),
  };

  const responses = {
    [success.status]: {
      description: success.description,
      headers,
      ...(success.model && {
        content: { 'application/json': { schema: { $ref: refTo(success.model) } } },
      }),
    },
  };

  for (const status of [...statuses].sort((a, b) => a - b)) {
    responses[status] = { $ref: `#/components/responses/${ERROR_RESPONSES[status]}` };
  }

  const paragraphs = [description, access && `Access: ${access}`].filter(Boolean).join(' ');

  return {
    tags: [tag],
    summary,
    ...(paragraphs && { description: paragraphs }),
    operationId: operationId(method, path),
    ...(deprecated && { deprecated: true }),
    security: authenticated ? [{ bearerAuth: [] }] : [],
    ...(parameters.length > 0 && { parameters }),
    ...(body && {
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: refTo(body) } } },
      },
    }),
    ...(bodyKind === 'multipart' && {
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: { avatar: { type: 'string', format: 'binary' } },
              required: ['avatar'],
            },
            encoding: { avatar: { contentType: 'image/png, image/jpeg, image/webp, image/gif' } },
          },
        },
      },
    }),
    responses,
  };
};

const errorResponse = (description, example) => ({
  description,
  headers: { 'X-Request-Id': { $ref: '#/components/headers/XRequestId' } },
  content: {
    'application/json': {
      schema: { $ref: refTo('ErrorBody') },
      example,
    },
  },
});

const tags = [
  { name: 'Auth', description: 'Accounts, the session and password recovery.' },
  { name: 'Boards', description: 'Boards, their members, and the soft delete with restore.' },
  { name: 'Tasks', description: 'Tasks, their checklists, ordering, and the soft delete with restore.' },
  { name: 'Reference data', description: 'The colour palette and the board templates.' },
  { name: 'Dashboard', description: 'Totals for the home page.' },
  { name: 'Users', description: 'People, profiles and pictures.' },
  { name: 'Workspaces', description: 'Workspaces and their members.' },
  { name: 'Operations', description: 'Liveness for the container healthcheck and for monitors.' },
];

const introduction = [
  'The BreezyBoard API, the one service behind the web client. Every path below is relative to `/api/v1`. The same routers are also mounted at `/api`, a deprecated alias that answers identically and logs a warning the first time it is used.',
  'Every success is `{ "success": true, "data": ... }`, with a `pagination` object beside `data` on paginated lists. Every failure is `{ "success": false, "message": "...", "code": "...", "errors": [...] }` with a machine readable `code`. Pagination is opt in: without `limit` a list returns everything, and `pagination.total` is always present.',
  'Authentication is a bearer JWT in the `Authorization` header, obtained from `POST /auth/login` or `POST /auth/register`. There is no cookie. The session slides: every authenticated request is answered with a fresh token in the `X-Auth-Token` response header, and the client sends that one next. The token dies after JWT_INACTIVITY_TTL_MS without a request (15 minutes by default) and after JWT_ABSOLUTE_TTL_MS from sign in whatever happens (4 hours by default); logout and a password change revoke every earlier token at once.',
  'Every response carries an `X-Request-Id`. Send your own in the request to have it echoed back, which ties a client log line to a server log line.',
  'Ids are 24 character hexadecimal strings. A malformed id in a path answers 400 before the route reaches the database.',
].join('\n\n');

export const buildOpenApiSpec = () => {
  const { version } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  const paths = {};

  for (const operation of operations) {
    paths[operation.path] ??= {};
    paths[operation.path][operation.method] = buildOperation(operation);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'BreezyBoard API',
      version,
      description: introduction,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: '/api/v1', description: 'The current version of the API.' }],
    tags,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'The token from POST /auth/login or POST /auth/register, or the latest X-Auth-Token response header.',
        },
      },
      headers: {
        XRequestId: {
          description: 'The id of this request, the one sent in X-Request-Id or a generated UUID.',
          schema: { type: 'string' },
        },
        XAuthToken: {
          description: 'The renewed session token. Present on every response once the bearer token has been accepted, errors from the handler included. A client replaces the stored token with it.',
          schema: { type: 'string' },
        },
      },
      responses: {
        BadRequest: errorResponse(
          'The request was refused before any work was done: a malformed id, a field that fails its schema (`errors` lists each as `{ field, message }`), or a rule the service enforces. Specific codes: VALIDATION_ERROR, INVALID_RESET_TOKEN, WRONG_CURRENT_PASSWORD, INVALID_FILE_TYPE, FILE_TOO_LARGE.',
          {
            success: false,
            message: 'Validation error',
            code: ErrorCode.VALIDATION_ERROR,
            errors: [{ field: 'title', message: 'Title is required' }],
          }
        ),
        Unauthorized: errorResponse(
          'No session. Codes: UNAUTHORIZED (no, malformed, expired or unknown token), TOKEN_REVOKED (the token predates a logout or a password change), SESSION_EXPIRED (the absolute limit passed). A client signs the person out on any of them.',
          { success: false, message: 'Authentication required', code: ErrorCode.UNAUTHORIZED, errors: [] }
        ),
        Forbidden: errorResponse(
          'The caller has a session but not the role the route needs.',
          { success: false, message: 'Not authorized to access this board', code: ErrorCode.FORBIDDEN, errors: [] }
        ),
        NotFound: errorResponse(
          'The resource does not exist, is soft deleted, or is one the route is documented to hide from a caller with no role on it.',
          { success: false, message: 'Board not found', code: ErrorCode.NOT_FOUND, errors: [] }
        ),
        Conflict: errorResponse(
          'The request disagrees with the current state of the data. The client should reload and try again.',
          {
            success: false,
            message: 'A neighbouring task is no longer where the client expected it. Reload the board and try again.',
            code: ErrorCode.CONFLICT,
            errors: [],
          }
        ),
        TooManyRequests: errorResponse(
          'The limiter for this route is spent. The body has no `errors`. The `RateLimit-*` response headers say when the budget returns.',
          { success: false, message: 'Too many attempts. Please wait before trying again.', code: ErrorCode.RATE_LIMITED }
        ),
        InternalError: errorResponse(
          'An unexpected failure. The body names nothing about it and has no `errors`; the request id points at the log line.',
          { success: false, message: 'Internal Server Error', code: ErrorCode.INTERNAL }
        ),
        ServiceUnavailable: {
          description: 'The database is not reachable. The body names nothing about the deployment.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { const: 'unavailable' },
                  message: { const: 'Service unavailable' },
                },
                required: ['status', 'message'],
              },
              example: { status: 'unavailable', message: 'Service unavailable' },
            },
          },
        },
      },
      schemas: componentSchemas(),
    },
  };
};
