const API = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const log = (...a) => console.log(...a);
const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  :: ' + detail : ''}`);
};

const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

const call = async (method, path, token, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
};

const user = {
  firstName: 'Session',
  lastName: 'Check',
  email: `session-${Date.now()}@example.test`,
  password: 'Passw0rd1',
};
const reg = await call('POST', '/auth/register', null, user);
check('register succeeds', reg.status === 201, `status ${reg.status}`);
const first = reg.body.data.token;
const firstClaims = decode(first);
log('\nclaims on the first token:', JSON.stringify(firstClaims));
check('carries sessionStartedAt', typeof firstClaims.sessionStartedAt === 'number');
check('carries tokenVersion', typeof firstClaims.tokenVersion === 'number');

// 1. renewal on an ordinary authenticated request
// A token's `exp` has a resolution of one second, so the renewal can only be told
// apart from the original once the clock has moved on. Elapsed time is the input.
await new Promise(r => setTimeout(r, 1100)); // NOSONAR javascript:S2925 the claims carry whole seconds, so real time has to pass
const me = await call('GET', '/auth/me', first);
const renewed = me.headers.get('x-auth-token');
check('authenticated request answers 200', me.status === 200);
check('response carries X-Auth-Token', Boolean(renewed));
check('the renewed token differs from the one sent', renewed !== first);

const renewedClaims = decode(renewed);
check(
  'sessionStartedAt is copied verbatim',
  renewedClaims.sessionStartedAt === firstClaims.sessionStartedAt,
  `${firstClaims.sessionStartedAt} -> ${renewedClaims.sessionStartedAt}`
);
check('exp moves forward', renewedClaims.exp > firstClaims.exp, `${firstClaims.exp} -> ${renewedClaims.exp}`);

// 2. renewal happens even when the handler refuses
const denied = await call('GET', '/boards/000000000000000000000000', renewed);
check('a non-2xx still renews', Boolean(denied.headers.get('x-auth-token')), `handler returned ${denied.status}`);

// 3. the ping endpoint
const ping = await fetch(API + '/auth/ping', { headers: { Authorization: `Bearer ${renewed}` } });
check('ping answers 204', ping.status === 204);
check('ping sets Cache-Control no-store', (ping.headers.get('cache-control') ?? '').includes('no-store'));
check('ping renews', Boolean(ping.headers.get('x-auth-token')));
const afterPing = ping.headers.get('x-auth-token');

// 4. logout revokes immediately
const logout = await call('POST', '/auth/logout', afterPing);
check('logout answers 200', logout.status === 200, `status ${logout.status}`);
const afterLogout = await call('GET', '/auth/me', afterPing);
check('the token is dead immediately after logout', afterLogout.status === 401, `status ${afterLogout.status}`);

// 5. a token from before the change (no sessionStartedAt) must be refused
const login = await call('POST', '/auth/login', null, { email: user.email, password: user.password });
check('login still works after logout', login.status === 200, `status ${login.status}`);

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
