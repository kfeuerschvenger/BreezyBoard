// The two level access model, driven against a running stack.
//
// Workspace membership is a prerequisite for reaching a board, and explicit
// board membership is still required on top of it. A workspace admin is the
// single exception and administers every board in their workspace.
//
// This exists next to authorization.mjs for the same reason that one does:
// an access rule is only proved by watching real accounts be refused, and
// equally by watching legitimate ones succeed. A model that refused
// everybody would satisfy every negative assertion ever written.

const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const log = (...a) => console.log(...a);

const req = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const results = [];
const check = (label, got, expected) => {
  const ok = got === expected;
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${got} (expected ${expected})`);
};

const stamp = Date.now();
// Registration is rate limited to twenty accounts an hour per client IP address, and
// these scripts create real ones. Without this the limit surfaces as
// "Cannot read properties of undefined", which sends whoever hit it looking
// for a bug in the API instead of at the clock.
const assertRegistered = response => {
  if (response.status === 429) {
    console.error('Registration is rate limited (429). Run: docker compose restart back');
    process.exit(1);
  }
  if (!response.body?.data?.token) {
    console.error(`Registration failed with ${response.status}: ${JSON.stringify(response.body)}`);
    process.exit(1);
  }
  return response;
};

const mk = async tag => {
  const r = assertRegistered(
    await req('POST', '/auth/register', null, {
      firstName: tag,
      lastName: 'User',
      email: `${tag}-${stamp}@example.test`,
      password: 'Passw0rd1',
    })
  );
  return { token: r.body.data.token, id: r.body.data.user?._id ?? r.body.data.user?.id };
};

const admin = await mk('wsadmin');
const author = await mk('wsauthor');
const bystander = await mk('wsbystander');
const outsider = await mk('wsoutsider');

log('--- every account gets a personal workspace at registration ---');
const mine = await req('GET', '/workspaces', admin.token);
check('exactly one workspace is listed', mine.body.data.length, 1);
check('and it is the personal one', mine.body.data[0].isPersonal, true);
check('with the owner as its admin', mine.body.data[0].members[0].role, 'admin');

log('\n--- a shared workspace ---');
const workspace = await req('POST', '/workspaces', admin.token, { name: 'Engineering' });
const workspaceId = workspace.body.data._id;
check('creating one answers 201', workspace.status, 201);
check('and never makes a second personal workspace', workspace.body.data.isPersonal, false);

check(
  'a plain member cannot be added by a non-admin',
  (await req('PATCH', `/workspaces/${workspaceId}/members`, outsider.token, { members: [{ user: outsider.id }] }))
    .status,
  403
);
check(
  'the admin can add members',
  (
    await req('PATCH', `/workspaces/${workspaceId}/members`, admin.token, {
      members: [{ user: author.id }, { user: bystander.id }],
    })
  ).status,
  200
);
// Identical answers for a real workspace the caller is not in and an id that
// was never a workspace, so ids handed around in invitations cannot be
// probed for existence.
check('an outsider is refused the workspace', (await req('GET', `/workspaces/${workspaceId}`, outsider.token)).status, 403);
check(
  'an invented workspace id answers identically',
  (await req('GET', '/workspaces/ffffffffffffffffffffffff', outsider.token)).status,
  403
);

log('\n--- a board inside that workspace ---');
const templates = await req('GET', '/templates', author.token);
const boardColors = await req('GET', '/colors?type=board', author.token);
const board = await req('POST', '/boards', author.token, {
  title: 'Engineering board',
  color: boardColors.body.data[0]._id,
  template: templates.body.data[0]._id,
  workspaceId,
});
const boardId = board.body.data._id;
check('a workspace member can create one in it', board.status, 201);
check(
  'a non-member cannot create one in it',
  (
    await req('POST', '/boards', outsider.token, {
      title: 'Trespassing board',
      color: boardColors.body.data[0]._id,
      workspaceId,
    })
  ).status,
  403
);

log('\n--- the two levels, and the one exception ---');
check('the author reads their own board', (await req('GET', `/boards/${boardId}`, author.token)).status, 200);
// In the workspace, never added to this board. Eligible is not the same as
// admitted, which is the entire difference between two levels and one.
check(
  'a workspace member who is not a board member is refused',
  (await req('GET', `/boards/${boardId}`, bystander.token)).status,
  403
);
check(
  'and does not see it in their board list',
  (await req('GET', '/boards', bystander.token)).body.data.some(entry => entry._id === boardId),
  false
);
// Never added to the board either, but an admin of its workspace. Reading is
// the weak case; deleting requires the strongest role the board middleware
// asks for, so it is checked last, at the end of this script.
check('the workspace admin reads it anyway', (await req('GET', `/boards/${boardId}`, admin.token)).status, 200);
check(
  'and sees it listed, or it would be a board they can administer and cannot find',
  (await req('GET', '/boards', admin.token)).body.data.some(entry => entry._id === boardId),
  true
);
check('an outsider to the workspace is refused', (await req('GET', `/boards/${boardId}`, outsider.token)).status, 403);

log('\n--- adding somebody to a board admits them to the workspace ---');
const newcomer = await mk('wsnewcomer');
check(
  'the board owner can add them',
  (await req('PATCH', `/boards/${boardId}/members`, author.token, { members: [newcomer.id] })).status,
  200
);
// Without the implicit workspace admission this would be 403: they would
// sit in the board's member list and be refused on every request, which
// reads as a bug rather than as a policy.
check('and the invitation actually works', (await req('GET', `/boards/${boardId}`, newcomer.token)).status, 200);
check(
  'they are now in the workspace too',
  (await req('GET', `/workspaces/${workspaceId}`, admin.token)).body.data.members.some(
    member => (member.user?._id ?? member.user) === newcomer.id
  ),
  true
);

log('\n--- the admin has full standing, not merely read access ---');
check('the workspace admin can delete a board they never joined', (await req('DELETE', `/boards/${boardId}`, admin.token)).status, 200);

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
