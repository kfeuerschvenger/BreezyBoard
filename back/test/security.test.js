import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

// Suite 2: documented, unfixed security holes.
//
// Each test.fails(...) below asserts the CORRECT, secure behavior. Today
// that assertion throws because the vulnerability is present, which makes
// the wrapped test.fails report green (expected failure). The moment the
// underlying hole is closed, the assertion will stop throwing and
// test.fails will turn red, forcing whoever fixed it to flip it into a
// normal test(...).

describe('security tripwires', () => {
  let colors;
  let owner;
  let outsider;
  let board;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
    outsider = await registerUser();
    board = await createBoard(owner.token, colors.boardColor._id);
  });

  describe('P1-1: task IDOR, no board-membership check on individual task routes', () => {
    // Finding P1-1: GET /api/tasks/:id does not verify the caller belongs to
    // the task's board. Actual current behavior: returns 200 with the full
    // task document to any authenticated user.
    test.fails('GET /api/tasks/:id on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    // Finding P1-1: PUT /api/tasks/:id does not verify board membership.
    // Actual current behavior: returns 200 and overwrites the task.
    test.fails('PUT /api/tasks/:id on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ title: 'Overwritten by outsider' });

      expect(res.status).toBe(403);
    });

    // Finding P1-1: DELETE /api/tasks/:id does not verify board membership.
    // Actual current behavior: returns 200 and deletes the task.
    test.fails('DELETE /api/tasks/:id on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app)
        .delete(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    // Finding P1-1: PATCH /api/tasks/:id/move does not verify board
    // membership. Actual current behavior: returns 200 and moves the task.
    test.fails('PATCH /api/tasks/:id/move on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: 'todo', order: 0 });

      const res = await request(app)
        .patch(`/api/tasks/${task._id}/move`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ status: 'done', order: 5 });

      expect(res.status).toBe(403);
    });

    // Finding P1-1: PATCH /api/tasks/:taskId/checklist/:itemId does not
    // verify board membership. Actual current behavior: returns 200 and
    // updates the checklist item.
    test.fails('PATCH /api/tasks/:taskId/checklist/:itemId on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, {
        checklist: [{ text: 'Step one' }],
      });
      const itemId = task.checklist[0]._id;

      const res = await request(app)
        .patch(`/api/tasks/${task._id}/checklist/${itemId}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ completed: true });

      expect(res.status).toBe(403);
    });
  });

  describe('P1-2: board members can perform creator-only actions', () => {
    // Finding P1-2: PUT /api/boards/:id lets any member (not just the
    // creator) replace `members` and `createdBy`, taking over the board.
    // Actual current behavior: returns 200 and applies the takeover.
    test.fails('a member should not be able to take over a board via PUT', async () => {
      const member = await registerUser();
      await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ members: [member.user.id ?? member.user._id] });

      const res = await request(app)
        .put(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({
          title: 'Hijacked board',
          members: [member.user.id ?? member.user._id],
          createdBy: member.user.id ?? member.user._id,
        });

      expect(res.status).toBe(403);
    });

    // Finding P1-2: DELETE /api/boards/:id is allowed for any member, not
    // only the creator. Actual current behavior: returns 200 and deletes
    // the board.
    test.fails('a member should not be able to delete the board', async () => {
      const member = await registerUser();
      await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ members: [member.user.id ?? member.user._id] });

      const res = await request(app)
        .delete(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(403);
    });
  });

  // Finding P1-3: PUT /api/tasks/:id accepts a boardId in the body and
  // relocates the task into a different board. Actual current behavior:
  // returns 200 and moves the task to the new board.
  test.fails('PUT /api/tasks/:id should not accept a boardId that relocates the task', async () => {
    const otherBoard = await createBoard(owner.token, colors.boardColor._id, { title: 'Other Board' });
    const task = await createTask(owner.token, board._id, colors.taskColor._id);

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ boardId: otherBoard._id });

    expect(res.status).toBe(200);
    expect(res.body.data.boardId).toBe(board._id);
  });

  // Finding P1-4: PATCH /api/tasks/board/:boardId/orders renumbers task ids
  // by id alone, without checking they belong to :boardId. Actual current
  // behavior: returns 200 and renumbers a task that belongs to a board the
  // caller does not even own.
  test.fails('PATCH /api/tasks/board/:boardId/orders should not renumber tasks from a different board', async () => {
    const otherOwnerBoard = await createBoard(outsider.token, colors.boardColor._id, { title: 'Outsider Board' });
    const otherTask = await createTask(outsider.token, otherOwnerBoard._id, colors.taskColor._id, { order: 5 });

    const res = await request(app)
      .patch(`/api/tasks/board/${board._id}/orders`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ updates: [{ id: otherTask._id, order: 999 }] });

    expect(res.status).toBe(200);

    const check = await request(app)
      .get(`/api/tasks/${otherTask._id}`)
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(check.body.data.order).toBe(5);
  });

  // Finding P1-6: POST /api/auth/login treats an object value for `email`
  // as a MongoDB query operator instead of rejecting non-string input.
  // Actual current behavior: the query resolves to some user (matched via
  // { $ne: null }) and the request is rejected only because the supplied
  // password does not match that user's hash (401), not because the input
  // shape itself was validated (400).
  test.fails('login with a $ne query operator as email should be rejected as invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: 'anything' });

    expect(res.status).toBe(400);
  });

  // Finding H2: GET /api/users/board-members does not verify the caller
  // belongs to the requested board. Actual current behavior: returns 200
  // with the full member list to any authenticated user.
  test.fails('GET /api/users/board-members for a board the caller does not belong to should be 403', async () => {
    const res = await request(app)
      .get('/api/users/board-members')
      .query({ boardId: board._id })
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });
});
