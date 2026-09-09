import request from 'supertest';
import app from '../../src/app.js';

// Creates a task through the real API. `colorId` must reference an
// existing ColorPalette document (see seedColorsAndTemplates).
export async function createTask(token, boardId, colorId, overrides = {}) {
  const payload = {
    title: 'Test Task',
    status: 'todo',
    color: colorId,
    ...overrides,
  };

  const res = await request(app)
    .post(`/api/tasks/board/${boardId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  if (res.status !== 201) {
    throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.data;
}
