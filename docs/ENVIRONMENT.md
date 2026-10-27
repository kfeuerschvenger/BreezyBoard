<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/header-strip-dark.svg">
  <img src="assets/brand/header-strip-light.svg" alt="BreezyBoard" width="100%">
</picture>

# Environment

Everything it takes to get BreezyBoard airborne on your machine: the setup, every variable, the seeds and what to check when the wind drops.

## Quick path

Prerequisite: Docker Desktop, running (`docker info` answers). Node 22 and npm 11.17.0 are needed only to run the gates outside the containers.

1. Start the stack from the repository root: `docker compose up -d --build`
2. Seed the colours and board templates: `docker compose exec back npm run seed:templates`
3. Seed the demo workspace with a password of your choosing: `docker compose exec -e DEMO_PASSWORD=<8 characters or more> back npm run seed:demo`
4. Open http://localhost:5173 and sign in as `demo@breezyboard.local` with that password.

Stop it with `docker compose down`. Add `-v` to also delete the database and the uploads.

| What | Where |
|---|---|
| Web application | http://localhost:5173 |
| API | http://localhost:5000/api/v1 |
| Swagger UI, development only | http://localhost:5000/api/docs/ |
| Mailpit, the catcher for password reset mail | http://localhost:8025 |
| MongoDB, published to the host in development only | `mongodb://localhost:27017/boards-db?directConnection=true` |

The compose project is `breezyboard`, with the containers `breezyboard-mongo`, `breezyboard-mailpit`, `breezyboard-back` and `breezyboard-front`. Development bind mounts `back/src`, `back/seeds`, `front/src`, `front/public`, `front/index.html` and `front/vite.config.ts`, so code changes reload on their own: the backend runs `node --watch` and the frontend the Vite dev server. `package.json` and `node_modules` stay inside the images, so a dependency change needs `docker compose build back` (or `front`) and then `docker compose up -d`.

The `mongo` healthcheck initiates the replica set `rs0` on the first start and reports healthy only once the node is a writable primary. A tool on the host connects with `directConnection=true`, because the replica set names `mongo:27017`, a host that only resolves inside the compose network.

## Seeds

Run them in the back container (`docker compose exec back npm run <script>`) or from `back/`.

| Script | Does |
|---|---|
| `seed:templates` | Deletes every board template and palette entry, then inserts the six board hues, the task colours and the board templates (Kanban Board, Personal Planner, Product Roadmap, Bug Tracker and more) |
| `seed:users` | Deletes every account and every personal workspace, then creates six example accounts on `breezyboard.local`, each with a personal workspace. Needs `SEED_USER_PASSWORD` |
| `seed:all` | `seed:templates` and then `seed:users` |
| `seed:demo` | Replaces the demo workspace: the account `demo@breezyboard.local`, two teammates, four boards and cards in every column. Needs `DEMO_PASSWORD` and the templates |
| `migrate:board-hues` | Moves boards, deleted ones included, onto the six hue palette entries. Idempotent |
| `migrate:column-hues` | Moves the columns of boards and templates onto hue entries. Idempotent |

The example accounts are `owner`, `admin`, `john`, `jane`, `mike` and `sarah`, all `@breezyboard.local`, sharing the password passed as `SEED_USER_PASSWORD`. Without it the accounts are skipped with a message and `seed:all` still seeds the reference data. You can also register your own account from the sign in page.

The demo seed is deterministic: its ids are derived from fixed names and its timestamps from a fixed anchor date, and running it again replaces exactly the demo's data and nothing else. `seed:users` deletes every account, the demo's included, so run the demo seed last.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Up["docker compose up -d --build"] --> T["seed:templates<br/>hues, colours, templates"]
  T --> U["seed:users<br/>optional, SEED_USER_PASSWORD"]
  T --> D["seed:demo<br/>DEMO_PASSWORD"]
  U -->|"then, if you want both"| D
  D --> Open["sign in as demo@breezyboard.local"]
  classDef sky fill:#cbeeff,stroke:#00557e,color:#00557e
  classDef teal fill:#bef4f1,stroke:#005d5b,color:#005d5b
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  class Up sky
  class T teal
  class U,D sand
  class Open green
```

> [!WARNING]
> `seed:templates` regenerates every palette id, so boards created before a re-run keep colour references that point nowhere. Re-seed the templates only on a database you are happy to reset.

The destructive seeds refuse to run unless `NODE_ENV` is explicitly `development` or `test`, and unless the database host in `MONGODB_URI` is `localhost`, `127.0.0.1`, `::1` or `mongo`, the compose service. A `mongodb+srv` string always counts as remote. To seed a remote database on purpose, run one script directly with the flag, for example `node seeds/users.seed.js --allow-remote`. The flag passes the host check only, never the environment check. The two migration scripts have no guard: they run against whatever `MONGODB_URI` points at.

## Where each value comes from

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Shell["shell or .env at the repository root"] --> Compose["docker-compose.yml<br/>docker-compose.prod.yml"]
  Compose -->|environment| BackEnv["back container<br/>process.env"]
  Compose -->|"build args, production"| Vite["front build<br/>Vite inlines VITE_ variables"]
  Compose -->|"environment, development"| Dev["front dev server<br/>VITE_ variables"]
  BackEnv --> Dotenv["dotenv reads back/.env<br/>when the file exists"]
  Dotenv --> EnvJs["config/env.js<br/>the one reader"]
  EnvJs --> App["the backend modules"]
  E2e["shell: E2E_ variables"] --> Tests["Playwright and e2e/verify"]
  classDef lavender fill:#ede0ff,stroke:#563e7b,color:#563e7b
  classDef sky fill:#cbeeff,stroke:#00557e,color:#00557e
  classDef teal fill:#bef4f1,stroke:#005d5b,color:#005d5b
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  class Shell,E2e lavender
  class Compose sky
  class BackEnv,Dotenv,EnvJs,App teal
  class Vite,Dev,Tests sand
```

A variable already in the process environment wins over `back/.env`, because `dotenv` never overrides. `.env` at the repository root, `back/.env` and `front/.env` are ignored by git, and `back/.env_example` and `front/.env_example` are the committed templates. The example secret in `back/.env_example` is a sample: never reuse it.

Compose substitutes `${NAME:-default}` from the shell or from a `.env` file at the repository root, and `${NAME:?message}` stops the stack from starting when the variable is missing.

## Backend

Values in the Development column are what `docker-compose.yml` sets, and in the Production column what `docker-compose.prod.yml` sets or what the backend demands. Validation says what `env.js` does with a bad value: a refusal to start, or a default with a warning in the log outside production.

<details>
<summary><strong>Every backend variable</strong></summary>

| Variable | Default and requirement | Development | Production | Secret | Validation |
|---|---|---|---|---|---|
| `NODE_ENV` | `development` when unset. Also read by `utils/logger.js`, `openapi/docs.js` and the seed guard | `development` | `production` | No | One of `development`, `test`, `production`, else refuses to start. A typo such as `prod` is refused rather than read as not production |
| `PORT` | `5000` | `5000` | `5000` | No | A whole number from 1 to 65535, else refuses to start |
| `MONGODB_URI` | `mongodb://localhost/boards-db` outside production | `mongodb://mongo:27017/boards-db?replicaSet=rs0` | `mongodb://USER:PASSWORD@mongo:27017/boards-db?authSource=admin&replicaSet=rs0` | Yes in production, it carries the password | Required in production, with no fallback to a local database. Must start with `mongodb://` or `mongodb+srv://`, else refuses to start |
| `JWT_SECRET` | Required in production. Elsewhere `insecure-development-secret`, with a warning | `dev-only-secret-change-me` unless set | Required, `${JWT_SECRET:?}` | Yes | In production, refuses to start when unset or shorter than 32 characters. Elsewhere any text |
| `SALT` | `10`, the bcrypt cost | `10` | `12` | No | A whole number from 4 to 31, the range bcrypt accepts, else refuses to start |
| `CORS_ORIGINS` | Comma separated origins. Empty reflects any origin outside production | Unset | Required, `${CORS_ORIGINS:?}` | No | Required in production. Each entry must be an origin with a scheme and no path, such as `https://breezyboard.example`, else refuses to start, and the message says which rule failed. Each entry is stored as the origin a browser sends: `https://Example.com:443/` becomes `https://example.com` |
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

</details>

`DOTENV_CONFIG_DEBUG` is the other variable `dotenv` reads on its own, and nothing sets it. The test suite sets `MONGODB_URI` to its in-memory replica set, `NODE_ENV` to `test`, `JWT_SECRET` when unset, `PASSWORD_RESET_COOLDOWN_MS` to 1 and `TRUST_PROXY_HOPS` to 1 in `test/globalSetup.js`.

### Seed passwords

Read by the seed scripts only, never by the application, and never given a default: a password written in the repository is a credential for every clone of it. Pass them with `docker compose exec -e NAME=value back npm run ...`, or export them before running a script directly.

| Variable | Read in | Meaning |
|---|---|---|
| `SEED_USER_PASSWORD` | `seeds/users.seed.js` | The password of every example account on `breezyboard.local`. At least 8 characters. When unset or shorter, the script prints a warning and changes nothing |
| `DEMO_PASSWORD` | `seeds/demo.seed.js`, and `e2e/showcase/capture.mjs` to sign in | The password of `demo@breezyboard.local` and its two teammates. At least 8 characters. When unset or shorter, the seed fails before it connects |

### How the backend checks its variables

`config/env.js` runs one Zod schema over the environment when the module is first imported, at the start of the process. `NODE_ENV` is checked on its own first, because it decides which rules apply to the rest. A variable set to nothing but spaces counts as unset.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff"}}}%%
flowchart TD
  Start["process starts"] --> Node{"NODE_ENV is development,<br/>test or production?"}
  Node -->|no| Refuse["throw: names the variable,<br/>never a value"]
  Node -->|yes| Schema["one Zod schema over every variable"]
  Schema --> Rules{"every rule met?"}
  Rules -->|no| Refuse
  Rules -->|yes| Config["the env object the modules import"]
  Refuse --> Exit["process exits before it listens"]
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  classDef coral fill:#ffdcce,stroke:#7a3621,color:#7a3621
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  class Node,Rules sand
  class Refuse,Exit coral
  class Config green
```

Development and test keep their conveniences: a local database, a published development secret with a warning, any secret length, an empty `CORS_ORIGINS`, and a default with a warning for a mistyped window or limit. Production has none of them:

- `MONGODB_URI` and `JWT_SECRET` are required, with no fallback to an unauthenticated local database or to a published secret.
- `JWT_SECRET` is at least 32 characters. Tokens are signed with HS256, and RFC 7518 section 3.2 asks for a key at least as long as the hash output, 256 bits. A generated secret such as `openssl rand -base64 48` clears it easily.
- A mistyped number is a refusal, not a default nobody chose.
- `NODE_ENV` accepts only its three values everywhere, so `prod` cannot turn the production rules off.

Every problem is reported in one message, so one restart fixes them all. A message is a statement about the variable, for example `JWT_SECRET must be at least 32 characters long in production`, and it never carries a value: a rejected secret or a connection string with a password cannot reach a log.

`PORT`, `SALT`, `SMTP_SECURE`, `SMTP_ALLOW_PLAINTEXT` and `CORS_ORIGINS` are refused everywhere when they are malformed, because a wrong value there is a mistake and not a convenience: bcryptjs would otherwise clamp a `SALT` of 99 to 31 and change the cost of every hash without a word in the log, and `yes` would otherwise read as false.

## Frontend

Vite inlines every `VITE_` variable into the bundle when the page is built, so a value is fixed by the build and readable by anyone who opens the page. Never put a secret in one.

| Variable | Read in | Default | Development | Production | Validation |
|---|---|---|---|---|---|
| `VITE_API_URL` | `config/env.ts`, which gives `services/api.service.ts` its axios `baseURL` | Required in a production build. In development and tests an empty string, so requests go to the origin of the page | `http://localhost:5000/api/v1`, set by compose | Build argument `/api/v1` in compose. The Dockerfile default is `/api` | An absolute `http` or `https` URL, or a path with one leading slash, else the page throws at start |
| `VITE_USE_STRICT_MODE` | `config/env.ts`, which gives `main.tsx` its React StrictMode switch | `false` | `false` | Build argument `true` | `true` or `false`, in any case, else the page throws at start |

`config/env.ts` checks both with Zod when the bundle starts and never prints a value in its message.

## Compose files

Variables the compose files substitute, beyond the backend variables above.

| Variable | File | Default | Meaning | Secret |
|---|---|---|---|---|
| `MONGO_DB` | both | `boards-db` | The database name, in `MONGO_INITDB_DATABASE` and in the connection string | No |
| `MONGO_PORT` | development | `27017` | The host port MongoDB is published on | No |
| `MAILPIT_UI_PORT` | development | `8025` | The host port of the Mailpit web interface | No |
| `BACK_PORT` | development | `5000` | The host port of the API, and the port in `VITE_API_URL` | No |
| `FRONT_PORT` | development | `5173` | The host port of the Vite dev server, and the port in `FRONTEND_URL` | No |
| `MONGO_USER` | production | Required | The root user of MongoDB, passed to the image as `MONGO_INITDB_ROOT_USERNAME` | Yes |
| `MONGO_PASSWORD` | production | Required | Its password, passed as `MONGO_INITDB_ROOT_PASSWORD` and written into `MONGODB_URI` | Yes |
| `HTTP_PORT` | production | `8080` | The host port of nginx, which serves the page and proxies the API | No |

### Trying the production stack locally

`docker-compose.prod.yml` builds the production images: the frontend is built into nginx, which serves it and proxies `/api` and `/uploads` to the backend on a single origin. It serves plain HTTP on `HTTP_PORT`, so TLS has to be terminated in front of it. The first start generates the MongoDB keyfile into its own volume.

```bash
MONGO_USER=bb MONGO_PASSWORD=devpassword JWT_SECRET=local-trial-secret-not-for-real-use-0123456789 \
  CORS_ORIGINS=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
  SMTP_HOST=localhost MAIL_FROM='BreezyBoard <no-reply@example.test>' HTTP_PORT=8080 \
  docker compose -f docker-compose.prod.yml up -d --build
```

Those values are for a local trial, never for a real deployment. Swagger UI is not served there.

## End to end

| Variable | Read in | Default | Meaning |
|---|---|---|---|
| `E2E_API_URL` | `playwright.config.ts`, the specs and every `verify` script | `http://localhost:5000/api/v1` | The API under test |
| `E2E_FRONT_URL` | `playwright.config.ts` and the browser `verify` scripts | `http://localhost:5173` | The page under test |
| `E2E_PROD_URL` | `verify/csp.mjs` | `http://localhost:8080` | The production stack, the only one with the Content-Security-Policy |
| `E2E_MAIL_URL` | `tests/password-reset.spec.ts` | `http://localhost:8025` | The Mailpit HTTP API, which the reset spec reads the link from |
| `CI` | `playwright.config.ts` | Unset | When set, `forbidOnly` is on and the reporter is `github` and `html` |

None of them is a secret, and none is validated: a wrong URL fails the first request. The showcase pipeline reads its own variables, listed in [TESTING.md](TESTING.md#the-showcase-pipeline).

## Running without Docker

1. Start MongoDB 7 as a replica set: `mongod --replSet rs0`, then once in `mongosh`: `rs.initiate()`.
2. In `back/`: copy `.env_example` to `.env`, set `MONGODB_URI=mongodb://localhost:27017/boards-db?replicaSet=rs0`, then `npm ci`, `npm run seed:templates` and `npm run dev`.
3. For mail, run Mailpit (SMTP on 1025, web on 8025) and set `SMTP_ALLOW_PLAINTEXT=true`, since Mailpit speaks no TLS.
4. In `front/`: copy `.env_example` to `.env`, then `npm ci` and `npm run dev`.

Install npm 11.17.0 first (`npm install --global npm@11.17.0`): the npm bundled with Node 22 ignores the install script policy described in [CI.md](CI.md#install-scripts).

## Troubleshooting

| Symptom | Check first |
|---|---|
| `docker compose` cannot reach the engine | Docker Desktop is not running. Start it and wait for `docker info` to answer |
| `npm run seed:demo` is missing in the container | The image predates the script. `docker compose up -d --build` rebuilds it with the current `package.json` |
| The demo seed says the colours and templates are missing | Run `seed:templates` first |
| The API answers 429 on register or password recovery | A limiter is spent. `docker compose restart back` clears the in-memory counters |
| A dependency change has no effect in the container | `package.json` is not bind mounted. Run `docker compose build back` and then `docker compose up -d` |
| A seed refuses to run | `NODE_ENV` is not `development` or `test` in that container, or `MONGODB_URI` names a host that is not local |
| Registering fails with a transaction error, or deleted boards are never purged | MongoDB is not a replica set. Use the compose file, or start `mongod` with `--replSet rs0` and run `rs.initiate()` once |
| The backend exits at start listing variables | Read the list. Production needs `MONGODB_URI`, `JWT_SECRET` of 32 characters or more, `CORS_ORIGINS`, `FRONTEND_URL`, `SMTP_HOST` and `MAIL_FROM` |
| The page throws at start about its configuration | `VITE_API_URL` is missing from a production build or malformed. It is inlined, so rebuild |
| Password reset mail never arrives in development | The Mailpit container is down, or `SMTP_ALLOW_PLAINTEXT` is not `true` for a backend run outside compose |
| The production MongoDB cannot authenticate after a reset | `mongo-keyfile` was deleted without `mongo-data`. Delete both volumes, or neither |
| `npm install` fails with `ESTRICTALLOWSCRIPTS` | A dependency has an install script that `allowScripts` does not cover. See [CI.md](CI.md#install-scripts) |

---

[Back to the README](../README.md) · Previous: [Architecture](ARCHITECTURE.md) · Next: [Testing](TESTING.md)
