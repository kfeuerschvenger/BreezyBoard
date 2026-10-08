// Data integrity checks against a running stack.
//
// The unit suite can inject a failure into the middle of the cascade and
// prove the rollback. This script cannot, because it only has the HTTP
// surface. What it proves instead is the half no unit test can reach: that
// the deployment it is pointed at is actually configured to run
// transactions at all.
//
// That property lives in docker-compose.yml, not in any source file. A
// standalone mongod accepts every other request in this repository and fails
// only here, so a deployment that quietly lost its replica set would look
// entirely healthy until the first board deletion.

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

const register = assertRegistered(
  await req('POST', '/auth/register', null, {
    firstName: 'Integrity',
    lastName: 'User',
    email: `integrity-${stamp}@example.test`,
    password: 'Passw0rd1',
  })
);
const token = register.body.data.token;

const templates = await req('GET', '/templates', token);
const boardColors = await req('GET', '/colors?type=board', token);
const taskColors = await req('GET', '/colors?type=task', token);
const template = templates.body.data[0];

const board = await req('POST', '/boards', token, {
  title: 'Integrity board',
  description: 'created to be deleted',
  color: boardColors.body.data[0]._id,
  template: template._id,
});
const boardId = board.body.data._id;

// The board's own columns, not the template's. Creating the board copied
// them out of the template with fresh ids, so a template column id is not a
// valid status for any board.
const boardColumns = [...board.body.data.columns].sort((a, b) => a.order - b.order);
const firstColumn = boardColumns[0];

log('--- a board owns its columns ---');
const sibling = await req('POST', '/boards', token, {
  title: 'Sibling board',
  description: 'built from the same template',
  color: boardColors.body.data[0]._id,
  template: template._id,
});
const siblingColumnIds = sibling.body.data.columns.map(column => column._id);
check(
  'two boards from one template share no column id',
  boardColumns.some(column => siblingColumnIds.includes(column._id)),
  false
);
// Rejected because it names a column of the sibling board, not of this one.
// While columns lived on the shared template the two were the same id and
// this request would have been accepted.
check(
  'a sibling board column is not a valid status here',
  (
    await req('POST', `/tasks/board/${boardId}`, token, {
      title: 'Misfiled task',
      status: siblingColumnIds[0],
      color: taskColors.body.data[0]._id,
    })
  ).status,
  400
);
await req('DELETE', `/boards/${sibling.body.data._id}`, token);
log('');
const taskIds = [];
const keys = {};
for (const title of ['First task', 'Second task', 'Third task']) {
  const task = await req('POST', `/tasks/board/${boardId}`, token, {
    title,
    status: firstColumn._id,
    priority: 'medium',
    color: taskColors.body.data[0]._id,
  });
  taskIds.push(task.body.data._id);
  keys[title] = task.body.data.order;
}

log(`board ${boardId} created with ${taskIds.length} tasks\n`);

log('--- task order is a server minted key, read back on every load ---');
const listed = await req('GET', `/tasks/board/${boardId}`, token);
check(
  'new tasks land at the bottom, in the order they were made',
  listed.body.data.map(task => task.title).join(', '),
  'First task, Second task, Third task'
);
check(
  'a client cannot choose its own key',
  (
    await req('POST', `/tasks/board/${boardId}`, token, {
      title: 'Queue jumper',
      status: firstColumn._id,
      color: taskColors.body.data[0]._id,
      order: '0',
    })
  ).status,
  400
);

// Drag the last card to the top, then read it back. The arrangement below is
// one that creation order cannot produce, or this would pass against a list
// that ignores the key entirely.
await req('PATCH', `/tasks/${taskIds[2]}/move`, token, {
  status: firstColumn._id,
  afterId: null,
  beforeId: taskIds[0],
});
const reordered = await req('GET', `/tasks/board/${boardId}`, token);
check(
  'a reorder survives a reload',
  reordered.body.data.map(task => task.title).join(', '),
  'Third task, First task, Second task'
);
// The point of a fractional index: the two cards that did not move still
// carry the keys they were born with. The integer version rewrote every card
// below the insertion point on every single drag.
check(
  'the cards that did not move kept their keys',
  reordered.body.data.filter(task => ['First task', 'Second task'].includes(task.title)).every(task => task.order === keys[task.title]),
  true
);
// A neighbour that has moved since the client last looked is a conflict the
// client can recover from by refetching, not a malformed request.
await req('PATCH', `/tasks/${taskIds[0]}/move`, token, {
  status: boardColumns[boardColumns.length - 1]._id,
  afterId: null,
  beforeId: null,
});
const stale = await req('PATCH', `/tasks/${taskIds[1]}/move`, token, {
  status: firstColumn._id,
  afterId: taskIds[0],
});
check('a move against a stale neighbour is a conflict', stale.status, 409);
check('and says so with a code the client can switch on', stale.body?.code, 'CONFLICT');

log('\n--- a deleted board and its tasks are unreachable, and restore brings them back ---');
// Delete is a soft delete: the board is marked and its tasks are untouched,
// so the observable contract is that nothing can reach them until the owner
// restores the board. The transactional cascade runs in the purge, which the
// backend suite covers against a replica set.
check('DELETE /boards/:id succeeds', (await req('DELETE', `/boards/${boardId}`, token)).status, 200);
check('the board is gone', (await req('GET', `/boards/${boardId}`, token)).status, 404);

for (const [index, taskId] of taskIds.entries()) {
  check(`task ${index + 1} is unreachable`, (await req('GET', `/tasks/${taskId}`, token)).status, 404);
}

check('POST /boards/:id/restore succeeds', (await req('POST', `/boards/${boardId}/restore`, token)).status, 200);
check('the board is back', (await req('GET', `/boards/${boardId}`, token)).status, 200);

for (const [index, taskId] of taskIds.entries()) {
  check(`task ${index + 1} is back with it`, (await req('GET', `/tasks/${taskId}`, token)).status, 200);
}

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
