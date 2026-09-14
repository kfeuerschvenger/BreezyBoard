import request from 'supertest';
import app from '../../src/app.js';
import BoardTemplate from '../../src/models/BoardTemplate.js';

// Creates a board through the real API. `colorId` must reference an
// existing ColorPalette document (see seedColorsAndTemplates).
//
// A template is attached by default because a board without one has no
// columns, and a task cannot be given a valid status on a board with no
// columns. The real frontend always sends a template (CreateBoardModal
// preselects the first one), so the default here matches what actually
// happens. A test that specifically wants a board with no columns passes
// `template: null` and the spread below wins.
export async function createBoard(token, colorId, overrides = {}) {
  const template = await BoardTemplate.findOne().select('_id');

  const payload = {
    title: 'Test Board',
    description: 'A board created for testing',
    color: colorId,
    template: template?._id?.toString(),
    ...overrides,
  };

  const res = await request(app).post('/api/boards').set('Authorization', `Bearer ${token}`).send(payload);

  if (res.status !== 201) {
    throw new Error(`createBoard failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.data;
}
