import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

// Suite 2: the documented security holes.
//
// Every hole recorded in the revival plan as P1-1 through P1-6 and H2 is now
// closed, so every test here is an ordinary test(...) and must stay green.
//
// They started life wrapped in Vitest's test.fails(...), each asserting the
// CORRECT secure behavior. While a hole was open the assertion threw, so the
// wrapper reported an expected failure and the suite was green. Closing the
// hole made the assertion pass, which made test.fails turn red, which forced
// whoever fixed it to flip the test rather than leave a skipped one behind.
// That is the pattern to reuse for any hole found from here on: write the
// secure assertion, wrap it, and let the wrapper go off when the work lands.
//
// Each closed hole also has a companion positive-case test. Without those, a
// middleware that simply denied everyone would pass this entire file.

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
      const columns = await boardColumns(board._id);
      const task = await createTask(owner.token, board._id, colors.taskColor._id, {
        status: columns[0]._id.toString(),
      });

      // The payload has to be a legitimate move for this assertion to mean
      // anything. Request validation runs before the authorization
      // middleware, so a malformed body gets a 400 and the outsider never
      // reaches the check this test exists to prove. It used to send the
      // literal 'done', which was well formed only because status accepted
      // any string at the time, and later an absolute `order`, which the
      // neighbour-based contract no longer accepts.
      const res = await request(app)
        .patch(`/api/tasks/${task._id}/move`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ status: columns[columns.length - 1]._id.toString(), afterId: null, beforeId: null });

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

  // Finding P1-3: PUT /api/tasks/:id used to accept a boardId in the body
  // and relocate the task into a different board. Fixed: updateTaskSchema
  // whitelists the body and strips boardId before it reaches
  // task.service.js updateTask, so the request succeeds but the task stays
  // on its original board.
  test('PUT /api/tasks/:id should not accept a boardId that relocates the task', async () => {
    const otherBoard = await createBoard(owner.token, colors.boardColor._id, { title: 'Other Board' });
    const task = await createTask(owner.token, board._id, colors.taskColor._id);

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ boardId: otherBoard._id });

    expect(res.status).toBe(200);
    expect(res.body.data.boardId).toBe(board._id);
  });

  // New coverage for the request-validation layer: updateTaskSchema
  // whitelists the update body, so a field never defined in the schema
  // (unrelated to boardId relocation) is also silently stripped rather than
  // persisted.
  test('PUT /api/tasks/:id strips an unexpected field instead of persisting it', async () => {
    const task = await createTask(owner.token, board._id, colors.taskColor._id);

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Updated by owner', internalNote: 'hack' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated by owner');
    expect(res.body.data.internalNote).toBeUndefined();

    const check = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(check.body.data.internalNote).toBeUndefined();
  });

  // Finding P1-4, carried over to the contract that replaced the endpoint it
  // was written against.
  //
  // The bulk renumbering route these two tests used to drive no longer
  // exists: ordering is a fractional index and a move writes one document,
  // so there is nothing left to renumber. The property P1-4 protects is not
  // gone with it, it only moved. A client still names other tasks when it
  // moves one, as the neighbours it dropped between, and naming a task from
  // a board the caller has no business reading must not work.
  //
  // task.service.js scopes the neighbour lookup to the authorized board and
  // the target column, so a foreign neighbour is not found and the move is
  // refused rather than being quietly placed somewhere arbitrary.
  test('a move naming a neighbour from a different board is refused', async () => {
    const otherOwnerBoard = await createBoard(outsider.token, colors.boardColor._id, { title: 'Outsider Board' });
    const otherTask = await createTask(outsider.token, otherOwnerBoard._id, colors.taskColor._id);

    const task = await createTask(owner.token, board._id, colors.taskColor._id);
    const columns = await boardColumns(board._id);
    const before = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${owner.token}`);

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: columns[0]._id.toString(), afterId: otherTask._id });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');

    // Refused means nothing moved, not merely that the response said no.
    const after = await request(app).get(`/api/tasks/${task._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(after.body.data.order).toBe(before.body.data.order);
  });

  // Positive case, for the same reason the old one existed: a scoping guard
  // that refused every neighbour would pass the test above and break the
  // feature entirely.
  test('a move naming a neighbour from the same board and column still works', async () => {
    const columns = await boardColumns(board._id);
    const first = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'First' });
    const second = await createTask(owner.token, board._id, colors.taskColor._id, { title: 'Second' });

    const res = await request(app)
      .patch(`/api/tasks/${second._id}/move`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: columns[0]._id.toString(), afterId: null, beforeId: first._id });

    expect(res.status).toBe(200);
    expect(res.body.data.order < first.order).toBe(true);
  });

  // Finding P1-6: POST /api/auth/login used to treat an object value for
  // `email` as a MongoDB query operator instead of rejecting non-string
  // input. Fixed: loginSchema requires email to be a string in valid email
  // format, so a non-string value like { $ne: null } fails validation (400)
  // before it ever reaches User.findOne({ email }).
  test('login with a $ne query operator as email should be rejected as invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: 'anything' });

    expect(res.status).toBe(400);
  });

  // New coverage for the request-validation layer: any non-string email
  // (not just a Mongo operator object) must be rejected as invalid input.
  test('login with a numeric email should be rejected as invalid input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 123, password: 'whatever' });

    expect(res.status).toBe(400);
  });

  // Positive case for P1-6: a valid, correctly-typed email with a wrong
  // password must still fail as an authentication error (401), not a
  // validation error. Guards against loginSchema turning every wrong
  // password into a 400.
  test('login with a valid email and wrong password should be rejected as invalid credentials', async () => {
    const registered = await registerUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: registered.user.email, password: 'definitely-wrong' });

    expect(res.status).toBe(401);
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

describe('avatar upload content verification', () => {
  let user;

  beforeEach(async () => {
    await seedColorsAndTemplates();
    user = await registerUser({ email: 'uploader@example.com' });
  });

  // Multer's fileFilter only sees the mime type the client declares, which is
  // attacker controlled. These two pin that the bytes on disk are what decide.
  test('rejects a file whose declared type does not match its contents', async () => {
    const res = await request(app)
      .post(`/api/users/${user.user._id}/avatar`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', Buffer.from('#!/bin/sh\necho not an image\n'), {
        filename: 'payload.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
  });

  test('answers 400 with its own code for a declared type that is not an image', async () => {
    const res = await request(app)
      .post(`/api/users/${user.user._id}/avatar`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'INVALID_FILE_TYPE',
      message: 'Invalid file type. Only image files are allowed.',
    });
  });

  test('answers 400 with its own code for a file over 6 MB', async () => {
    const oversized = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(6 * 1024 * 1024 + 1),
    ]);

    const res = await request(app)
      .post(`/api/users/${user.user._id}/avatar`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', oversized, { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'FILE_TOO_LARGE',
      message: 'That file is too large. The limit is 6 MB.',
    });
  });

  test('accepts a file whose bytes really are a PNG', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);

    const res = await request(app)
      .post(`/api/users/${user.user._id}/avatar`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', png, { filename: 'avatar.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
  });
});
