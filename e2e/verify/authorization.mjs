const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const log = (...a) => console.log(...a);

const post = async (path, body, token) => {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const req = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
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
  const u = { firstName: tag, lastName: 'User', email: `${tag}-${stamp}@example.test`, password: 'Passw0rd1' };
  const r = assertRegistered(await post('/auth/register', u));
  return { user: u, token: r.body.data.token, id: r.body.data.user?._id ?? r.body.data.user?.id };
};

const victim = await mk('victim');
const attacker = await mk('attacker');
log('two accounts created, attacker is not a member of the victim board\n');

const templates = await req('GET', '/templates', victim.token);
const colors = await req('GET', '/colors?type=board', victim.token);
const taskColors = await req('GET', '/colors?type=task', victim.token);
const template = templates.body.data[0];
const board = await post(
  '/boards',
  { title: 'Victim board', description: 'private', color: colors.body.data[0]._id, template: template._id },
  victim.token
);
const boardId = board.body.data._id;
// A task's status is the id of a column of THIS board, not of the template
// it was created from. The template's columns are a mould: creating the
// board copied them and gave the copies fresh ids, so a template column id
// is not a valid status for any board. Every payload below has to be a
// legitimate one, because request validation runs before the authorization
// middleware: a malformed body returns 400 and the attacker never reaches
// the check these assertions exist to prove.
const columns = [...board.body.data.columns].sort((a, b) => a.order - b.order);
const task = await post(
  `/tasks/board/${boardId}`,
  {
    title: 'Private task',
    description: 'secret',
    status: columns[0]._id,
    priority: 'medium',
    color: taskColors.body.data[0]._id,
  },
  victim.token
);
const taskId = task.body.data._id;

const results = [];
const check = (label, got, expected) => {
  const ok = got === expected;
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}  -> ${got} (expected ${expected})`);
};

log('--- the original appendix A exploit ---');
check('GET  /boards/:id      as outsider', (await req('GET', `/boards/${boardId}`, attacker.token)).status, 403);
check('GET  /tasks/:id       as outsider', (await req('GET', `/tasks/${taskId}`, attacker.token)).status, 403);
check(
  'PUT  /tasks/:id       as outsider',
  (await req('PUT', `/tasks/${taskId}`, attacker.token, { title: 'PWNED' })).status,
  403
);
check('DELETE /tasks/:id     as outsider', (await req('DELETE', `/tasks/${taskId}`, attacker.token)).status, 403);
check(
  'PATCH /tasks/:id/move as outsider',
  (
    await req('PATCH', `/tasks/${taskId}/move`, attacker.token, {
      status: columns[columns.length - 1]._id,
      afterId: null,
      beforeId: null,
    })
  ).status,
  403
);
check(
  'GET  /users/board-members as outsider',
  (await req('GET', `/users/board-members?boardId=${boardId}`, attacker.token)).status,
  403
);

log('\n--- board takeover by a legitimate member who is not the creator ---');
await req('PATCH', `/boards/${boardId}/members`, victim.token, { members: [attacker.id] });
check('member GET  /boards/:id (must still work)', (await req('GET', `/boards/${boardId}`, attacker.token)).status, 200);
check(
  'member PUT  /boards/:id (takeover)',
  (await req('PUT', `/boards/${boardId}`, attacker.token, { createdBy: attacker.id, members: [attacker.id] })).status,
  403
);
check('member DELETE /boards/:id', (await req('DELETE', `/boards/${boardId}`, attacker.token)).status, 403);

log('\n--- the victim must still be able to use their own board ---');
check('owner GET  /tasks/:id', (await req('GET', `/tasks/${taskId}`, victim.token)).status, 200);
check(
  'owner PUT  /tasks/:id',
  (await req('PUT', `/tasks/${taskId}`, victim.token, { title: 'Renamed by the owner' })).status,
  200
);
check('owner PUT  /boards/:id', (await req('PUT', `/boards/${boardId}`, victim.token, { title: 'Renamed' })).status, 200);

const after = await req('GET', `/tasks/${taskId}`, victim.token);
log(`\ntask title is now: ${JSON.stringify(after.body.data.title)}`);

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
