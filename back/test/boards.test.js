import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import app from '../src/app.js';
import Board from '../src/models/Board.js';
import ColorPalette from '../src/models/ColorPalette.js';
import Workspace from '../src/models/Workspace.js';
import { createBoard } from './helpers/board.factory.js';
import { seedColorsAndTemplates } from './helpers/seed.js';
import { boardColumns, createTask } from './helpers/task.factory.js';
import { registerUser } from './helpers/user.factory.js';

describe('boards', () => {
  let colors;
  let owner;

  beforeEach(async () => {
    colors = await seedColorsAndTemplates();
    owner = await registerUser();
  });

  test('create succeeds for the authenticated user', async () => {
    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Launch Plan', color: colors.boardColor._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Launch Plan');
    expect(res.body.data.createdBy).toBe(owner.user.id ?? owner.user._id);
  });

  test('list returns only boards the caller created or is a member of', async () => {
    const otherUser = await registerUser();

    const ownBoard = await createBoard(owner.token, colors.boardColor._id, { title: 'Owner Board' });
    await createBoard(otherUser.token, colors.boardColor._id, { title: 'Other Board' });

    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    const boardIds = res.body.data.map(board => board._id);
    expect(boardIds).toContain(ownBoard._id);
    expect(boardIds).toHaveLength(1);
  });

  test('list includes boards where the caller is a member but not the creator', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id, { title: 'Shared Board' });

    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const res = await request(app).get('/api/boards').set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(200);
    const boardIds = res.body.data.map(b => b._id);
    expect(boardIds).toContain(board._id);
  });

  test('get by id succeeds for a member', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);

    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(board._id);
  });

  test('get by id is forbidden for a non-member', async () => {
    const outsider = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });

  test('update the title as the creator', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id, { title: 'Original Title' });

    const res = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });

  test('update changes name, description and colour together and answers with the new colour', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id, { title: 'Before', description: 'Old' });
    const other = await ColorPalette.create({ name: 'Coral', value: 'coral', type: 'board' });

    const res = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'After', description: 'New', color: other._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'After', description: 'New' });
    expect(res.body.data.color.value).toBe('coral');
  });

  test('update refuses an empty name and a member', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);
    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const empty = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: '   ' });
    const byMember = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ title: 'Hijacked' });

    expect(empty.status).toBe(400);
    expect(byMember.status).toBe(403);
    expect((await Board.findById(board._id)).title).toBe('Test Board');
  });

  test('create refuses a color id that matches no palette entry, and writes nothing', async () => {
    const missing = 'ffffffffffffffffffffffff';

    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Painted with nothing', color: missing });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await Board.countDocuments({ title: 'Painted with nothing' })).toBe(0);
  });

  test('update refuses a color id that matches no palette entry and keeps the colour it had', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Renamed in the same request', color: 'ffffffffffffffffffffffff' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');

    const stored = await Board.findById(board._id);
    expect(stored.color.toString()).toBe(colors.boardColor._id.toString());
    expect(stored.title).toBe('Test Board');
  });

  test('create refuses a task color and a column color, and writes nothing', async () => {
    for (const color of [colors.taskColor, colors.legacyColumnColor]) {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Wrong palette', color: color._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(await Board.countDocuments({ title: 'Wrong palette' })).toBe(0);
  });

  test('update refuses a task color and keeps the colour the board had', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ color: colors.taskColor._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect((await Board.findById(board._id)).color.toString()).toBe(colors.boardColor._id.toString());
  });

  // The board palette is the six design hues. The palette model will not store
  // a seventh, so a row that predates the hues has to be written past it, which
  // is how one reaches a database that was never migrated.
  test('create and update refuse a board colour that is not one of the six hues', async () => {
    const { insertedId } = await ColorPalette.collection.insertOne({ name: 'Royal Blue', value: '#0052CC', type: 'board' });
    const board = await createBoard(owner.token, colors.boardColor._id);

    const created = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Painted with a hex', color: insertedId.toString() });
    const updated = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ color: insertedId.toString() });

    expect(created.status).toBe(400);
    expect(created.body.code).toBe('VALIDATION_ERROR');
    expect(updated.status).toBe(400);
    expect(await Board.countDocuments({ title: 'Painted with a hex' })).toBe(0);
    expect((await Board.findById(board._id)).color.toString()).toBe(colors.boardColor._id.toString());
  });

  test.each(['sky', 'teal', 'green', 'sand', 'coral', 'lavender'])('create accepts the %s hue', async hue => {
    // Sky is already in the palette from the seed, and `value` is unique.
    const entry = await ColorPalette.findOneAndUpdate(
      { value: hue, type: 'board' },
      { $setOnInsert: { name: hue } },
      { upsert: true, new: true }
    );

    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: `A ${hue} board`, color: entry._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.color.value).toBe(hue);
  });

  describe('member ids must belong to existing users', () => {
    const nobody = 'ffffffffffffffffffffffff';
    const idOf = account => account.user.id ?? account.user._id;

    test('adding members refuses an id that belongs to nobody and changes neither board nor workspace', async () => {
      const board = await createBoard(owner.token, colors.boardColor._id);
      const workspaceBefore = await Workspace.findById(board.workspaceId);

      const res = await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ members: [nobody] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect((await Board.findById(board._id)).members.map(String)).not.toContain(nobody);
      expect((await Workspace.findById(board.workspaceId)).members).toHaveLength(workspaceBefore.members.length);
    });

    test('adding members is all or nothing when only one id is real', async () => {
      const board = await createBoard(owner.token, colors.boardColor._id);
      const member = await registerUser();

      const res = await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ members: [idOf(member), nobody] });

      expect(res.status).toBe(400);
      expect((await Board.findById(board._id)).members.map(String)).not.toContain(String(idOf(member)));
    });

    test('adding the same real user twice in one request is accepted', async () => {
      const board = await createBoard(owner.token, colors.boardColor._id);
      const member = await registerUser();

      const res = await request(app)
        .patch(`/api/boards/${board._id}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ members: [idOf(member), idOf(member)] });

      expect(res.status).toBe(200);
    });

    test('create refuses an id that belongs to nobody and writes no board', async () => {
      const res = await request(app)
        .post('/api/boards')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Invited a ghost', color: colors.boardColor._id.toString(), members: [nobody] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(await Board.countDocuments({ title: 'Invited a ghost' })).toBe(0);
    });

    test('create with real members still goes through, and without members too', async () => {
      const member = await registerUser();

      const withMember = await createBoard(owner.token, colors.boardColor._id, { members: [idOf(member)] });
      const alone = await createBoard(owner.token, colors.boardColor._id, { title: 'Alone' });

      expect(withMember.members.map(String)).toContain(String(idOf(member)));
      expect(alone.title).toBe('Alone');
    });
  });

  test('update that leaves the colour out still goes through', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app)
      .put(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Only the name' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Only the name');
    expect(res.body.data.color.value).toBe('sky');
  });

  test('get by id tells the caller their own role on the board', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);
    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const asOwner = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${owner.token}`);
    const asMember = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${member.token}`);

    expect(asOwner.body.data.viewerRole).toBe('owner');
    expect(asMember.body.data.viewerRole).toBe('member');
  });

  // The board's page draws its owner, as the dashboard tile does. A bare id
  // gives it nothing to draw, so the read names the owner the way the list does
  // and exposes nothing else about them.
  test('get by id names the owner, with what a page draws and nothing more', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${member.token}`);
    // A member of the board reads it too.
    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });
    const asMember = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(403);
    expect(asMember.status).toBe(200);
    const named = asMember.body.data.createdBy;
    expect(named).toMatchObject({
      _id: owner.user.id ?? owner.user._id,
      firstName: owner.user.firstName,
      lastName: owner.user.lastName,
    });
    expect(named).toHaveProperty('avatar');
    for (const private_ of ['email', 'password', 'tokenVersion', 'role']) {
      expect(named, `the owner's ${private_} must not be sent`).not.toHaveProperty(private_);
    }
  });

  test('the board list tells each caller their own role on every board, as the read does', async () => {
    const member = await registerUser();
    const board = await createBoard(owner.token, colors.boardColor._id);
    await request(app)
      .patch(`/api/boards/${board._id}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ members: [member.user.id ?? member.user._id] });

    const roleInList = async who => {
      const list = await request(app).get('/api/boards').set('Authorization', `Bearer ${who.token}`);
      return list.body.data.find(entry => entry._id === board._id).viewerRole;
    };
    const roleInRead = async who => {
      const read = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${who.token}`);
      return read.body.data.viewerRole;
    };

    expect(await roleInList(owner)).toBe('owner');
    expect(await roleInList(member)).toBe('member');
    expect(await roleInList(owner)).toBe(await roleInRead(owner));
    expect(await roleInList(member)).toBe(await roleInRead(member));
  });

  test('registration creates a personal workspace and a board lands in it', async () => {
    const personal = await Workspace.findOne({ createdBy: owner.user.id ?? owner.user._id, isPersonal: true });

    expect(personal).not.toBeNull();
    expect(personal.members).toHaveLength(1);
    expect(personal.members[0].role).toBe('admin');

    // The frontend sends no workspaceId, so this is the path every board
    // creation takes today.
    const board = await createBoard(owner.token, colors.boardColor._id);
    const stored = await Board.findById(board._id).select('workspaceId');

    expect(stored.workspaceId.toString()).toBe(personal._id.toString());
  });

  test('create refuses a workspace the caller does not belong to', async () => {
    const stranger = await registerUser();
    const theirs = await Workspace.findOne({ createdBy: stranger.user.id ?? stranger.user._id, isPersonal: true });

    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Board in someone elses workspace',
        color: colors.boardColor._id.toString(),
        workspaceId: theirs._id.toString(),
      });

    expect(res.status).toBe(403);
  });

  test('create succeeds in a workspace the caller belongs to', async () => {
    const shared = await Workspace.create({
      name: 'Shared',
      createdBy: owner.user.id ?? owner.user._id,
      members: [{ user: owner.user.id ?? owner.user._id, role: 'admin' }],
    });

    const res = await request(app)
      .post('/api/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Board in a shared workspace',
        color: colors.boardColor._id.toString(),
        workspaceId: shared._id.toString(),
      });

    expect(res.status).toBe(201);

    const stored = await Board.findById(res.body.data._id).select('workspaceId');

    expect(stored.workspaceId.toString()).toBe(shared._id.toString());
  });

  test('a board owns its columns, copied from its template', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const res = await request(app).get(`/api/boards/${board._id}`).set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.columns.map(column => column.title)).toEqual(['Backlog', 'Done']);
    // Populated, because the board page renders the column colour and used to
    // get it through the template.
    expect(res.body.data.columns[0].color.value).toBe(colors.columnColor.value);
  });

  test('two boards from the same template do not share column ids', async () => {
    // This is the whole point of copying rather than referencing. While
    // columns lived on the shared template these ids were identical, so
    // renaming a column on one board renamed it on the other, and a task
    // status was ambiguous between them.
    const first = await createBoard(owner.token, colors.boardColor._id, { title: 'First Board' });
    const second = await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });

    const firstIds = (await boardColumns(first._id)).map(column => column._id.toString());
    const secondIds = (await boardColumns(second._id)).map(column => column._id.toString());

    expect(firstIds).toHaveLength(2);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.some(id => secondIds.includes(id))).toBe(false);
  });

  test('renaming a column on one board leaves every other board untouched', async () => {
    const first = await createBoard(owner.token, colors.boardColor._id, { title: 'First Board' });
    const second = await createBoard(owner.token, colors.boardColor._id, { title: 'Second Board' });

    // Written through the model rather than an endpoint: column editing is a
    // product feature that does not exist yet. What is being proved here is
    // that the schema allows it without collateral damage, which is what
    // made the change worth doing now.
    const board = await Board.findById(first._id);
    board.columns[0].title = 'Renamed on the first board only';
    await board.save();

    const untouched = await Board.findById(second._id).select('columns');

    expect(untouched.columns[0].title).toBe('Backlog');
  });

  test('delete as the creator makes that board tasks unreachable', async () => {
    const board = await createBoard(owner.token, colors.boardColor._id);

    const { _id: taskId } = await createTask(owner.token, board._id, colors.taskColor._id, {
      title: 'Task to remove',
    });

    const deleteRes = await request(app)
      .delete(`/api/boards/${board._id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(deleteRes.status).toBe(200);

    const taskCheck = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${owner.token}`);

    expect(taskCheck.status).toBe(404);
  });
});
