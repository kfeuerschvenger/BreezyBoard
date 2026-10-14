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

const req = async (method, path, bearer, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
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
for (const title of ['First task', 'Second task', 'Third task']) { // NOSONAR javascript:S9382 sequential on purpose: the server mints each position at the end of the column, so the order of the requests is the order of the tasks
  const task = await req('POST', `/tasks/board/${boardId}`, token, { // NOSONAR javascript:S9382
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
  status: boardColumns.at(-1)._id,
  afterId: null,
  beforeId: null,
});
const stale = await req('PATCH', `/tasks/${taskIds[1]}/move`, token, {
  status: firstColumn._id,
  afterId: taskIds[0],
});
check('a move against a stale neighbour is a conflict', stale.status, 409);
check('and says so with a code the client can switch on', stale.body?.code, 'CONFLICT');

log('\n--- a deleted task is invisible to every read, and restore brings back the same task in place ---');
// Delete marks the task and removes nothing. It keeps its id, its creation
// date and its ordering key, so a restore puts it back where it stood.
const middleId = taskIds[1];
const middleBefore = (await req('GET', `/tasks/${middleId}`, token)).body.data;
const titlesBefore = (await req('GET', `/tasks/board/${boardId}`, token)).body.data.map(task => task.title).join(', ');
check('DELETE /tasks/:id succeeds', (await req('DELETE', `/tasks/${middleId}`, token)).status, 200);
check('the task is unreachable by id', (await req('GET', `/tasks/${middleId}`, token)).status, 404);
check('and cannot be edited or deleted again', `${(await req('PUT', `/tasks/${middleId}`, token, { title: 'Ghost' })).status} ${(await req('DELETE', `/tasks/${middleId}`, token)).status}`, '404 404');
const withoutIt = await req('GET', `/tasks/board/${boardId}`, token);
check(
  'the board read does not list it, keeps the others in order, and its total drops by one',
  `${withoutIt.body.data.map(task => task.title).join(', ')} / ${withoutIt.body.pagination.total}`,
  `${titlesBefore.split(', ').filter(title => title !== middleBefore.title).join(', ')} / 2`
);
check('the Home totals do not count it', (await req('GET', '/dashboard/stats', token)).body.data.totalTasks, 2);
check('POST /tasks/:id/restore succeeds', (await req('POST', `/tasks/${middleId}/restore`, token)).status, 200);
const middleAfter = (await req('GET', `/tasks/${middleId}`, token)).body.data;
check('it is the same task: id, creation date and position', `${middleAfter._id === middleBefore._id} ${middleAfter.createdAt === middleBefore.createdAt} ${middleAfter.order === middleBefore.order}`, 'true true true');
check('it is back in the same place on the board', (await req('GET', `/tasks/board/${boardId}`, token)).body.data.map(task => task.title).join(', '), titlesBefore);
check('a second restore is not an error', (await req('POST', `/tasks/${middleId}/restore`, token)).status, 200);

log('\n--- a deleted board and its tasks are unreachable, and restore brings them back ---');
// Delete is a soft delete: the board is marked and its tasks are untouched,
// so the observable contract is that nothing can reach them until the owner
// restores the board. The transactional cascade runs in the purge, which the
// backend suite covers against a replica set.
check('DELETE /boards/:id succeeds', (await req('DELETE', `/boards/${boardId}`, token)).status, 200);
check('the board is gone', (await req('GET', `/boards/${boardId}`, token)).status, 404);

for (const [index, taskId] of taskIds.entries()) { // NOSONAR javascript:S9382 sequential on purpose: one check line per task, in task order
  check(`task ${index + 1} is unreachable`, (await req('GET', `/tasks/${taskId}`, token)).status, 404); // NOSONAR javascript:S9382
}

check('POST /boards/:id/restore succeeds', (await req('POST', `/boards/${boardId}/restore`, token)).status, 200);
check('the board is back', (await req('GET', `/boards/${boardId}`, token)).status, 200);

for (const [index, taskId] of taskIds.entries()) { // NOSONAR javascript:S9382 sequential on purpose: one check line per task, in task order
  check(`task ${index + 1} is back with it`, (await req('GET', `/tasks/${taskId}`, token)).status, 200); // NOSONAR javascript:S9382
}

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
