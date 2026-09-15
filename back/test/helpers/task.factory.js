import request from 'supertest';
import app from '../../src/app.js';
import Board from '../../src/models/Board.js';

// The columns of a board, ordered, as the board page sees them. Tests that
// need to name a specific column (moving a task from the first to the last,
// say) use this rather than inventing a string.
//
// These are the board's own columns, copied from its template at creation,
// so two boards built from one template have different column ids here.
export async function boardColumns(boardId) {
  const board = await Board.findById(boardId).select('columns');
  const columns = [...(board?.columns ?? [])];

  return columns.sort((a, b) => a.order - b.order);
}

// Creates a task through the real API. `colorId` must reference an
// existing ColorPalette document (see seedColorsAndTemplates).
//
// status defaults to the board's first column, which is exactly what the
// real frontend does for a new task (handleAddTask in front/src/pages/Board.tsx).
// It is an id and not a label: a task whose status names no column of its
// board is refused by task.service.js.
export async function createTask(token, boardId, colorId, overrides = {}) {
  const columns = await boardColumns(boardId);

  const payload = {
    title: 'Test Task',
    status: columns[0]?._id?.toString(),
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
