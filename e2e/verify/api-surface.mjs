const V1 = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const LEGACY = V1.replace(/\/v1$/, '');
const log = (...a) => console.log(...a);
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  :: ' + detail : ''}`);
};

const call = async (base, path, bearer, opts = {}) => {
  const res = await fetch(base + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...opts.headers,
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
};

// --- versioning ---------------------------------------------------------
const v1Health = await call(V1, '/health');
const legacyHealth = await call(LEGACY, '/health');
check('/api/v1/health answers', v1Health.status === 200);
check('/api/health still answers', legacyHealth.status === 200);
check(
  'both paths return the same body',
  JSON.stringify(v1Health.body) === JSON.stringify(legacyHealth.body),
  JSON.stringify(v1Health.body)
);

// --- request ids --------------------------------------------------------
const supplied = await call(V1, '/health', null, { headers: { 'X-Request-Id': 'my-own-trace-id' } });
check('a supplied X-Request-Id is echoed back', supplied.headers.get('x-request-id') === 'my-own-trace-id', supplied.headers.get('x-request-id'));
const generated = await call(V1, '/health');
const genId = generated.headers.get('x-request-id');
check('one is generated when absent', Boolean(genId) && genId !== 'my-own-trace-id', genId);

// --- set up some data ---------------------------------------------------
const user = {
  firstName: 'Api',
  lastName: 'Surface',
  email: `apisurface-${Date.now()}@example.test`,
  password: 'Passw0rd1',
};
const reg = await call(V1, '/auth/register', null, { method: 'POST', body: user });
const token = reg.body.data.token;

const colors = await call(V1, '/colors?type=board', token);
const templates = await call(V1, '/templates', token);
for (let i = 1; i <= 3; i++) { // NOSONAR javascript:S9382 sequential on purpose: the boards are listed by creation order and the pagination checks read that order
  await call(V1, '/boards', token, { // NOSONAR javascript:S9382
    method: 'POST',
    body: {
      title: `Board ${i}`,
      description: 'pagination fixture',
      color: colors.body.data[0]._id,
      template: templates.body.data[0]._id,
    },
  });
}

// --- pagination is opt-in ----------------------------------------------
const all = await call(V1, '/boards', token);
check('no limit returns the full list', Array.isArray(all.body.data) && all.body.data.length === 3, `${all.body.data?.length} items`);
check('pagination metadata is present anyway', Boolean(all.body.pagination), JSON.stringify(all.body.pagination));
check('total is reported', all.body.pagination?.total === 3, JSON.stringify(all.body.pagination));

const paged = await call(V1, '/boards?limit=2', token);
check('limit returns exactly that page', paged.body.data?.length === 2, `${paged.body.data?.length} items`);
check('total still reflects everything', paged.body.pagination?.total === 3, JSON.stringify(paged.body.pagination));

const offset = await call(V1, '/boards?limit=2&offset=2', token);
check('offset returns the remainder', offset.body.data?.length === 1, `${offset.body.data?.length} items`);

// --- error codes --------------------------------------------------------
const unauth = await call(V1, '/boards');
check('a 401 carries a machine readable code', Boolean(unauth.body?.code), JSON.stringify(unauth.body));
const notFound = await call(V1, '/boards/000000000000000000000000', token);
check('a 404 carries a code', Boolean(notFound.body?.code), `${notFound.status} ${notFound.body?.code}`);
const badInput = await call(V1, '/auth/login', null, { method: 'POST', body: { email: 'nope', password: 'x' } });
check('a validation failure carries VALIDATION_ERROR', badInput.body?.code === 'VALIDATION_ERROR', `${badInput.status} ${badInput.body?.code}`);
check('the existing envelope fields survive', 'success' in unauth.body && 'message' in unauth.body, JSON.stringify(Object.keys(unauth.body)));

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
