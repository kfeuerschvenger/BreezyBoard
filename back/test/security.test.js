import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

// Suite 2: documented security holes.
//
// P1-3 and P1-6 are still open and remain wrapped in test.fails(...): each
// asserts the CORRECT, secure behavior, which today throws because the
// vulnerability is present, so the wrapper reports green (expected
// failure). The moment either hole is closed, its assertion will stop
// throwing and test.fails will turn red, forcing whoever fixed it to flip
// it into a normal test(...), the same way P1-1, P1-2, P1-4, and H2 were
// flipped below once their fixes landed. Each closed hole also has a
// companion positive-case test guarding against a middleware that denies
// everyone instead of enforcing the actual role check.

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
    // Finding P1-1: GET /api/tasks/:id now goes through requireTaskBoardRole,
    // which loads the task's board and rejects a caller who is not at least
    // a member of it.
    test('GET /api/tasks/:id on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    // Finding P1-1: PUT /api/tasks/:id now requires board membership via
    // requireTaskBoardRole.
    test('PUT /api/tasks/:id on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ title: 'Overwritten by outsider' });

      expect(res.status).toBe(403);
    });

    // Finding P1-1: DELETE /api/tasks/:id now requires board membership via
    // requireTaskBoardRole.
    test('DELETE /api/tasks/:id on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app)
        .delete(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(403);
    });

    // Finding P1-1: PATCH /api/tasks/:id/move now requires board membership
    // via requireTaskBoardRole.
    test('PATCH /api/tasks/:id/move on another users task should be 403', async () => {
      const task = await createTask(owner.token, board._id, colors.taskColor._id, { status: 'todo', order: 0 });

      const res = await request(app)
        .patch(`/api/tasks/${task._id}/move`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ status: 'done', order: 5 });

      expect(res.status).toBe(403);
    });

    // Finding P1-1: PATCH /api/tasks/:taskId/checklist/:itemId now requires
    // board membership via requireTaskBoardRole.
    test('PATCH /api/tasks/:taskId/checklist/:itemId on another users task should be 403', async () => {
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

    // Positive case for P1-1: a legitimate board member (not the creator)
    // must still be able to read a task on their own board. Guards against
    // requireTaskBoardRole denying everyone instead of enforcing the role
    // check.
    test('GET /api/tasks/:id succeeds for a board member', async () => {
      const member = await registerUser();
      await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ members: [member.user.id ?? member.user._id] });

      const task = await createTask(owner.token, board._id, colors.taskColor._id);

      const res = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(task._id);
    });
  });

  describe('P1-2: board members can perform creator-only actions', () => {
    // Finding P1-2: PUT /api/boards/:id now requires the 'owner' role via
    // requireBoardRole('owner'), so a plain member can no longer take over
    // the board by replacing `members`/`createdBy`.
    test('a member should not be able to take over a board via PUT', async () => {
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

    // Finding P1-2: DELETE /api/boards/:id now requires the 'owner' role via
    // requireBoardRole('owner').
    test('a member should not be able to delete the board', async () => {
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

    // Positive case for P1-2: the creator (owner) must still be able to
    // update the board via PUT. Guards against requireBoardRole('owner')
    // denying everyone instead of enforcing the role check.
    test('the creator can still update the board via PUT', async () => {
      const res = await request(app)
        .put(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Renamed by owner' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Renamed by owner');
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

  // Finding P1-4: PATCH /api/tasks/board/:boardId/orders now filters
  // task.service.updateOrders by boardId before writing, so a task id in the
  // body that does not belong to :boardId is silently skipped instead of
  // renumbered.
  test('PATCH /api/tasks/board/:boardId/orders should not renumber tasks from a different board', async () => {
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

  // Positive case for P1-4: renumbering a task that genuinely belongs to
  // :boardId must still work. Guards against updateOrders filtering out
  // every task instead of only the out-of-board ones.
  test('PATCH /api/tasks/board/:boardId/orders still renumbers a task that belongs to the board', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id, { order: 0 });

    const res = await request(app)
      .patch(`/api/tasks/board/${board._id}/orders`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ updates: [{ id: task._id, order: 7 }] });

    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(check.body.data.order).toBe(7);
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

  // Finding H2: GET /api/users/board-members now requires membership of the
  // queried board via requireBoardRole('member').
  test('GET /api/users/board-members for a board the caller does not belong to should be 403', async () => {
    const res = await request(app)
      .get('/api/users/board-members')
      .query({ boardId: board._id })
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });

  // Positive case for H2: a genuine board member must still be able to list
  // the board's members. Guards against requireBoardRole('member') denying
  // everyone instead of enforcing the role check.
  test('GET /api/users/board-members succeeds for a board member', async () => {
    const member = await registerUser();
    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const res = await request(app)
      .get('/api/users/board-members')
      .query({ boardId: board._id })
      .set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(200);
  });
});
