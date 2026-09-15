# Standing verification scripts

Scripts that drive the running stack and assert things a unit test structurally cannot. They are not part of `npm test` in either package: they need real containers, a real browser, and in two cases real elapsed time. Run them by hand after touching authorization, the session model, or the API surface, and before opening a pull request that changes any of those.

Each one exits non-zero on the first failure and prints a `PASS` or `FAIL` line per assertion, so they read as a checklist rather than a stack trace.

## Running them

The development stack must be up, and the reference data seeded:

```bash
docker compose up -d
docker compose exec back npm run seed:all
```

Then, from `e2e/`:

```bash
node verify/authorization.mjs
node verify/session.mjs
node verify/api-surface.mjs
node verify/drafts.mjs
node verify/idle.mjs expire
node verify/idle.mjs extend
node verify/integrity.mjs
```

Base URLs default to the local development stack and can be overridden with `E2E_API_URL`, `E2E_FRONT_URL` and `E2E_PROD_URL`.

One practical limit to know about. Registration is rate limited to twenty accounts per hour per address, and these scripts register real ones: a full `npm run verify` pass plus the Playwright suite uses roughly fifteen of them, with `workspaces.mjs` alone accounting for five because the two level model needs that many distinct roles to be worth testing. A second full cycle inside the same hour will therefore start answering 429, and it surfaces as a Playwright failure rather than as anything that says "rate limit". The counter lives in memory, so `docker compose restart back` clears it. Raising the limit to make this go away would remove the protection these scripts exist to confirm.

## What each one covers, and why it exists

```mermaid
graph TD
  A[authorization.mjs] -->|two real accounts| B[the API refuses an outsider<br/>and still serves the owner]
  C[session.mjs] -->|real HTTP| D[renewal contract<br/>and immediate revocation]
  E[idle.mjs] -->|real browser, real time| F[no background traffic,<br/>warning, expiry]
  G[api-surface.mjs] -->|real HTTP| H[versioning, pagination,<br/>error codes, request ids]
  I[drafts.mjs] -->|real browser| J[in-progress work survives<br/>losing the page]
  K[csp.mjs] -->|production stack| L[the policy does not<br/>break the app]
  M[integrity.mjs] -->|real database| N[the deployment can<br/>actually run transactions]
  O[workspaces.mjs] -->|four real accounts| P[two level access,<br/>and the admin exception]
```

**`authorization.mjs`** replays the exploit recorded in appendix A of the revival plan. It registers two accounts, has the first create a board and a task, and asserts twelve outcomes. Six are refusals for an outsider, three cover a legitimate member who is not the creator, and three confirm the owner can still do their work.

Those last three matter as much as the refusals. A middleware that denied everyone would pass every negative security assertion ever written, so a security check without positive cases proves nothing.

**`session.mjs`** checks the sliding session over real HTTP: the renewal header is present, the returned token differs from the one sent, `sessionStartedAt` survives verbatim while `exp` advances, a 404 still renews, `ping` answers 204 with `no-store`, and a token is dead on its very next use after logout.

**`idle.mjs`** is the one that could not be written any other way, and it is the most important script here. Run it with a shortened window:

```bash
JWT_INACTIVITY_TTL_MS=90000 docker compose up -d --force-recreate back front
node verify/idle.mjs expire
```

It logs in, then sits still and counts requests. The assertion is zero API calls across the idle period.

The inactivity window is not enforced by the server. The server renews the token on every request it sees, so the window only works because nothing in the client polls. A single stray interval anywhere in the frontend would turn fifteen minutes into a session that never ends, and nothing would fail loudly the day it was added. This script is the only thing that would notice.

It also confirms the warning appears sixty seconds before expiry, never dismisses itself, and that an unattended session signs out and lands on the login page. Passing `extend` instead checks that the warning's action really pings and carries the session past its original deadline.

Remember to restore the normal window afterwards with `docker compose up -d --force-recreate back front`.

**`api-surface.mjs`** checks that both mount paths return identical bodies, that a supplied `X-Request-Id` comes back verbatim and an absent one is generated, and the pagination contract from both sides: no `limit` returns everything and still reports the total, `limit` returns exactly that page with the total unchanged. It also checks that error responses carry a machine-readable `code` without having lost any pre-existing envelope field.

**`drafts.mjs`** types into the task drawer, reloads the page entirely, and asserts the text comes back, then saves the task and asserts the draft is gone. This is what makes the discreet expiry warning acceptable: being signed out mid-sentence stops costing the user their work.

**`integrity.mjs`** creates a board with three tasks, deletes the board, and asserts the board and all three tasks are gone. The interesting assertion is the first one, that the delete returns 200 at all.

The board delete cascade runs inside a transaction, and transactions exist only on a replica set. That property lives in `docker-compose.yml`, not in any source file, and the unit suite cannot observe it because its own in-memory database is configured separately. Every other request in this application works perfectly against a standalone mongod, so a deployment that quietly lost its replica set would look entirely healthy right up until somebody deleted a board. This script is what notices.

The other half of the guarantee, that a failure partway through the cascade rolls the whole thing back, is covered in `back/test/boards.test.js` by injecting a failure into the cascade. That one needs to reach inside the process, so it cannot live here.

**`workspaces.mjs`** drives four real accounts through the two level access model: workspace membership is a prerequisite for reaching a board, explicit board membership is still required on top of it, and a workspace admin is the single exception who administers every board in their workspace.

It sits next to `authorization.mjs` for the same reason that one does. Half of its assertions are refusals and half are successes, because a model that refused everybody would satisfy every negative assertion ever written. It also checks the two cases that are easy to get subtly wrong: that a board admins can administer is one they can also find in their list, and that adding somebody to a board actually admits them to the workspace, without which the invitation is inert and the person is refused on every request.

**`csp.mjs`** runs against the production stack rather than development, because the Content-Security-Policy is served by nginx and does not exist in the Vite dev server. It loads the real application and asserts zero policy violations, zero console errors and zero failed requests. Bring that stack up first:

```bash
MONGO_USER=bb MONGO_PASSWORD=devpassword JWT_SECRET=local-only \
  CORS_ORIGINS=http://localhost:8080 HTTP_PORT=8080 \
  docker compose -f docker-compose.prod.yml up -d --build
```
