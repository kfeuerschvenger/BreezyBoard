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
const register = await req('POST', '/auth/register', null, {
  firstName: 'Integrity',
  lastName: 'User',
  email: `integrity-${stamp}@example.test`,
  password: 'Passw0rd1',
});
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
// Created oldest first with the orders deliberately reversed, so that the
// arrangement the board should show is one that creation order cannot
// produce by accident.
for (const [title, order] of [
  ['First task', 2],
  ['Second task', 1],
  ['Third task', 0],
]) {
  const task = await req('POST', `/tasks/board/${boardId}`, token, {
    title,
    status: firstColumn._id,
    priority: 'medium',
    order,
    color: taskColors.body.data[0]._id,
  });
  taskIds.push(task.body.data._id);
}

log(`board ${boardId} created with ${taskIds.length} tasks\n`);

log('--- task order is read back, not only written ---');
const listed = await req('GET', `/tasks/board/${boardId}`, token);
check(
  'the list comes back in stored order',
  listed.body.data.map(task => task.title).join(', '),
  'Third task, Second task, First task'
);

// Reordering, then reading it back, is the whole acceptance criterion: the
// endpoint always wrote these correctly and nothing ever read them.
await req('PATCH', `/tasks/board/${boardId}/orders`, token, {
  updates: [
    { id: taskIds[0], order: 0 },
    { id: taskIds[1], order: 1 },
    { id: taskIds[2], order: 2 },
  ],
});
const reordered = await req('GET', `/tasks/board/${boardId}`, token);
check(
  'a reorder survives a reload',
  reordered.body.data.map(task => task.title).join(', '),
  'First task, Second task, Third task'
);

log('\n--- the board delete cascade runs in a transaction ---');
// A standalone mongod answers this with 500, because mongoose refuses to
// open a transaction against a topology that has no oplog. A 200 here is
// therefore evidence about the deployment, not only about the handler.
check('DELETE /boards/:id succeeds', (await req('DELETE', `/boards/${boardId}`, token)).status, 200);
check('the board is gone', (await req('GET', `/boards/${boardId}`, token)).status, 404);

for (const [index, taskId] of taskIds.entries()) {
  check(`task ${index + 1} was cascaded away`, (await req('GET', `/tasks/${taskId}`, token)).status, 404);
}

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
