import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

describe('API versioning', () => {
  test('the unversioned and versioned health paths answer identically', async () => {
    const [unversioned, versioned] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/v1/health'),
    ]);

    expect(unversioned.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(unversioned.body).toEqual(versioned.body);
  });

  test('the unversioned and versioned board list paths answer identically', async () => {
    const colors = await seedColorsAndTemplates();
    const owner = await registerUser();
    await createBoard(owner.token, colors.boardColor._id, { title: 'Shared Board' });

    const [unversioned, versioned] = await Promise.all([
      request(app).get('/api/boards').set('Authorization', `Bearer ${owner.token}`),
      request(app).get('/api/v1/boards').set('Authorization', `Bearer ${owner.token}`),
    ]);

    expect(unversioned.status).toBe(200);
    expect(versioned.status).toBe(200);
    expect(unversioned.body.data).toEqual(versioned.body.data);
    expect(unversioned.body.pagination).toEqual(versioned.body.pagination);
  });
});

describe('opt-in pagination', () => {
  let owner;
  let colors;
  let board;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id);
  });

  test('boards: no limit returns the full list and still reports total', async () => {
    await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });
    await createBoard(owner.token, colors.boardColor._id, { title: 'Third Board' });

    const res = await request(app).get('/api/v1/boards').set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination).toEqual({ total: 3 });
  });

  test('boards: a limit returns that page with the correct total', async () => {
    await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });
    await createBoard(owner.token, colors.boardColor._id, { title: 'Third Board' });

    const res = await request(app)
      .get('/api/v1/boards?limit=2')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ total: 3, limit: 2, offset: 0 });
  });

  test('boards: limit with offset pages past the first page', async () => {
    await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });
    await createBoard(owner.token, colors.boardColor._id, { title: 'Third Board' });

    const res = await request(app)
      .get('/api/v1/boards?limit=2&offset=2')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ total: 3, limit: 2, offset: 2 });
  });

  test('tasks by board: no limit returns the full list and still reports total', async () => {
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task A' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task B' });

    const res = await request(app)
      .get(`/api/v1/tasks/board/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ total: 2 });
  });

  test('tasks by board: a limit returns that page with the correct total', async () => {
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task A' });
    await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Task B' });

    const res = await request(app)
      .get(`/api/v1/tasks/board/${board._id}?limit=1`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ total: 2, limit: 1, offset: 0 });
  });
});

describe('machine readable error codes', () => {
  test('a validation error carries VALIDATION_ERROR', async () => {
    const owner = await registerUser();

    const res = await request(app)
      .post('/api/v1/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBeDefined();
  });

  test('a missing token carries UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/boards');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('accessing a board as a non-member carries FORBIDDEN', async () => {
    const colors = await seedColorsAndTemplates();
    const owner = await registerUser();
    const outsider = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app).get(`/api/v1/boards/${board._id}`).set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('a nonexistent board carries NOT_FOUND', async () => {
    const owner = await registerUser();

    const res = await request(app)
      .get('/api/v1/boards/000000000000000000000000')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('a token revoked by logout carries TOKEN_REVOKED', async () => {
    const { token } = await registerUser();

    await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
  });
});

describe('request ids', () => {
  test('a supplied X-Request-Id is echoed back on the response', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'test-request-id-123');

    expect(res.headers['x-request-id']).toBe('test-request-id-123');
  });

  test('a request id is generated when none is supplied', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  test('two requests without a supplied id get different generated ids', async () => {
    const first = await request(app).get('/api/v1/health');
    const second = await request(app).get('/api/v1/health');

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });
});
