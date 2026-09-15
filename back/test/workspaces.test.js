import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import Workspace from '../src/models/Workspace.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { registerUser } from './helpers/user.factory.js';

const idOf = registered => registered.user.id ?? registered.user._id;

describe('workspaces', () => {
  let colors;
  let owner;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
  });

  test('the personal workspace is listed and the caller is its admin', async () => {
    const res = await request(app).get('/api/workspaces').set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isPersonal).toBe(true);
    expect(res.body.data[0].members[0].role).toBe('admin');
  });

  test('a workspace the caller is not in is refused, not reported as missing', async () => {
    const stranger = await registerUser();
    const theirs = await Workspace.findOne({ createdBy: idOf(stranger), isPersonal: true });

    const existing = await request(app)
      .get(`/api/workspaces/${theirs._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    const invented = await request(app)
      .get('/api/workspaces/ffffffffffffffffffffffff')
      .set('Authorization', `Bearer ${owner.token}`);

    // Identical answers on purpose. Workspace ids travel in invitations, and
    // a 404 here versus a 403 there is a way to ask whether an id is real.
    expect(existing.status).toBe(403);
    expect(invented.status).toBe(403);
  });

  test('creating a workspace makes the creator its admin and never a personal one', async () => {
    const res = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Engineering' });

    expect(res.status).toBe(201);
    expect(res.body.data.isPersonal).toBe(false);
    expect(res.body.data.members).toHaveLength(1);
    expect(res.body.data.members[0].role).toBe('admin');
  });

  test('only an admin may change who is in a workspace', async () => {
    const plainMember = await registerUser();
    const workspace = await Workspace.create({
      name: 'Engineering',
      createdBy: idOf(owner),
      members: [
        { user: idOf(owner), role: 'admin' },
        { user: idOf(plainMember), role: 'member' },
      ],
    });

    const outsider = await registerUser();

    const asMember = await request(app)
      .patch(`/api/workspaces/${workspace._id}/members`)
      .set('Authorization', `Bearer ${plainMember.token}`)
      .send({ members: [{ user: idOf(outsider) }] });

    expect(asMember.status).toBe(403);

    const asAdmin = await request(app)
      .patch(`/api/workspaces/${workspace._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [{ user: idOf(outsider) }] });

    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.members).toHaveLength(3);
  });

  test('re-adding an existing admin does not demote them', async () => {
    const other = await registerUser();
    const workspace = await Workspace.create({
      name: 'Engineering',
      createdBy: idOf(owner),
      members: [
        { user: idOf(owner), role: 'admin' },
        { user: idOf(other), role: 'admin' },
      ],
    });

    const res = await request(app)
      .patch(`/api/workspaces/${workspace._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [{ user: idOf(other), role: 'member' }] });

    expect(res.status).toBe(200);
    const membership = res.body.data.members.find(member => (member.user._id ?? member.user) === idOf(other));
    expect(membership.role).toBe('admin');
  });

  describe('two level access', () => {
    let workspace;
    let admin;
    let boardOwner;

    beforeEach(async () => {
      admin = owner;
      boardOwner = await registerUser();

      workspace = await Workspace.create({
        name: 'Engineering',
        createdBy: idOf(admin),
        members: [
          { user: idOf(admin), role: 'admin' },
          { user: idOf(boardOwner), role: 'member' },
        ],
      });
    });

    test('a workspace admin administers a board they were never added to', async () => {
      const board = await createBoard(boardOwner.token, colors.boardColor._id, {
        workspaceId: workspace._id.toString(),
      });

      // Never added to this board's member list. Deleting requires 'owner',
      // which is the strongest thing the board middleware asks for, so if
      // this passes the admin has full standing.
      const res = await request(app)
        .delete(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${admin.token}`);

      expect(res.status).toBe(200);
    });

    test('a workspace member who is not a board member still cannot read the board', async () => {
      const bystander = await registerUser();
      await Workspace.findByIdAndUpdate(workspace._id, {
        $push: { members: { user: idOf(bystander), role: 'member' } },
      });

      const board = await createBoard(boardOwner.token, colors.boardColor._id, {
        workspaceId: workspace._id.toString(),
      });

      const res = await request(app)
        .get(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${bystander.token}`);

      // Being in the workspace makes you eligible for its boards. It does
      // not hand you all of them; that is the difference between the two
      // level model and a single one.
      expect(res.status).toBe(403);
    });

    test('board membership grants nothing once the workspace membership is gone', async () => {
      const collaborator = await registerUser();
      const board = await createBoard(boardOwner.token, colors.boardColor._id, {
        workspaceId: workspace._id.toString(),
      });

      await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${boardOwner.token}`)
        .send({ members: [idOf(collaborator)] });

      const before = await request(app)
        .get(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${collaborator.token}`);

      expect(before.status).toBe(200);

      // Removed from the workspace but deliberately left in Board.members,
      // which is the state a stale invitation leaves behind.
      await Workspace.findByIdAndUpdate(workspace._id, {
        $pull: { members: { user: idOf(collaborator) } },
      });

      const after = await request(app)
        .get(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${collaborator.token}`);

      expect(after.status).toBe(403);
    });

    test('adding somebody to a board also puts them in its workspace', async () => {
      const newcomer = await registerUser();
      const board = await createBoard(boardOwner.token, colors.boardColor._id, {
        workspaceId: workspace._id.toString(),
      });

      const res = await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${boardOwner.token}`)
        .send({ members: [idOf(newcomer)] });

      expect(res.status).toBe(200);

      // Without this the invitation would be inert: they would sit in
      // Board.members and be refused on every request, which reads as a bug
      // rather than as a policy.
      const updated = await Workspace.findById(workspace._id);
      const membership = updated.members.find(member => member.user.toString() === idOf(newcomer));

      expect(membership).toBeDefined();
      expect(membership.role).toBe('member');

      const read = await request(app)
        .get(`/api/boards/${board._id}`)
        .set('Authorization', `Bearer ${newcomer.token}`);

      expect(read.status).toBe(200);
    });

    test('the board list matches what the board check allows, admin included', async () => {
      const board = await createBoard(boardOwner.token, colors.boardColor._id, {
        title: 'Built by the member',
        workspaceId: workspace._id.toString(),
      });

      // The admin was never added to it, and must still see it listed,
      // otherwise a board they can administer is one they cannot find.
      const listed = await request(app).get('/api/boards').set('Authorization', `Bearer ${admin.token}`);

      expect(listed.body.data.map(entry => entry._id)).toContain(board._id);

      const bystander = await registerUser();
      await Workspace.findByIdAndUpdate(workspace._id, {
        $push: { members: { user: idOf(bystander), role: 'member' } },
      });

      const notListed = await request(app).get('/api/boards').set('Authorization', `Bearer ${bystander.token}`);

      expect(notListed.body.data.map(entry => entry._id)).not.toContain(board._id);
    });
  });
});
