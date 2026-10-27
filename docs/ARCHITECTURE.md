<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/header-strip-dark.svg">
  <img src="assets/brand/header-strip-light.svg" alt="BreezyBoard" width="100%">
</picture>

# Architecture

How the wind moves through BreezyBoard: one SPA, one API, one replica set, and a few firm rules about who may touch what.

This page covers the backend layers, access control, the session model, the data model and the frontend structure. The variables live in [ENVIRONMENT.md](ENVIRONMENT.md), the tests in [TESTING.md](TESTING.md) and the HTTP contract in [API.md](API.md).

## System

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/diagrams/architecture-dark.svg">
  <img src="assets/diagrams/architecture-light.svg" alt="The browser runs the React SPA, which calls the Express API under /api/v1; the API stores data in a MongoDB replica set, avatars in an uploads volume, and sends reset mail over SMTP" width="100%">
</picture>

In production nginx serves the built page and proxies `/api` and `/uploads` to the backend, so the browser sees one origin and the backend trusts exactly one proxy hop for the address its rate limiters key on. The diagram source is [assets/diagrams/architecture.d2](assets/diagrams/architecture.d2).

## Backend

All of it lives in `back/src`. A request passes through the same stack of layers, and each layer has one job.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "secondaryColor": "#bef4f1", "secondaryBorderColor": "#005d5b", "secondaryTextColor": "#005d5b", "tertiaryColor": "#fbe5bf", "tertiaryBorderColor": "#684600", "tertiaryTextColor": "#684600", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff", "clusterBkg": "#f1faff", "clusterBorder": "#46b1e3"}}}%%
flowchart TD
  Req[Request] --> Log["logging.middleware<br/>request id, req.log"]
  Log --> Sec["helmet, cors, express.json 1 MB"]
  Sec --> Docs["Swagger UI at /api/docs<br/>only when NODE_ENV is development"]
  Docs --> Mount["/api/v1 and /api mount the same routers"]
  Mount --> Rate["rateLimit.middleware<br/>on the auth routes"]
  Rate --> Auth["authenticate<br/>bearer JWT, revocation, absolute cap, renewal"]
  Auth --> Val["validate<br/>Zod params, body, query"]
  Val --> Role["requireWorkspaceRole, requireBoardRole,<br/>requireTaskBoardRole"]
  Role --> Ctl["controllers<br/>read the request, call a service, answer"]
  Ctl --> Svc["services<br/>the rules"]
  Svc --> Mod["models<br/>Mongoose schemas"]
  Mod --> DB[(MongoDB)]
  Ctl -.->|"next(error)"| Err["error.middleware<br/>one error body"]
  Svc -.->|"throw ApiError"| Err
  classDef sky fill:#cbeeff,stroke:#00557e,color:#00557e
  classDef teal fill:#bef4f1,stroke:#005d5b,color:#005d5b
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  classDef coral fill:#ffdcce,stroke:#7a3621,color:#7a3621
  classDef lavender fill:#ede0ff,stroke:#563e7b,color:#563e7b
  class Req lavender
  class Log,Sec,Docs,Mount sky
  class Rate,Auth,Val,Role teal
  class Ctl,Svc,Mod sky
  class DB green
  class Err coral
```

| Folder | Holds |
|---|---|
| `config` | `env.js` reads the environment once and everything else imports it, with three exceptions that read `NODE_ENV` themselves (`utils/logger.js`, `openapi/docs.js` and the seed guard), and `db.js` connects Mongoose |
| `routes` | One router per resource, wired in `routes/index.js`, the table `app.js` mounts and the OpenAPI coverage test walks |
| `middleware` | `auth` (authentication and the three role gates), `validate`, `rateLimit`, `upload` and `verifyImage` for avatars, `logging`, `error` |
| `validation` | The Zod schemas for params, query and body. A passing request has its values replaced by the parsed output, so a route only ever sees whitelisted fields |
| `controllers` | Thin: take the validated request, call a service, answer with `{ success, data }` |
| `services` | The business rules: ordering keys, soft delete and restore, sessions, password reset, mail |
| `models` | The Mongoose schemas: `User`, `Workspace`, `Board`, `Task`, `ColorPalette`, `BoardTemplate` and the shared column schema |
| `jobs` | `boardPurge.job.js`, the timer that removes deleted boards and tasks past retention |
| `constants`, `utils` | Error codes and board hues, the logger, `ApiError` and `responseHandler` |
| `migrations` | `boardHues.js` and `columnHues.js`, run by `npm run migrate:board-hues` and `npm run migrate:column-hues` through thin scripts in `back/seeds` that connect and call them |
| `openapi` | The OpenAPI document built from the Zod schemas, and the development only Swagger UI mount |

Every failure leaves through `error.middleware.js` as one body with a machine readable `code`. The codes and the body are listed in [API.md](API.md#errors). A Mongoose `CastError` or `ValidationError` becomes a 400, and anything else a 500 that names nothing.

`startServer.js` connects the database, listens, starts the purge job and, on `SIGINT` or `SIGTERM`, stops the job, lets the server drain and closes the connection.

> [!NOTE]
> The backend is meant to run as a single Node process. The queue that serialises the repairs of one board's stranded cards, and the record that throttles the check for them, live in that process's memory, so a second instance would run its own queue and the repairs of one board could overlap.

### Access control

Access has two levels, resolved in `auth.middleware.js` and never in a route.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "secondaryColor": "#bef4f1", "secondaryBorderColor": "#005d5b", "secondaryTextColor": "#005d5b", "tertiaryColor": "#fbe5bf", "tertiaryBorderColor": "#684600", "tertiaryTextColor": "#684600", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff", "clusterBkg": "#f1faff", "clusterBorder": "#46b1e3"}}}%%
flowchart LR
  A[Request on a board] --> W{"Role in the<br/>board's workspace?"}
  W -->|none| N["no role: 404 or 403"]
  W -->|admin| O[owner]
  W -->|member| C{"Creator of<br/>the board?"}
  C -->|yes| O
  C -->|no| M{"In board.members?"}
  M -->|yes| Mem[member]
  M -->|no| N
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  classDef coral fill:#ffdcce,stroke:#7a3621,color:#7a3621
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  class O,Mem green
  class N coral
  class W,C,M sand
```

A route asks for a minimum role: `member` or `owner` on a board, `member` or `admin` on a workspace. A soft deleted board or task is a missing one for every route except its own restore, which resolves the role first so that a caller with no role cannot tell a deleted board from an unknown id.

## Authentication and sessions

The session slides like a kite on a steady gust: every request you make keeps it up, and it lands on its own when you stop.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "secondaryColor": "#bef4f1", "secondaryBorderColor": "#005d5b", "secondaryTextColor": "#005d5b", "tertiaryColor": "#fbe5bf", "tertiaryBorderColor": "#684600", "tertiaryTextColor": "#684600", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "actorBkg": "#cbeeff", "actorBorder": "#00557e", "actorTextColor": "#00557e", "signalColor": "#46b1e3", "signalTextColor": "#2f7fa8", "labelBoxBkgColor": "#bef4f1", "labelBoxBorderColor": "#005d5b", "labelTextColor": "#005d5b", "loopTextColor": "#005d5b", "noteBkgColor": "#ede0ff", "noteBorderColor": "#563e7b", "noteTextColor": "#563e7b"}}}%%
sequenceDiagram
  participant C as Client
  participant S as API
  C->>S: POST /auth/login
  S-->>C: token (sessionStartedAt stamped once, exp = inactivity window)
  loop every authenticated request
    C->>S: Authorization Bearer token
    S->>S: verify, check tokenVersion, check the absolute cap
    S-->>C: response plus X-Auth-Token, a renewed token
    C->>C: replace the stored token
  end
  C->>S: POST /auth/logout or a password change
  S->>S: tokenVersion + 1, every earlier token is dead on its next use
```

| Property | Behaviour |
|---|---|
| Transport | `Authorization: Bearer` in, `X-Auth-Token` out. The header is in the CORS `exposedHeaders`, or a browser would hide it. There is no cookie |
| Two clocks | `exp` is the inactivity window, rewritten on every renewal (`JWT_INACTIVITY_TTL_MS`, 15 minutes by default). `sessionStartedAt` is the absolute cap, never rewritten (`JWT_ABSOLUTE_TTL_MS`, 4 hours by default) |
| Revocation | `tokenVersion` on the user is part of every token. Logout and a password change bump it |
| Renewal | A side effect of `authenticate`, before the handler runs, so a 403 or a 500 still renews: a human made the request |
| Client | The token is in `localStorage`. `useKeepAlive` pings from a keydown, a pointer down, a scroll or a tab becoming visible, never from a timer, and `useSessionExpiry` warns 60 seconds before the deadline. Open tabs share renewals over a `BroadcastChannel` |
| No polling | The server cannot enforce inactivity on its own, because it renews on every request it sees. A stray interval in the client would turn the window into a session that never ends, which `e2e/verify/idle.mjs` is there to catch |
| Password reset | A mailed link with a token whose SHA-256 is stored, bounded in number and lifetime, and a successful reset revokes every session |

## Data model

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "secondaryColor": "#bef4f1", "secondaryBorderColor": "#005d5b", "tertiaryColor": "#fbe5bf", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "attributeBackgroundColorOdd": "#f1faff", "attributeBackgroundColorEven": "#ffffff"}}}%%
erDiagram
  USER {
    ObjectId _id
    string firstName
    string lastName
    string email UK
    string password "select false"
    string avatar
    string breeze "still, calm, breezy, gusty"
    number tokenVersion
    array passwordResets "token hash and expiry"
  }
  WORKSPACE {
    ObjectId _id
    string name
    ObjectId createdBy
    array members "user and role admin or member"
    boolean isPersonal
  }
  BOARD {
    ObjectId _id
    string title
    ObjectId color "ColorPalette of type board"
    ObjectId template
    array columns "title, color, order"
    number columnsVersion "counts changes to columns"
    ObjectId workspaceId
    ObjectId createdBy
    array members
    date deletedAt
  }
  TASK {
    ObjectId _id
    string title
    string status "id of a board column"
    string priority "low, medium, high"
    ObjectId color
    ObjectId owner
    ObjectId boardId
    array checklist "text and completed"
    string order "fractional index key"
    date deletedAt
  }
  COLORPALETTE {
    ObjectId _id
    string name
    string value UK
    string type "board, task, column"
  }
  BOARDTEMPLATE {
    ObjectId _id
    string name UK
    array columns
    string iconName
  }
  USER ||--o{ WORKSPACE : "member of"
  WORKSPACE ||--o{ BOARD : contains
  BOARD ||--o{ TASK : contains
  BOARDTEMPLATE ||--o{ BOARD : "columns copied from"
  COLORPALETTE ||--o{ BOARD : colours
  COLORPALETTE ||--o{ TASK : colours
```

<details>
<summary><strong>The design decisions behind the model</strong></summary>

| Decision | Why |
|---|---|
| Every account gets a personal workspace at registration, in the same transaction as the account | A board always has a workspace, so no query handles a board that belongs to nothing |
| A board's columns are copied from its template and embedded | Renaming or removing a column on one board touches no other board. A task's `status` is the id of one of those embedded columns |
| A board's colour is one of six hues: `sky`, `teal`, `green`, `sand`, `coral`, `lavender` | The `value` of a board colour is the hue key, and the interface derives its tints from it. A column is painted from the same six entries, chosen by the owner and stored on the column, so adding or removing a column never recolours its neighbours. Task colours keep hex values |
| A board's owner edits its columns with one request that carries the complete ordered list | A column that carries its `_id` keeps it, so every task's `status` still points at it, and a column left out is removed only while it has no live tasks. A name is 1 to 40 characters and unique on the board ignoring case, a board has 2 to 8 columns, and every rule is checked before one write on the board document, so a refused edit changes nothing. A deleted task whose column was removed stays in the trash and is restored into the first column |
| A save of the column list carries the `columnsVersion` it was built on, and a rename is its own request | Every change to the columns increments the counter in the same update. A save applies only while the board still has the version the client read, as a condition in the filter of the write itself, and otherwise answers 409 with `COLUMNS_STALE`, so a second tab cannot drop a column another session added. The rename in a column header is `PATCH /boards/:id/columns/:columnId`, which changes one name and never resends the list |
| A task is never left in a column the board no longer has, with no transaction needed | A task and the board are two documents, so a write cannot be conditional on the column still existing. Each side looks again after its own write: creating, moving, editing and restoring a task check that its column is still there, and removing a column looks for tasks still naming it, and either moves such a task to the foot of the first column. Whichever write lands second finds the other in place |
| A task's `order` is a fractional index key | Keys sort lexicographically, so moving a card writes one document. The client sends the two neighbours it dropped between, never a key, and a neighbour that has moved answers 409 |
| `deletedAt` on boards and tasks | A soft delete: every read treats the document as missing and a restore brings back exactly what was there, within the retention window |
| Names are stored in lowercase and capitalized when presented | `User.toJSON` capitalizes them. Queries read through `lean()` skip that transform and return the stored form |

</details>

### Soft delete, restore and purge

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8", "edgeLabelBackground": "#ffffff"}}}%%
flowchart LR
  Live["live<br/>deletedAt null"] -->|DELETE| Marked["marked<br/>deletedAt is a date"]
  Marked -->|"restore, inside BOARD_RETENTION_MS"| Live
  Marked -->|"job, past BOARD_RETENTION_MS"| Gone["removed for good<br/>a board with its tasks, in a transaction"]
  classDef green fill:#cff3d5,stroke:#195c2e,color:#195c2e
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  classDef coral fill:#ffdcce,stroke:#7a3621,color:#7a3621
  class Live green
  class Marked sand
  class Gone coral
```

The purge job runs once at start and then every `BOARD_PURGE_INTERVAL_MS`. A restore past the retention window answers 404 whether or not the job has reached the document yet, so the window never stretches by an interval.

## Frontend

All of it lives in `front/src`, a React 19 single page application. Server state is TanStack Query with `refetchOnWindowFocus`, a 30 second `staleTime` and no retries, so a window nobody touches never fetches.

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Segoe UI, Helvetica, Arial, sans-serif", "primaryColor": "#cbeeff", "primaryBorderColor": "#00557e", "primaryTextColor": "#00557e", "lineColor": "#46b1e3", "textColor": "#2f7fa8"}}}%%
graph TD
  Main[main.tsx] --> App["App.tsx<br/>providers and routes"]
  App --> Context["context<br/>AuthProvider, AuthToastProvider"]
  App --> AppDir["app<br/>layouts, ErrorBoundary, queryClient"]
  App --> Pages["pages<br/>Auth, ResetPassword, Home, Board, Profile, NotFound"]
  Pages --> Features["features<br/>auth, board, boards, breeze, colors,<br/>session, tasks, users"]
  Features --> Shared["shared<br/>ui primitives, hooks, lib"]
  Pages --> Services["services<br/>axios client and one module per resource"]
  Features --> Services
  Services --> Models["models<br/>TypeScript types of the API"]
  classDef sky fill:#cbeeff,stroke:#00557e,color:#00557e
  classDef teal fill:#bef4f1,stroke:#005d5b,color:#005d5b
  classDef lavender fill:#ede0ff,stroke:#563e7b,color:#563e7b
  classDef sand fill:#fbe5bf,stroke:#684600,color:#684600
  class Main,App lavender
  class Context,AppDir,Pages sky
  class Features,Shared teal
  class Services,Models sand
```

| Folder | Holds |
|---|---|
| `app` | `AppShell` and `AuthLayout`, the error boundary and the `QueryClient` |
| `context` | The authentication state, and the toasts tied to it, which are discarded when the person signs out or changes |
| `pages` | One component per route: `/login`, `/register`, `/reset-password`, `/`, `/board/:boardId`, `/profile`, and the not found page |
| `features` | One folder per feature, with its components, hooks and queries. `session` holds the keep-alive and the expiry warning, `breeze` the ambient motion setting, `tasks` the drag and drop geometry |
| `shared/ui` | The primitive components: `Button`, `Modal`, `Menu`, `Field`, `Avatar`, `SwatchPicker`, `ToastProvider`, `WindLayer` and the design token modules |
| `services` | `api.service.ts` is the axios instance that attaches the bearer token and stores each renewed `X-Auth-Token`; the other modules call one resource each |
| `components`, `hooks`, `utils` | What sits outside the feature folders: `Column`, `TaskCard`, the legal document modal and hooks, and the authentication helper |

Any 401 clears the stored session and redirects to the sign in page. The production build is `tsc -b && vite build`, and it is also the type check. `VITE_API_URL` and `VITE_USE_STRICT_MODE` are the only variables the application reads, and Vite inlines them at build time.

---

[Back to the README](../README.md) · Next: [Environment](ENVIRONMENT.md)
