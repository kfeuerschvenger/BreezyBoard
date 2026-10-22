# BreezyBoard

A Kanban board application: workspaces hold boards, boards hold columns, columns hold draggable task cards.

## Overview

BreezyBoard is a web application for planning work on boards. People sign in, belong to workspaces, create boards from templates, invite other members, and move task cards between columns by mouse or keyboard. Deleting a board or a task is a soft delete with a restore window.

Access has two levels. A workspace member may be added to individual boards, and a workspace admin administers every board in the workspace. Every authenticated request slides the session forward, and an inactive session ends after 15 minutes by default.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 7, Tailwind CSS 4, TanStack Query 5, React Router 7, dnd-kit, Motion |
| Backend | Node 22, Express 5, Mongoose 8, Zod 4 for request validation, pino for logging |
| Database | MongoDB 7 as a single node replica set (`rs0`), because registration and the purge of a deleted board with its tasks run in transactions |
| API contract | OpenAPI 3.1 generated from the Zod schemas, committed in `docs/openapi.yaml` |
| Tests | Vitest and Supertest (backend), Vitest and Testing Library (frontend), Playwright and the `e2e/verify` scripts (end to end) |
| Containers | Docker Compose for development and for production, nginx in front of the production API |

## Architecture

```
  Browser
     |
     |  development: http://localhost:5173 (page), http://localhost:5000/api/v1 (API)
     |  production:  one origin, nginx serves the page and proxies /api and /uploads
     v
+-----------------+   /api/v1   +-----------------+   mongodb   +-----------------+
| front           +------------>| back            +------------>| mongo           |
| React + Vite    |             | Express 5       |             | MongoDB 7       |
| (nginx in prod) |             | Node 22         |             | replica set rs0 |
+-----------------+             +--------+--------+             +-----------------+
                                         |
                                         | SMTP (password reset mail)
                                         v
                                +-----------------+
                                | mailpit         |   development only,
                                | web UI :8025    |   production uses a real relay
                                +-----------------+
```

The backend is layered: routes, middleware, validation, controllers, services, models, and a background job that purges deleted boards. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started

Prerequisite: Docker Desktop. Node 22 and npm 11.17.0 are needed only to run the gates outside the containers.

1. Start Docker Desktop and wait until `docker info` answers.
2. From the repository root, start the stack: `docker compose up -d --build`
3. Seed the reference data and the demo accounts: `docker compose exec back npm run seed:all`
4. Open http://localhost:5173 and sign in as `admin@example.com` with the password `admin123`.

The seed scripts delete data, so they refuse to run unless `NODE_ENV` is `development` or `test`, and unless the database host in `MONGODB_URI` is `localhost`, `127.0.0.1`, `::1` or `mongo`, the compose service. A `mongodb+srv` string always counts as remote. To seed a remote database on purpose, run one script directly with the flag, for example `node seeds/users.seed.js --allow-remote`. The demo accounts exist only in development.

| What | Where |
|---|---|
| Web application | http://localhost:5173 |
| API | http://localhost:5000/api/v1 |
| Swagger UI, development only | http://localhost:5000/api/docs/ |
| Mailpit, the catcher for password reset mail | http://localhost:8025 |
| MongoDB, published to the host in development only | `mongodb://localhost:27017/boards-db?directConnection=true` |

Stop it with `docker compose down`. Add `-v` to also delete the database and the uploads.

## Configuration

Every environment variable of the backend, the frontend, the compose files and the end to end suite is listed in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md), with where it is read, its default, and whether it is a secret. The development compose file sets everything the stack needs, so nothing has to be configured to run it locally.

## API reference

The API is versioned under `/api/v1`. The unversioned `/api` path is a deprecated alias that answers identically.

The contract is [docs/openapi.yaml](docs/openapi.yaml), generated from the same Zod schemas the routes validate with. In development, Swagger UI renders it at http://localhost:5000/api/docs/. The route is not mounted in test or production, where it answers 404.

After changing a route schema, regenerate the document and commit it:

```
cd back
npm run openapi
```

`npm run openapi:check` fails when the committed document is out of date, and CI runs it. The document embeds the `version` of `back/package.json` as `info.version`, so bumping the version fails the check until `npm run openapi` is run and the result is committed.

## Data model

```
users --------< workspaces.members (role: admin | member)
workspaces ---< boards
boards -------< tasks
boards embed their columns, copied from a boardtemplate when the board is created
colorpalettes are referenced by boards (six hues), columns and tasks
```

A task's `status` is the id of one of its board's columns, and its `order` is a fractional index key: moving a card writes that one document. Boards and tasks carry `deletedAt` for the soft delete. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Testing and gates

| Package | Command, run from its folder | Checks |
|---|---|---|
| `back` | `npm run lint` | ESLint |
| `back` | `npm test` | Vitest with an in-memory MongoDB replica set, no database to start |
| `back` | `npm run openapi:check` | `docs/openapi.yaml` matches the route schemas |
| `front` | `npx eslint src/` | ESLint |
| `front` | `npm run build` | The type check (`tsc -b`) and the production bundle |
| `front` | `npx vitest run --no-file-parallelism` | Unit and component tests |
| `e2e` | `npm run typecheck` | The Playwright and verify code compiles |
| `e2e` | `npx playwright test` | The browser suite, against the running development stack |
| `e2e` | `npm run verify` | The standing scripts in `e2e/verify`, against the running development stack |
| repository root | `node scripts/audit-gate.mjs` | No vulnerable dependency in any package |

`npm run build` is the type check of the frontend. `npx tsc --noEmit` checks nothing there, because the root `tsconfig.json` only holds project references, and it exits 0 whatever the code says.

Playwright and the verify scripts need the development stack up, the seed run, and Mailpit reachable. `csp.mjs` is the exception: it runs against the production stack. What each script asserts is in [e2e/verify/README.md](e2e/verify/README.md).

## CI and branches

Work happens on typed branches (`feature/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`). Nothing is pushed straight to `develop`, `test` or `main`: all three are protected and take changes only through pull requests.

```
feature/*  fix/*  chore/*  docs/*  refactor/*  test/*
      |
      |  pull request
      v
  develop ----- pull request -----> test ----- pull request, after manual testing -----> main
```

Each pull request into `develop`, `test` or `main` must pass five CI jobs, defined in `.github/workflows/ci.yml`:

| Job | Runs |
|---|---|
| `back` | lint, the OpenAPI drift check, the tests |
| `front` | lint, the type check and build, the unit tests |
| `e2e` | the type check of the end to end code |
| `docker` | the production images and both development images |
| `audit` | the audit gate and its own tests |

Playwright and `e2e/verify` need the whole stack and stay local gates. The deploy workflows for `test` and `main` are placeholders.

## Dependencies and install scripts

`node scripts/audit-gate.mjs` runs `npm audit` in every directory one level below the root that has a `package-lock.json` (`back`, `front` and `e2e`), development dependencies included. It fails on any moderate, high or critical advisory and on five or more low ones, and prints the vulnerable packages with their severity. An audit that cannot be read is a failure, never a pass: a registry error, an `npm audit` that does not finish in two minutes, output that is not a report, and a repository with no package at all all exit 2.

npm 11.17.0 blocks a dependency's install script unless `allowScripts` in that package's `package.json` lists it, and `strict-allow-scripts=true` in each `.npmrc` turns an unlisted script into an install error. The approved scripts are `mongodb-memory-server` in `back`, and `esbuild` and `@tailwindcss/oxide` in `front`. `fsevents` and `@scarf/scarf` are denied. The Dockerfiles and the CI install npm 11.17.0 first, because the npm bundled with Node 22 ignores the policy. A new dependency with an install script fails the install until someone decides.

## Deployment

`docker-compose.prod.yml` builds the production images: the frontend is built into nginx, which serves it and proxies `/api` and `/uploads` to the backend on a single origin. The stack serves plain HTTP on `HTTP_PORT` (8080 by default), so TLS has to be terminated in front of it.

The compose file refuses to start without `MONGO_USER`, `MONGO_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`, `FRONTEND_URL`, `SMTP_HOST` and `MAIL_FROM`, and the backend refuses to start in production without a database connection string, a secret of at least 32 characters, an origin allowlist and a mail relay, and for any variable with a malformed value. The first start generates the MongoDB keyfile into its own volume.

```
MONGO_USER=bb MONGO_PASSWORD=devpassword JWT_SECRET=local-trial-secret-not-for-real-use-0123456789 \
  CORS_ORIGINS=http://localhost:8080 FRONTEND_URL=http://localhost:8080 \
  SMTP_HOST=localhost MAIL_FROM='BreezyBoard <no-reply@example.test>' HTTP_PORT=8080 \
  docker compose -f docker-compose.prod.yml up -d --build
```

Those values are for a local trial of the production stack, never for a real deployment. Swagger UI is not served there.

## Troubleshooting

| Symptom | Check first |
|---|---|
| `docker compose` cannot reach the engine | Docker Desktop is not running. Start it and wait for `docker info` to answer |
| The API answers 429 on register or password recovery | A limiter is spent. `docker compose restart back` clears the in-memory counters |
| A dependency change has no effect in the container | `package.json` is not bind mounted. Run `docker compose build back` and then `docker compose up -d` |
| `npm run seed:all` refuses to run | `NODE_ENV` is not `development` or `test` in that container, or `MONGODB_URI` names a host that is not local. The seeds delete data on purpose only there |
| Registering fails with a transaction error, or deleted boards are never purged | MongoDB is not a replica set. Use the compose file, or start `mongod` with `--replSet rs0` and run `rs.initiate()` once |
| The production MongoDB cannot authenticate after a reset | `mongo-keyfile` was deleted without `mongo-data`. Delete both volumes, or neither |
| `npm install` fails with `ESTRICTALLOWSCRIPTS` | A dependency has an install script that `allowScripts` does not cover. Read it, then approve or deny it |

## Documentation

| Document | What it holds |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Backend layers, the session model, the data model, the frontend structure, the verify scripts |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |
| [docs/openapi.yaml](docs/openapi.yaml) | The API contract |
| [e2e/verify/README.md](e2e/verify/README.md) | The standing verification scripts |
