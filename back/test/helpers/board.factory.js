import request from 'supertest';
import app from '../../src/app.js';

// Creates a board through the real API. `colorId` must reference an
// existing ColorPalette document (see seedColorsAndTemplates).
export async function createBoard(token, colorId, overrides = {}) {
  const payload = {
    title: 'Test Board',
    description: 'A board created for testing',
    color: colorId,
    ...overrides,
  };

  const res = await request(app).post('/api/boards').set('Authorization', `Bearer ${token}`).send(payload);

  if (res.status !== 201) {
    throw new Error(`createBoard failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.data;
}
