import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { responseModels } from '../src/openapi/operations.js';
import { ErrorBodySchema } from '../src/openapi/schemas.js';
import { buildOpenApiSpec } from '../src/openapi/spec.js';
import { apiRouters } from '../src/routes/index.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch'];

// `/boards` mounted a router whose route is `/` joins to `/boards/`, and the
// document spells it without the trailing slash.
const toTemplate = expressPath => expressPath.replace(/:(\w+)/g, '{$1}').replace(/(.)\/$/, '$1');

/** Every `method path` an Express router registers, below the given mount path. */
const routesOf = (router, mountPath = '') =>
  router.stack
    .filter(layer => layer.route)
    .flatMap(layer =>
      Object.keys(layer.route.methods)
        .filter(method => layer.route.methods[method])
        .map(method => `${method} ${toTemplate(mountPath + layer.route.path)}`)
    );

describe('every route is in the OpenAPI document', () => {
  const spec = buildOpenApiSpec();

  const documented = Object.entries(spec.paths)
    .flatMap(([path, item]) => HTTP_METHODS.filter(method => item[method]).map(method => `${method} ${path}`))
    .sort();

  // The application's own stack, so a router mounted in app.js without going
  // through the table, or a route added straight to the app, is seen too.
  const layers = app.router.stack;
  const mountedRouters = layers.filter(layer => layer.handle?.stack).map(layer => layer.handle);
  const appRoutes = layers.filter(layer => layer.route).map(layer => layer.route);

  test('each router app.js mounts comes from the routes table, once per path prefix', () => {
    const tabled = Object.values(apiRouters);

    expect(mountedRouters).toHaveLength(tabled.length * 2);
    expect(mountedRouters.every(router => tabled.includes(router))).toBe(true);

    for (const router of tabled) {
      expect(mountedRouters.filter(mounted => mounted === router)).toHaveLength(2);
    }
  });

  test('the routes registered on the app itself are the two health paths', () => {
    expect(appRoutes.map(route => route.path).sort()).toEqual(['/api/health', '/api/v1/health']);
  });

  test('the document describes exactly the routes the routers register, no more and no fewer', () => {
    const registered = [
      ...Object.entries(apiRouters).flatMap(([mountPath, router]) => routesOf(router, mountPath)),
      'get /health',
    ].sort();

    expect(documented).toEqual(registered);
  });

  test('every operation has a unique id, a success response and the 500 every route can answer', () => {
    const ids = [];

    for (const item of Object.values(spec.paths)) {
      for (const method of HTTP_METHODS.filter(name => item[name])) {
        const operation = item[method];
        ids.push(operation.operationId);

        expect(Object.keys(operation.responses).some(status => status.startsWith('2'))).toBe(true);
        expect(operation.responses['500']).toBeDefined();
      }
    }

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every authenticated operation lists the 401 and declares the bearer scheme', () => {
    for (const item of Object.values(spec.paths)) {
      for (const method of HTTP_METHODS.filter(name => item[name])) {
        const operation = item[method];
        const isPublic = operation.security.length === 0;

        // A public route may still answer 401, as the sign in does for wrong credentials.
        if (!isPublic) {
          expect(operation.responses['401']).toBeDefined();
        }

        expect(operation.security).toEqual(isPublic ? [] : [{ bearerAuth: [] }]);
      }
    }
  });

  test('exactly the routes that need no session are public', () => {
    const publicOperations = Object.entries(spec.paths)
      .flatMap(([path, item]) => HTTP_METHODS.filter(method => item[method]).map(method => [method, path, item[method]]))
      .filter(([, , operation]) => operation.security.length === 0)
      .map(([method, path]) => `${method} ${path}`)
      .sort();

    expect(publicOperations).toEqual([
      'get /health',
      'post /auth/forgot-password',
      'post /auth/login',
      'post /auth/register',
      'post /auth/reset-password',
    ]);
  });

  test('every $ref in the document points at something the document defines', () => {
    const refs = [...JSON.stringify(spec).matchAll(/"\$ref":"#\/([^"]+)"/g)].map(match => match[1].split('/'));

    expect(refs.length).toBeGreaterThan(0);

    for (const segments of refs) {
      const target = segments.reduce((node, key) => node?.[key], spec);

      expect(target, segments.join('/')).toBeDefined();
    }
  });
});

describe('the response schemas match what the API really answers', () => {
  let owner;
  let colors;
  let board;
  let task;

  const auth = () => ({ Authorization: `Bearer ${owner.token}` });

  let step = 0;

  const expectShape = (model, body) => {
    step += 1;
    const result = responseModels[model].safeParse(body);

    expect(result.success, result.success ? '' : `step ${step}, ${model}: ${JSON.stringify(result.error.issues)}`).toBe(true);
  };

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id);
    const columns = await boardColumns(board._id);
    task = await createTask(owner.token, board._id, colors.taskColor._id, {
      owner: owner.user._id,
      status: columns[0]._id.toString(),
      checklist: [{ text: 'first' }],
    });
  });

  test('auth', async () => {
    const credentials = { email: owner.user.email, password: 'Password123!' };

    expectShape('AuthResponse', (await request(app).post('/api/v1/auth/login').send(credentials)).body);
    expectShape('UserResponse', (await request(app).get('/api/v1/auth/me').set(auth())).body);
    expectShape('ValidResponse', (await request(app).get('/api/v1/auth/validate-token').set(auth())).body);
    expectShape(
      'AcceptedResponse',
      (await request(app).post('/api/v1/auth/forgot-password').send({ email: owner.user.email })).body
    );
    expectShape(
      'ChangedResponse',
      (
        await request(app)
          .post('/api/v1/auth/change-password')
          .set(auth())
          .send({ currentPassword: 'Password123!', newPassword: 'Password456!' })
      ).body
    );
  });

  test('registration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'Password123!' });

    expect(res.status).toBe(201);
    expectShape('AuthResponse', res.body);
  });

  test('boards', async () => {
    const other = await registerUser();

    expectShape('BoardResponse', { success: true, data: board });
    expectShape('BoardListResponse', (await request(app).get('/api/v1/boards').set(auth())).body);
    expectShape('BoardListResponse', (await request(app).get('/api/v1/boards?limit=1').set(auth())).body);
    expectShape('BoardResponse', (await request(app).get(`/api/v1/boards/${board._id}`).set(auth())).body);
    expectShape(
      'BoardResponse',
      (await request(app).put(`/api/v1/boards/${board._id}`).set(auth()).send({ title: 'Renamed' })).body
    );
    expectShape(
      'BoardResponse',
      (await request(app).patch(`/api/v1/boards/${board._id}/members`).set(auth()).send({ members: [other.user._id] }))
        .body
    );
    expectShape('BoardDeletedResponse', (await request(app).delete(`/api/v1/boards/${board._id}`).set(auth())).body);
    expectShape('BoardResponse', (await request(app).post(`/api/v1/boards/${board._id}/restore`).set(auth())).body);
  });

  test('tasks', async () => {
    const columns = await boardColumns(board._id);

    expectShape('TaskResponse', { success: true, data: task });
    expectShape('TaskListResponse', (await request(app).get(`/api/v1/tasks/board/${board._id}`).set(auth())).body);
    expectShape('TaskResponse', (await request(app).get(`/api/v1/tasks/${task._id}`).set(auth())).body);
    expectShape(
      'TaskResponse',
      (await request(app).put(`/api/v1/tasks/${task._id}`).set(auth()).send({ priority: 'high' })).body
    );
    expectShape(
      'TaskResponse',
      (await request(app).patch(`/api/v1/tasks/${task._id}/move`).set(auth()).send({ status: columns[1]._id.toString() }))
        .body
    );
    expectShape(
      'TaskWithIdsResponse',
      (
        await request(app)
          .patch(`/api/v1/tasks/${task._id}/checklist/${task.checklist[0]._id}`)
          .set(auth())
          .send({ completed: true })
      ).body
    );
    expectShape(
      'TaskWithIdsResponse',
      (await request(app).delete(`/api/v1/tasks/${task._id}/checklist/${task.checklist[0]._id}`).set(auth())).body
    );
    expectShape('TaskDeletedResponse', (await request(app).delete(`/api/v1/tasks/${task._id}`).set(auth())).body);
    expectShape('TaskResponse', (await request(app).post(`/api/v1/tasks/${task._id}/restore`).set(auth())).body);
  });

  test('workspaces, reference data, dashboard, users and health', async () => {
    const workspaces = await request(app).get('/api/v1/workspaces').set(auth());
    const workspaceId = workspaces.body.data[0]._id;

    expectShape('WorkspaceListResponse', workspaces.body);
    expectShape('WorkspaceResponse', (await request(app).get(`/api/v1/workspaces/${workspaceId}`).set(auth())).body);
    expectShape(
      'WorkspaceResponse',
      (await request(app).post('/api/v1/workspaces').set(auth()).send({ name: 'Studio' })).body
    );
    expectShape(
      'WorkspaceResponse',
      (
        await request(app)
          .patch(`/api/v1/workspaces/${workspaceId}/members`)
          .set(auth())
          .send({ members: [{ user: (await registerUser()).user._id }] })
      ).body
    );

    expectShape('ColorListResponse', (await request(app).get('/api/v1/colors').set(auth())).body);
    expectShape(
      'ColorResponse',
      (await request(app).get(`/api/v1/colors/${colors.boardColor._id}`).set(auth())).body
    );
    expectShape('TemplateListResponse', (await request(app).get('/api/v1/templates').set(auth())).body);
    expectShape('DashboardStatsResponse', (await request(app).get('/api/v1/dashboard/stats').set(auth())).body);

    expectShape('UserListResponse', (await request(app).get('/api/v1/users/search?q=test').set(auth())).body);
    expectShape(
      'UserListResponse',
      (await request(app).get(`/api/v1/users/board-members?boardId=${board._id}`).set(auth())).body
    );
    expectShape('UserResponse', (await request(app).get(`/api/v1/users/${owner.user._id}`).set(auth())).body);
    expectShape(
      'UserResponse',
      (await request(app).put(`/api/v1/users/${owner.user._id}`).set(auth()).send({ location: 'Lima' })).body
    );

    expectShape('HealthResponse', (await request(app).get('/api/v1/health')).body);
  });

  test('every failure carries the error body', async () => {
    const failures = [
      await request(app).get('/api/v1/boards'),
      await request(app).get('/api/v1/boards/not-an-id').set(auth()),
      await request(app).get(`/api/v1/boards/${'a'.repeat(24)}`).set(auth()),
      await request(app).post('/api/v1/boards').set(auth()).send({}),
      await request(app).post('/api/v1/auth/login').send({ email: owner.user.email, password: 'wrong' }),
    ];

    expect(failures.map(res => res.status)).toEqual([401, 400, 404, 400, 401]);

    for (const res of failures) {
      const result = ErrorBodySchema.safeParse(res.body);

      expect(result.success, JSON.stringify(res.body)).toBe(true);
    }
  });
});
