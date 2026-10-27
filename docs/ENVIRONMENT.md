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

Values in the Development column are what `docker-compose.yml` sets, and in the Production column what `docker-compose.prod.yml` sets or what the backend demands. Validation says what `env.js` does with a bad value: a refusal to start, or a default with a warning in the log outside production. How the checks work is described after the tables.

| Variable | Default and requirement | Development | Production | Secret | Validation |
|---|---|---|---|---|---|
| `NODE_ENV` | `development` when unset. Also read by `utils/logger.js`, `openapi/docs.js` and the seed guard | `development` | `production` | No | One of `development`, `test`, `production`, else refuses to start. A typo such as `prod` is refused rather than read as not production |
| `PORT` | `5000` | `5000` | `5000` | No | A whole number from 1 to 65535, else refuses to start |
| `MONGODB_URI` | `mongodb://localhost/boards-db` outside production | `mongodb://mongo:27017/boards-db?replicaSet=rs0` | `mongodb://USER:PASSWORD@mongo:27017/boards-db?authSource=admin&replicaSet=rs0` | Yes in production, it carries the password | Required in production, with no fallback to a local database. Must start with `mongodb://` or `mongodb+srv://`, else refuses to start |
| `JWT_SECRET` | Required in production. Elsewhere `insecure-development-secret`, with a warning | `dev-only-secret-change-me` unless set | Required, `${JWT_SECRET:?}` | Yes | In production, refuses to start when unset or shorter than 32 characters. Elsewhere any text |
| `SALT` | `10`, the bcrypt cost | `10` | `12` | No | A whole number from 4 to 31, the range bcrypt accepts, else refuses to start |
| `CORS_ORIGINS` | Comma separated origins. Empty reflects any origin outside production | Unset | Required, `${CORS_ORIGINS:?}` | No | Required in production. Each entry must be an origin with a scheme and no path, such as `https://breezyboard.example`, else refuses to start, and the message says which rule failed (not a URL, not http or https, credentials, path, query string or fragment). Each entry is stored as the origin a browser sends: a trailing slash, a default port and upper case letters in the host are dropped, so `https://Example.com:443/` becomes `https://example.com` |
| `TRUST_PROXY_HOPS` | `1` in production, `0` elsewhere. Reverse proxies in front of the API, used for the address every rate limiter keys on | Unset, so `0` | `${TRUST_PROXY_HOPS:-1}` | No | A whole number of zero or more. A bad value refuses to start in production and falls back to the default with a warning elsewhere |
| `JWT_INACTIVITY_TTL_MS` | `900000`, 15 minutes | `900000` | Unset, so the default | No | A number greater than zero. A bad value refuses to start in production and falls back to the default with a warning elsewhere |
| `JWT_ABSOLUTE_TTL_MS` | `14400000`, 4 hours | `14400000` | Unset, so the default | No | Same rule as `JWT_INACTIVITY_TTL_MS` |
| `REGISTRATION_LIMIT_PER_HOUR` | `20` accounts per client address per hour | `500` | Unset on purpose, so `20` | No | A whole number greater than zero, with the same production and development behaviour |
| `PASSWORD_RECOVERY_LIMIT_PER_15_MIN` | `10` requests per client address | `500` | Unset on purpose, so `10` | No | A whole number greater than zero, with the same production and development behaviour |
| `PASSWORD_RESET_COOLDOWN_MS` | `60000`, the shortest gap between two reset emails to one address | `1000` | Unset, so the default | No | A number greater than zero, with the same production and development behaviour |
| `PASSWORD_RESET_TTL_MS` | `1800000`, 30 minutes | Unset | Unset | No | A number greater than zero, with the same production and development behaviour |
| `PASSWORD_RESET_MAX_OUTSTANDING` | `5` live reset links per account | Unset | Unset | No | A whole number greater than zero, with the same production and development behaviour |
| `BOARD_RETENTION_MS` | `604800000`, 7 days, the restore window for a deleted board or task | Unset | Unset | No | A number greater than zero, with the same production and development behaviour |
| `BOARD_PURGE_INTERVAL_MS` | `3600000`, 1 hour, how often the purge job looks | Unset | Unset | No | A number greater than zero, with the same production and development behaviour |
| `FRONTEND_URL` | Required in production. Elsewhere `http://localhost:5173`. The origin the reset link points at | `http://localhost:5173` | Required, `${FRONTEND_URL:?}` | No | Must be an absolute `http` or `https` URL, else refuses to start. Only the origin is kept |
| `SMTP_HOST` | Required in production. Elsewhere `localhost` | `mailpit` | Required, `${SMTP_HOST:?}` | No | Refuses to start in production when unset |
| `SMTP_PORT` | `587` in production, `1025` elsewhere | `1025` | `${SMTP_PORT:-587}` | No | A whole number greater than zero, with the same production and development behaviour |
| `SMTP_SECURE` | `false`. Implicit TLS | Unset | `${SMTP_SECURE:-false}` | No | `true` or `false`, in any case, else refuses to start. `yes` and `1` are refused |
| `SMTP_ALLOW_PLAINTEXT` | `false`. Drops the TLS requirement, for the mail catcher only | `true` | Never set | No | `true` or `false`, in any case, else refuses to start. Refuses to start in production when it is on |
| `SMTP_USER` | Empty, no authentication | Unset | `${SMTP_USER:-}` | No | Must be set together with `SMTP_PASSWORD`, else refuses to start |
| `SMTP_PASSWORD` | Empty | Unset | `${SMTP_PASSWORD:-}` | Yes | Must be set together with `SMTP_USER`, else refuses to start. Only spaces counts as unset, and a real password keeps the spaces it has |
| `MAIL_FROM` | Required in production. Elsewhere `BreezyBoard <no-reply@breezyboard.local>` | The default | Required, `${MAIL_FROM:?}` | No | Refuses to start in production when unset |
| `DOTENV_CONFIG_QUIET` | Read by `dotenv`, not by the application. `true` silences its start message | `true` | Unset | No | Not applicable |

`DOTENV_CONFIG_DEBUG` is the other variable `dotenv` reads on its own, and nothing sets it.

The test suite sets `MONGODB_URI` to its in-memory replica set, `NODE_ENV` to `test`, `JWT_SECRET` when unset, `PASSWORD_RESET_COOLDOWN_MS` to 1 and `TRUST_PROXY_HOPS` to 1 in `test/globalSetup.js`, and the rate limiters skip themselves under `NODE_ENV=test` unless a test turns them on.

### Seed passwords

Read by the seed scripts only, never by the application, and never given a default: a password written in the repository is a credential for every clone of it. Pass them to the container with `docker compose exec -e NAME=value back npm run ...`, or export them before running a script directly.

| Variable | Read in | Meaning |
|---|---|---|
| `SEED_USER_PASSWORD` | `seeds/users.seed.js` | The password of every example account on `breezyboard.local`. At least 8 characters. When unset or shorter, the script prints a warning and changes nothing, so `seed:all` still seeds the reference data |

## Frontend

Vite inlines every `VITE_` variable into the bundle when the page is built, so a value is fixed by the build and every one of them is readable by anyone who opens the page. Never put a secret in one.

| Variable | Read in | Default and requirement | Development | Production | Secret | Validation |
|---|---|---|---|---|---|---|
| `VITE_API_URL` | `config/env.ts`, which gives `services/api.service.ts` its axios `baseURL` | Required in a production build. In development and tests an empty string, so requests go to the origin of the page | `http://localhost:5000/api/v1`, set by compose | Build argument `/api/v1` in compose. The Dockerfile default is `/api` | No | An absolute `http` or `https` URL, or a path with one leading slash, else the page throws at start. Unset in a production build also throws |
| `VITE_USE_STRICT_MODE` | `config/env.ts`, which gives `main.tsx` its React StrictMode switch | `false` | `false` | Build argument `true` | No | `true` or `false`, in any case, else the page throws at start |

`config/env.ts` checks both with Zod when the bundle starts and never prints a value in its message.

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

The `docker` job in `.github/workflows/ci.yml` sets throwaway values for the required production variables (`MONGO_USER`, `MONGO_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`, `FRONTEND_URL`, `SMTP_HOST`, `MAIL_FROM`) so that `docker-compose.prod.yml` parses. The images are built and thrown away, so no container ever sees them. They are valid all the same, a `JWT_SECRET` of more than 32 characters among them, so the same values start the production stack if a job ever does.

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

## How the backend checks its variables

`config/env.js` runs one Zod schema over the environment when the module is first imported, which is at the start of the process. `NODE_ENV` is checked on its own first, because it decides which rules apply to the rest. A variable set to nothing but spaces counts as unset.

```mermaid
flowchart TD
  Start["process starts"] --> Node{"NODE_ENV is development,<br/>test or production?"}
  Node -->|no| Refuse["throw: names the variable,<br/>never a value"]
  Node -->|yes| Schema["one Zod schema over every variable"]
  Schema --> Rules{"every rule met?"}
  Rules -->|no| Refuse
  Rules -->|yes| Config["the env object the modules import"]
  Refuse --> Exit["process exits before it listens"]
```

The rules differ by environment on purpose. Development and test keep their conveniences: a local database, a published development secret with a warning, any secret length, an empty `CORS_ORIGINS`, and a default with a warning for a mistyped window or limit. Production has none of them:

- `MONGODB_URI` and `JWT_SECRET` are required, with no fallback to an unauthenticated local database or to a published secret.
- `JWT_SECRET` is at least 32 characters. Tokens are signed with HS256, and RFC 7518 section 3.2 asks for a key at least as long as the hash output, 256 bits. Thirty-two characters of text are at least 32 bytes, and a generated secret such as `openssl rand -base64 48` clears it easily.
- A mistyped number is a refusal, not a default nobody chose.
- `NODE_ENV` accepts only its three values everywhere, so `prod` cannot turn the production rules off.

Every problem is reported in one message, so one restart fixes them all. A message is a statement about the variable, for example `JWT_SECRET must be at least 32 characters long in production`, and it never carries a value: a rejected secret or a connection string with a password cannot reach a log or a container's status. `test/envValidation.test.js` asserts that for each rule, and `test/mail.test.js` and `test/trustProxy.test.js` cover the older rules through the same module.

`PORT`, `SALT`, `SMTP_SECURE`, `SMTP_ALLOW_PLAINTEXT` and `CORS_ORIGINS` are refused everywhere when they are malformed, because a wrong value there is a mistake and not a convenience: bcryptjs would otherwise clamp a `SALT` of 99 to 31 and change the cost of every hash without a word in the log, and `yes` would otherwise read as false.
