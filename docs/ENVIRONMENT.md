# Environment variables

Every variable BreezyBoard reads, where it is read, what it defaults to and how it is checked. The backend reads its variables in `back/src/config/env.js`, the frontend reads two in `front/src`, the compose files set them for the containers, and the end to end suite reads its own. The README has the commands that use them: [README](../README.md).

## Where each value comes from

```mermaid
flowchart LR
  Shell["shell or .env at the repository root"] --> Compose["docker-compose.yml<br/>docker-compose.prod.yml"]
  Compose -->|environment| BackEnv["back container<br/>process.env"]
  Compose -->|"build args, production"| Vite["front build<br/>Vite inlines VITE_ variables"]
  Compose -->|environment, development| Dev["front dev server<br/>VITE_ variables"]
  BackEnv --> Dotenv["dotenv reads back/.env<br/>when the file exists"]
  Dotenv --> EnvJs["config/env.js<br/>the one reader"]
  EnvJs --> App["the backend modules"]
  E2e["shell: E2E_ variables"] --> Tests["Playwright and e2e/verify"]
```

A variable already in the process environment wins over `back/.env`, because `dotenv` never overrides. `.env` at the repository root, `back/.env` and `front/.env` are ignored by git, and `back/.env_example` and `front/.env_example` are the committed templates. The example secret in `back/.env_example` is a sample: never reuse it.

Compose substitutes `${NAME:-default}` from the shell or from a `.env` file at the repository root, and `${NAME:?message}` stops the stack from starting when the variable is missing.

## Backend

Values in the Development column are what `docker-compose.yml` sets, and in the Production column what `docker-compose.prod.yml` sets or what the backend demands. Validation says what `env.js` does with a bad value: a default with a warning in the log, a refusal to start, or nothing.

| Variable | Default and requirement | Development | Production | Secret | Validation |
|---|---|---|---|---|---|
| `NODE_ENV` | `development` when unset. Also read by `utils/logger.js`, `openapi/docs.js` and the seed guard | `development` | `production` | No | None. Any value but `production` behaves as non-production, see P4-115 |
| `PORT` | `5000` | `5000` | `5000` | No | None, see P4-115 |
| `MONGODB_URI` | `mongodb://localhost/boards-db`, in every environment, production included | `mongodb://mongo:27017/boards-db?replicaSet=rs0` | `mongodb://USER:PASSWORD@mongo:27017/boards-db?authSource=admin&replicaSet=rs0` | Yes in production, it carries the password | None, and no refusal when unset in production, see P4-115 |
| `JWT_SECRET` | Required in production. Elsewhere `insecure-development-secret`, with a warning | `dev-only-secret-change-me` unless set | Required, `${JWT_SECRET:?}` | Yes | Refuses to start in production when unset or blank. Strength is not checked |
| `SALT` | `10`, the bcrypt cost | `10` | `12` | No | `Number(...) \|\| 10`: any number is accepted and bcryptjs clamps it to 4 through 31, zero and non numbers become 10, see P4-115 |
| `CORS_ORIGINS` | Comma separated origins. Empty reflects any origin outside production | Unset | Required, `${CORS_ORIGINS:?}` | No | Refuses to start in production when empty. Entries are split and trimmed, not parsed as URLs |
| `TRUST_PROXY_HOPS` | `1` in production, `0` elsewhere. Reverse proxies in front of the API, used for the address every rate limiter keys on | Unset, so `0` | `${TRUST_PROXY_HOPS:-1}` | No | A whole number of zero or more, else the default with a warning |
| `JWT_INACTIVITY_TTL_MS` | `900000`, 15 minutes | `900000` | Unset, so the default | No | A positive number, else the default with a warning |
| `JWT_ABSOLUTE_TTL_MS` | `14400000`, 4 hours | `14400000` | Unset, so the default | No | A positive number, else the default with a warning |
| `REGISTRATION_LIMIT_PER_HOUR` | `20` accounts per client address per hour | `500` | Unset on purpose, so `20` | No | A positive whole number, else the default with a warning |
| `PASSWORD_RECOVERY_LIMIT_PER_15_MIN` | `10` requests per client address | `500` | Unset on purpose, so `10` | No | A positive whole number, else the default with a warning |
| `PASSWORD_RESET_COOLDOWN_MS` | `60000`, the shortest gap between two reset emails to one address | `1000` | Unset, so the default | No | A positive number, else the default with a warning |
| `PASSWORD_RESET_TTL_MS` | `1800000`, 30 minutes | Unset | Unset | No | A positive number, else the default with a warning |
| `PASSWORD_RESET_MAX_OUTSTANDING` | `5` live reset links per account | Unset | Unset | No | A positive whole number, else the default with a warning |
| `BOARD_RETENTION_MS` | `604800000`, 7 days, the restore window for a deleted board or task | Unset | Unset | No | A positive number, else the default with a warning |
| `BOARD_PURGE_INTERVAL_MS` | `3600000`, 1 hour, how often the purge job looks | Unset | Unset | No | A positive number, else the default with a warning |
| `FRONTEND_URL` | Required in production. Elsewhere `http://localhost:5173`. The origin the reset link points at | `http://localhost:5173` | Required, `${FRONTEND_URL:?}` | No | Must be an absolute `http` or `https` URL, else refuses to start. Only the origin is kept |
| `SMTP_HOST` | Required in production. Elsewhere `localhost` | `mailpit` | Required, `${SMTP_HOST:?}` | No | Refuses to start in production when unset |
| `SMTP_PORT` | `587` in production, `1025` elsewhere | `1025` | `${SMTP_PORT:-587}` | No | A positive whole number, else the default with a warning |
| `SMTP_SECURE` | `false`. Implicit TLS | Unset | `${SMTP_SECURE:-false}` | No | Only the text `true`, in any case, enables it. Any other text is `false`, see P4-115 |
| `SMTP_ALLOW_PLAINTEXT` | `false`. Drops the TLS requirement, for the mail catcher only | `true` | Never set | No | Only `true` enables it. Refuses to start in production when it is on |
| `SMTP_USER` | Empty, no authentication | Unset | `${SMTP_USER:-}` | No | Must be set together with `SMTP_PASSWORD`, else refuses to start |
| `SMTP_PASSWORD` | Empty | Unset | `${SMTP_PASSWORD:-}` | Yes | Must be set together with `SMTP_USER`, else refuses to start |
| `MAIL_FROM` | Required in production. Elsewhere `BreezyBoard <no-reply@breezyboard.local>` | The default | Required, `${MAIL_FROM:?}` | No | Refuses to start in production when unset |
| `DOTENV_CONFIG_QUIET` | Read by `dotenv`, not by the application. `true` silences its start message | `true` | Unset | No | Not applicable |

`DOTENV_CONFIG_DEBUG` is the other variable `dotenv` reads on its own, and nothing sets it.

The test suite sets `MONGODB_URI` to its in-memory replica set, `NODE_ENV` to `test`, `JWT_SECRET` when unset, `PASSWORD_RESET_COOLDOWN_MS` to 1 and `TRUST_PROXY_HOPS` to 1 in `test/globalSetup.js`, and the rate limiters skip themselves under `NODE_ENV=test` unless a test turns them on.

## Frontend

Vite inlines every `VITE_` variable into the bundle when the page is built, so a value is fixed by the build and every one of them is readable by anyone who opens the page. Never put a secret in one.

| Variable | Read in | Default and requirement | Development | Production | Secret | Validation |
|---|---|---|---|---|---|---|
| `VITE_API_URL` | `services/api.service.ts`, the axios `baseURL` | An empty string, so requests go to the origin of the page | `http://localhost:5000/api/v1`, set by compose | Build argument `/api/v1` in compose. The Dockerfile default is `/api` | No | None. An unset value silently falls back to the page origin, see P4-115 |
| `VITE_USE_STRICT_MODE` | `main.tsx`, React StrictMode | `false` unless the text is exactly `true` | `false` | Build argument `true` | No | A comparison with `'true'` only |

## Compose files and the database container

Variables the compose files substitute, beyond the backend variables above.

| Variable | File | Default | Meaning | Secret |
|---|---|---|---|---|
| `MONGO_DB` | both | `boards-db` | The database name, in `MONGO_INITDB_DATABASE` and in the connection string | No |
| `MONGO_PORT` | development | `27017` | The host port MongoDB is published on. Development only: no shared environment should publish it | No |
| `MAILPIT_UI_PORT` | development | `8025` | The host port of the Mailpit web interface | No |
| `BACK_PORT` | development | `5000` | The host port of the API, and the port in `VITE_API_URL` | No |
| `FRONT_PORT` | development | `5173` | The host port of the Vite dev server, and the port in `FRONTEND_URL` | No |
| `MONGO_USER` | production | Required, `${MONGO_USER:?}` | The root user of MongoDB, passed to the image as `MONGO_INITDB_ROOT_USERNAME` | Yes |
| `MONGO_PASSWORD` | production | Required, `${MONGO_PASSWORD:?}` | Its password, passed as `MONGO_INITDB_ROOT_PASSWORD` and written into `MONGODB_URI` | Yes |
| `HTTP_PORT` | production | `8080` | The host port of nginx, which serves the page and proxies the API | No |

The MongoDB image reads `MONGO_INITDB_DATABASE`, and in production `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD`. Compose sets all three from the variables above, and the production healthcheck reads the two root variables inside the container.

The `docker` job in `.github/workflows/ci.yml` sets throwaway values for the required production variables (`MONGO_USER`, `MONGO_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`, `FRONTEND_URL`, `SMTP_HOST`, `MAIL_FROM`) so that `docker-compose.prod.yml` parses. The images are built and thrown away, so no container ever sees them.

## End to end

| Variable | Read in | Default | Meaning |
|---|---|---|---|
| `E2E_API_URL` | `playwright.config.ts`, the specs and every `verify` script | `http://localhost:5000/api/v1` | The API under test |
| `E2E_FRONT_URL` | `playwright.config.ts` and the browser `verify` scripts | `http://localhost:5173` | The page under test |
| `E2E_PROD_URL` | `verify/csp.mjs` | `http://localhost:8080` | The production stack, the only one with the Content-Security-Policy |
| `E2E_MAIL_URL` | `tests/password-reset.spec.ts` | `http://localhost:8025` | The Mailpit HTTP API, which the reset spec reads the link from |
| `CI` | `playwright.config.ts` | Unset | When set, `forbidOnly` is on and the reporter is `github` and `html` |

None of them is a secret, and none is validated: a wrong URL fails the first request.

`idle.mjs` is run against a stack started with `JWT_INACTIVITY_TTL_MS=90000`, a backend variable, so the inactivity window is short enough to wait out. The normal window is restored afterwards.

## Reads without validation

Every variable above that says None or silently falls back is a read the application does not check. They are recorded as P4-115 in [REVIVAL-PLAN.md](REVIVAL-PLAN.md):

- `NODE_ENV` is any text. Only the exact value `production` turns the production rules on, so a typo such as `prod` makes a production deployment accept the insecure development secret.
- `MONGODB_URI` falls back to an unauthenticated local database in production instead of refusing to start.
- `JWT_SECRET` is checked for presence in production, not for length.
- `PORT` and `SALT` accept anything. A `SALT` of -1 or of 99 is passed on, and bcryptjs clamps it to 4 or 31, so a typo changes the cost of every password hash without a word in the log.
- `SMTP_SECURE` and `SMTP_ALLOW_PLAINTEXT` treat every text but `true` as false, so `yes` or `1` silently turns the option off.
- `CORS_ORIGINS` entries are not parsed as origins.
- `VITE_API_URL` falls back to the page origin when unset.

The numeric windows and limits are checked, but a bad value is replaced by its default with a warning in the log, not refused, so a typo in a production variable is only visible there.
