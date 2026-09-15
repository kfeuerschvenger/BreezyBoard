# BreezyBoard revival plan

Status: draft for review. Date: 2026-09-08. Scope: the codebase as it exists at commit `9931e8d`.

## 1. Executive summary

BreezyBoard is a Kanban board application with a Node 22 plus Express 5 plus Mongoose backend and a React 19 plus TypeScript plus Vite 7 plus Tailwind 4 frontend. Roughly 6,900 lines across 103 tracked files. The idea, the data model and the visual shell are all there, and the seed data, the templates and the color palettes are genuinely useful groundwork.

The verdict from running it: the application does not work. A user cannot create a task, and no task can be moved between columns, which between them are the entire product. Separately, any authenticated user can read, modify and delete any task belonging to any other user, which was confirmed with a live exploit against the running stack, not inferred from reading code.

That reframes the work. The first milestone is not refactoring, documentation or design. It is making the product do the one thing it exists to do, then closing the authorization holes, then building the test harness that stops both classes of defect from coming back. Everything else follows.

Two defects were confirmed by driving the real application in a browser, and each of them independently makes the product unusable:

| ID | Defect | Effect |
|---|---|---|
| P0-1 | The Save button in the task drawer can never be enabled | Tasks cannot be created or edited at all |
| P0-3 | The drag handle overrides the drag-and-drop library's own event handlers | Drag and drop is dead for mouse and keyboard |

A third, P0-2, was reported in the first draft of this document and has been **withdrawn on verification**. See section 5.1 for what was wrong with it and what real defect remains underneath.

And one security defect of the same weight:

| ID | Defect | Effect |
|---|---|---|
| P1-1 | Every single-task route is missing its authorization check | Any logged-in user can read, edit and delete any task in the database |

## 2. How this assessment was produced

The findings below are not a code read alone. The sequence was: read every backend and frontend file, containerize the stack, boot it, seed it, then drive the running application with Playwright and probe the live API directly.

That order matters in both directions. Both P0 defects were invisible to static reading: two independent full-file audits of the frontend and backend missed that the task form can never be submitted, and it only surfaced when a browser filled in every field and the button stayed grey. But driving the application also produced one false positive, the withdrawn P0-2, because the reproduction went around the blocked UI path instead of through it and then attributed the result to the code. A runtime finding is only as good as the path used to reach it.

The Docker setup added in this pass is described in section 8 and is already working. The reproduction commands for every P0 and P1 finding are in appendix A.

## 3. Current architecture

```mermaid
graph TB
  subgraph Browser
    UI[React 19 SPA<br/>Vite 7, Tailwind 4]
    LS[(localStorage<br/>token + user)]
  end

  subgraph API["Express 5 API"]
    MW[authenticate<br/>authorizeBoard]
    R[7 route modules]
    C[7 controllers]
    S[5 services]
    M[5 Mongoose models]
  end

  DB[(MongoDB<br/>boards-db)]
  FS[/uploads/avatars<br/>local disk/]

  UI -->|axios, Bearer token| R
  UI <--> LS
  R --> MW
  MW --> C
  C --> S
  S --> M
  M --> DB
  C -.->|multer| FS
```

The layering is sound in principle: routes, controllers, services, models, with a shared error middleware and a response envelope. Two resources break the pattern by querying models straight from the controller (`color.controller.js`, `template.controller.js`), and one cross-cutting concern is implemented twice, once as middleware for boards and once inline in the service for users.

The data model is five collections: `User`, `Board`, `Task`, `BoardTemplate`, `ColorPalette`. A board references a template, which owns the column definitions. A task references a board and carries a free-text `status` that is meant to name the column it sits in. That last relationship is the seam where P0-2 lives.

```mermaid
erDiagram
  User ||--o{ Board : creates
  User }o--o{ Board : "member of"
  Board }o--|| BoardTemplate : uses
  BoardTemplate ||--|{ Column : defines
  Board ||--o{ Task : contains
  Task }o--o| User : "owned by"
  Task }o--|| ColorPalette : "colored by"
  Column }o--|| ColorPalette : "colored by"
```

## 4. What works today and what does not

Verified by driving the running application.

Working: registration and login, JWT issue and validation, session restore on reload, the 401 interceptor and forced logout, board creation with template and color, the board list dashboard, board statistics counts, the profile page, the legal document modals, the user search endpoint, and the auth page layout.

Broken or missing: the production build (see P5-9), task creation, task editing, drag and drop, cross-column keyboard movement, average progress on the dashboard (always zero by construction), board editing and deletion from the UI, member management from the board view, a 404 page, password recovery (the link points back to `/login`), and any form of persisted task ordering.

## 5. Findings

Severity is by consequence, not by effort. P0 means the product does not function. P1 means data belonging to one user is exposed to another. P2 means data can be silently corrupted or lost. P3 and below are quality, and they are real, but they are not what should be fixed first.

### 5.1 P0, the product does not function

**P0-1. The task drawer can never be submitted.** File `front/src/components/TaskDrawer.tsx:533`.

`handleOwnerChange` clears the owner error by assigning `undefined` to the key rather than removing it:

```ts
setErrors(prev => ({ ...prev, owner: undefined }));
```

`isFormValid()` at line 445 gates the submit button on `Object.keys(errors).length === 0`. `Object.keys({ owner: undefined })` has length 1, so the moment a user picks an owner, which is a required field, the button locks permanently. Confirmed in the browser: title, description, owner and color all populated, submit still disabled. Task creation and task editing are both impossible through the UI.

The fix is one line, but the class of bug is the point: a hand-rolled validation object used as a boolean gate. See P3-1.

**P0-2. Withdrawn. The board renders tasks correctly.**

The first draft of this document claimed that tasks never render, on the basis that `Board.tsx:300` filters by `task.status === column.id` where `column.id` is a Mongo ObjectId. That claim was wrong, and the error was in the reproduction rather than in the code.

Because P0-1 blocks the only UI path to creating a task, the tasks used for that test were created through the API with `status` set to a column title. The application never writes that value. Every writer in the frontend is consistent on storing the column `_id`: `handleAddTask` sets `status: defaultColumn.id` at `Board.tsx:239`, `handleDragEnd` writes the target column id at `Board.tsx:113-127`, and `Board.tsx:300` reads the same thing back. The mismatch was introduced by the test, then attributed to the code.

Verified after fixing P0-1: a task created through the drawer is stored with `status` holding the column `_id` and appears in the correct column immediately, with no page errors. The board is fine.

What remains underneath is real but smaller, and is filed as P2-9.

**P0-3. Drag and drop is dead.** File `front/src/components/TaskCard.tsx:161-172`.

The drag handle spreads dnd-kit's listeners and then declares its own handlers after the spread:

```tsx
<div
  {...listeners}
  {...attributes}
  onKeyDown={handleDragHandleKeyDown}
  onPointerDown={e => e.stopPropagation()}
>
```

In JSX the last duplicate prop wins, so `onPointerDown`, which is exactly how dnd-kit's `PointerSensor` starts a drag, is replaced by a handler that does nothing but stop propagation. The replacement `onKeyDown` then tries to fake a pointer event by calling `listeners.onPointerDown({})` with an empty object.

Confirmed live. Dragging from the handle does nothing. Dragging from the card body does nothing, because the listeners live only on the handle. No API call is issued. The keyboard path throws `TypeError: Cannot read properties of undefined (reading 'dndKit')`, because dnd-kit reads `event.nativeEvent.dndKit` on an object that has no such property.

Note that this error is swallowed. There is no error boundary anywhere in the application, and `onDragEnd` is never awaited, so the exception surfaces only in the browser console.

**P0-4. Cross-column keyboard movement is not implemented.** File `front/src/pages/Board.tsx:43-48, 289-294`.

Independent of P0-3. A `KeyboardSensor` is registered, but `sortableKeyboardCoordinates` only reorders within a single `SortableContext`. Moving a card between columns needs custom coordinate logic that does not exist. Even once P0-3 is fixed, a keyboard-only user will not be able to perform the application's primary action.

### 5.2 P1, security

**P1-1. Every single-task route is missing its authorization check.** File `back/src/routes/task.routes.js:16-23`.

`GET`, `PUT`, `DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/move`, and both checklist item routes apply `authenticate` but never `authorizeBoard`. They cannot apply it as written, because the middleware resolves a board from a `:boardId` param and these routes carry a task id.

Confirmed with a live exploit against the running stack. A second seeded user who is not a member of the board was correctly refused at the board level, and then read and overwrote that board's task anyway:

```
GET  /api/boards/:id   -> 403   (authorization works here)
GET  /api/tasks/:id    -> 200   (full task document returned)
PUT  /api/tasks/:id    -> 200   (title overwritten)
```

Any authenticated account can enumerate and destroy every task in the database. The fix is a task-scoped authorization middleware that resolves the board from the task, applied to all six routes.

**P1-2. Board takeover through mass assignment.** Files `back/src/services/board.service.js:52-73` and `back/src/middleware/auth.middleware.js:44-65`.

`updateBoard` passes `req.body` straight into `findByIdAndUpdate` with no field whitelist, and `authorizeBoard` treats the creator and any ordinary member identically. Any member can therefore `PUT /api/boards/:id` with `{ "members": ["<their own id>"], "createdBy": "<their own id>" }` and remove the real owner and every other member. The same gap lets any member permanently delete the board and cascade-delete its tasks.

Two fixes are needed: a field whitelist on every update path, and an owner-versus-member distinction in the authorization middleware.

**P1-3. `updateTask` allows relocating a task to another board.** File `back/src/services/task.service.js:37-50`.

Same mass assignment shape. `createTask` validates that the supplied owner is a board member, `updateTask` validates nothing and accepts a new `boardId`. Combined with P1-1, an attacker can move any task in the system into a board they control.

**P1-4. `updateOrders` is not scoped per task.** File `back/src/services/task.service.js:72-81`.

The route authorizes the `:boardId` in the URL, then bulk-writes whatever task ids appear in the request body with no filter tying them to that board. A legitimate member of one board can renumber tasks in any other.

**P1-5. The JWT secret has a hardcoded fallback.** File `back/src/config/env.js:9`.

`JWT_SECRET: process.env.JWT_SECRET || 'secret-key'`. If the variable is ever unset in a real deployment, the application silently signs and verifies tokens with a publicly known string. There is no fail-fast startup validation for any required secret.

**P1-6. NoSQL injection surface on login.** File `back/src/services/auth.service.js:11, 38`.

`email` and `password` go from `req.body` into `User.findOne({ email })` with no type check. A body of `{"email": {"$ne": null}, "password": "x"}` turns the lookup into "match any user". The root cause is that no request body anywhere in the application is schema-validated.

**P1-7. `VITE_JWT` in the frontend environment example.** File `front/.env_example:3`.

`VITE_JWT="4vr4k3hd4br4"` is byte for byte the backend's `JWT_SECRET` example value. It has zero consumers in the frontend source today, which is the only reason this is not already critical. Any variable prefixed `VITE_` is inlined into the built bundle and readable by anyone, and the name actively invites a future developer to wire it into a client-side check. Delete it now.

**P1-8. Missing baseline hardening.** File `back/src/app.js`.

No `helmet`, so no security headers of any kind. `cors()` with no options, so every origin is allowed. No rate limiting on `/api/auth/login`, so credential stuffing is unbounded. No Content-Security-Policy on the frontend either, which matters because the JWT lives in `localStorage`.

**P1-9. Lower-severity items.** Account enumeration on registration (`auth.service.js:12`), JWT verification without a pinned algorithm (`auth.middleware.js:18`), member ids added without checking the users exist (`board.service.js:103`), upload type trusted from the client-supplied mime header rather than file magic bytes (`upload.middleware.js:29`), user search passing the raw query into `$regex` (`user.service.js:31`), and any authenticated user being able to read any user profile or any board's member list (`user.service.js:46-63`).

### 5.3 P2, data integrity and correctness

**P2-1. `status` is unconstrained free text.** File `back/src/models/Task.js:21`.

The direct cause of P0-2 is a schema that permits any string in a field that must name one of a fixed set of columns. `priority` right next to it is a proper enum. Fixing P0-2 without constraining this field leaves the door open for the same class of bug.

**P2-2. Board deletion is not transactional.** File `back/src/services/board.service.js:75-86`.

`findByIdAndDelete` then `Task.deleteMany` as two independent operations. If the second fails, tasks are orphaned against a board that no longer exists and nothing ever reclaims them. Note the prerequisite: the default connection string is a standalone MongoDB instance, which does not support multi-document transactions. A replica set is required first, including in the Docker setup.

Fixed in Phase 4. Both writes now run inside one `session.withTransaction`, and the replica set landed in the same change: development, production and the in-memory test harness all run a single node set. The regression test injects a failure into the cascade and asserts the board survives; it was checked against the previous code first, where the board is already gone and the task outlives it. `e2e/verify/integrity.mjs` covers the other half, that a real deployment can run a transaction at all, which no unit test can observe.

**P2-3. Task ordering is stored and then ignored.** File `back/src/services/task.service.js:83-89`.

`getTasksByBoard` sorts by `createdAt` descending. The `order` field that the whole drag-and-drop feature writes is never read back. Reordering has no persistent effect even once P0-3 is fixed.

Fixed in Phase 4. The query sorts by `order` ascending with `createdAt` descending kept as the tiebreaker, so tasks that genuinely share an order keep the arrangement they had. The board page had been re-sorting the array itself after fetching, which hid the bug there and left it visible everywhere else, including in any paginated request, where the page boundary was being cut on a different ordering than the one the caller saw.

Worth recording how close one of the regression tests came to being worthless. The first version reordered two tasks and asserted the result, and it passed against the broken sort, because the arrangement it expected happened to be the one creation order already produced. Both tests now expect an arrangement that creation order cannot produce, and both fail against the previous code. The same trap is written into `e2e/verify/integrity.mjs`, where the fixture creates its tasks with deliberately reversed orders for exactly this reason.

**P2-4. Average progress is always zero.** Files `back/src/services/dashboard.service.js:6-8` and `back/src/models/Board.js:57-71`.

Two independent bugs stacked. The dashboard query uses `.lean()`, which strips virtuals, so `board.progress` is `undefined` at the point it is summed. And the virtual itself is declared as an async getter, which Mongoose does not support: it would return a pending Promise rather than a number. The `toJSON` transform never copies it either. This is dead code that should be replaced with an aggregation.

**P2-5. `TaskService.move` is called with a missing required argument.** Files `front/src/services/task.service.ts:29` and `front/src/pages/Board.tsx:254`.

`move(taskId, newStatus, newOrder)` declares three required parameters and is called with two, so the backend receives `order: undefined` whenever a task auto-moves to done on checklist completion.

**P2-6a. Drag activation is timing-sensitive.** File `front/src/pages/Board.tsx:43-48`.

Observed while building the end-to-end suite rather than by reading the code. The `PointerSensor` is registered with no activation constraint, so it activates on the first pointer move after the press, and the card simultaneously runs a framer-motion tap animation that transforms it under the cursor. Adding video and trace recording to the test run, which slows the renderer by a few milliseconds, was enough to make the drag intermittently fail to start.

A human pressing and moving generates many more intermediate events than an automated pointer, so this is not a defect a user would hit often. It does mean the interaction has very little margin, and a slow device or a heavy board is exactly where that margin disappears. Adding a distance activation constraint was tried and made the automated case worse, so the fix is not obvious and should be done with the drag rewrite in Phase 4 rather than guessed at now.

**P2-6. Drag-and-drop has no concurrency control.** File `front/src/pages/Board.tsx:92-183`.

The optimistic state computation sits outside the try block, no service accepts an `AbortController`, and nothing prevents a second drag starting while the first request is in flight. A late failure from an earlier drag can roll back over a newer already-applied update. This becomes reachable the moment P0-3 is fixed, so it should be fixed in the same pass.

**P2-7. `SALT` was never coerced to a number.** File `back/src/config/env.js:11`. Fixed during this pass.

`process.env.SALT || 10` yields the string `"10"`, and `bcrypt.genSalt` throws `illegal arguments: string`. Registration and the user seed both crashed the first time the stack ran in Docker with `SALT` set. Fixed with `Number(...)`, but the general problem stands: no environment variable anywhere is validated or typed. See P5-2.

**P2-9. `status` is an unvalidated reference, and two comparisons against it can never match.** Files `back/src/models/Task.js:21-24`, `back/src/models/Board.js:63`, `front/src/pages/Board.tsx:216`.

This is what remains of the withdrawn P0-2, and it is a robustness problem rather than a broken feature.

`status` is declared as a bare required `String` with no enum and no reference. It holds the `_id` of a column subdocument inside the board's `BoardTemplate`. The application always writes a valid one, but nothing enforces it: a task created through the API with any other string is accepted by the server and then renders in no column at all, invisible in the UI while still counting in every total. That is exactly how the false P0-2 was produced, which makes it a demonstrated defect rather than a theoretical one.

Fixed in Phase 4, in two layers, because neither layer can do the whole job. The model now rejects anything that is not ObjectId-shaped, which closes the demonstrated case of a task filed under `todo`. The service then checks that the id names a column of this particular board, which is the half a schema cannot express: the valid set is different for every board and lives in another collection. A well-formed id belonging to a different board is the failure with real consequences, and it is now refused on create, on update and on move.

The type stays `String` rather than becoming `ObjectId` on purpose. It points at a subdocument, not a collection, so `ref` is not available and `ObjectId` would add nothing beyond the shape check, while making every task document already stored unreadable until migrated. A constraint that requires a migration to buy nothing is not worth the migration.

One consequence worth recording, because it changed two existing tests. Request validation runs before the authorization middleware, so an assertion that an outsider gets 403 only means something if the payload is otherwise legitimate. Both the tripwire in `back/test/security.test.js` and the replay in `e2e/verify/authorization.mjs` were sending a status literal that is now malformed, and would have started passing for the wrong reason: 400 instead of 403, with the authorization check never reached. They now send a real column id.

Two comparisons then treat the same field as if it held a title. `back/src/models/Board.js:63` filters `task.status === 'done'`, and `front/src/pages/Board.tsx:216` guards on `result.status !== 'done'`. Neither literal can ever equal an ObjectId. The backend one contributes to the always-zero progress in P2-4, and the frontend one makes the guard always true, so completing a checklist re-moves a task that is already in the last column.

There is also a domain problem worth recording, though not worth fixing in Phase 1: columns belong to `BoardTemplate`, which is shared across boards. Two boards created from the same template share the same column ids, so no board can rename, add or remove a column without affecting every other board using that template. Per-board columns are a schema change, and the right time to decide it is alongside the workspace question in section 11.2.

Decided in section 11.4 and scheduled as Phase 4b: columns are copied onto the board at creation, so the template becomes a mould rather than a live reference.

**P2-10. The task drawer discarded what the user typed when the colors arrived.** File `front/src/components/TaskDrawer.tsx:360-403`. Found while writing the component tests, fixed in the same pass.

The effect that resets the form listed `taskColors` among its dependencies. That array starts empty and is replaced once the colors request resolves, so the effect ran a second time after mount and rebuilt the entire `formData` object from `task`. Anything typed before the request came back was overwritten with the values from the task, which for a new task means empty strings.

On a fast local connection the window is a few dozen milliseconds and nobody notices. On a slow one it is a user losing a sentence they had already written. It also reproduced reliably enough that the first version of the component tests had to work around it with an explicit wait, which is how it surfaced.

The reset now keys on the task alone and reads the colors through a ref, and a second effect patches only the colour field once the colors land, leaving a colour the user picked by hand untouched. The regression test was verified against the old code first: it fails there and passes against the fix.

This is the same class of defect as the withdrawn P0-2 and as P0-1: state derived from an async value, rebuilt wholesale instead of patched. The React Hook Form migration in Phase 5a removes the pattern rather than the instance.

**P2-8. Correctness items in the frontend.** Infinite loading spinner when `boardId` is falsy (`Board.tsx:41, 51`), no error state at all on the board page so a failed fetch is indistinguishable from an empty board (`Board.tsx:77-81`), silent save failures that log to console and change nothing in the UI (`TaskDrawer.tsx:480`, `CreateBoardModal.tsx:61`), a `key` derived from `Date.now()` that changes every render (`BoardDashboard.tsx:331`), and missing unmount guards on the board fetch.

### 5.4 P3, architecture and code quality

**P3-1. Three validation architectures in one application.** React Hook Form with Zod in `Profile.tsx` and `RegisterForm.tsx`, hand-rolled state objects in `Login.tsx` and `TaskDrawer.tsx`, and bare HTML5 `required` in `CreateBoardModal.tsx`. P0-1 is a direct consequence of the hand-rolled one. Zod is already a dependency. Standardize on React Hook Form plus Zod everywhere, and share the schemas with the backend contract.

**P3-2. No request validation layer on the backend at all.** Every controller reads `req.body` and `req.params` raw. This is the shared root cause of P1-2, P1-3, P1-6 and P2-1. A validation middleware backed by Zod, with one schema per route, closes all of them at once and gives the frontend a contract to mirror.

**P3-3. Components carrying far too much.** `TaskDrawer.tsx` at 729 lines holds two fetch effects, a nested autocomplete component with its own debounce and fetching, hand-rolled validation, payload reshaping and a nested `DndContext`. `BoardDashboard.tsx` at 506 lines, `Profile.tsx` at 411 and `Board.tsx` at 327 follow the same pattern. There is no container and presentational separation anywhere, and exactly one custom hook exists in the whole codebase (`useTextFile`).

**P3-4. The modal shell is reimplemented four times.** `AddMemberModal`, `CreateBoardModal`, `LegalModal` and `SuccessModal` each build their own backdrop, panel, animation and escape handler from scratch. The escape listener is duplicated verbatim three times, and `CreateBoardModal` and `TaskDrawer` simply forgot theirs, which is why escape does not close the task drawer. A single shared `Modal` primitive removes the duplication and fixes the accessibility gaps in one place.

**P3-5. No shared data-fetching abstraction.** Every page reimplements loading, error and unmount-guard state by hand, inconsistently, which is why some pages have error states and others do not. Either a small `useAsync` hook or a proper server-state library is the fix.

**P3-6. Duplication in the small.** `response.data.data` unwrapped at roughly eighteen call sites with no helper, the avatar-with-initials fallback written three times when `SimpleUserAvatar` already exists for it, priority color maps duplicated between `TaskCard` and `TaskDrawer`, two different hardcoded default colors, button styles copy-pasted across five files with no `Button` component, and `connectDB` written three times in the backend.

**P3-7. Missing indexes.** No index on `Task.boardId`, `Board.createdBy` or `Board.members`, all of which are the primary filter in every query that touches them. Cheap to add, and the right time is before there is data volume.

**P3-8. TypeScript discipline.** Eleven `any` casts, six of which cast a field whose correct union type is already declared in the models. Four non-null assertions, two of them on a `boardId` that the same file guards properly elsewhere. `noUncheckedIndexedAccess` is absent from the tsconfig. `typescript-eslint` runs on the non-type-checked preset, so `no-floating-promises` and `no-explicit-any` are both inactive.

**P3-9. Backend layering inconsistencies.** `color.controller.js` and `template.controller.js` skip the service layer. `logger.js` exists and is imported by nothing, while every actual log call uses `console` directly. Authorization lives in middleware for boards and inline in the service for users.

### 5.5 P4, interface, experience and accessibility

The interface is competent and completely generic. It reads as default Tailwind: `blue-600` primary, `gray-200` borders, `rounded-lg` everywhere, uniform shadows, no typographic hierarchy beyond weight, and no visual identity that would distinguish it from any other tutorial Kanban board. There is nothing wrong with any individual screen. There is also nothing memorable in any of them.

**P4-1. The typography system does not exist.** `font-heading` and `font-body` are applied across eight files and roughly thirty-five call sites. There is no `@theme` block, no `tailwind.config` file, and `index.css` is two lines. Under Tailwind 4 an undefined utility is a silent no-op, so every one of those classes does nothing and the entire application renders in the default sans stack. Inter is imported and then never actually bound to anything.

**P4-2. The board is not a board.** Columns are laid out as `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, so they wrap into rows rather than scrolling horizontally, which stops being a Kanban board at five columns. Each column is pinned to a 600px minimum height with no internal scroll, so on the screenshot from the running application three empty columns occupy the full viewport height while holding nothing, and a busy column will instead grow the page indefinitely.

**P4-3. Accessibility gaps, ranked.** Drag and drop is unusable by keyboard even after P0-3 (see P0-4), and the droppable columns carry no role or label so a screen reader is told nothing. `FormInput.tsx:17` renders a label with no `htmlFor` and threads no `id`, which makes every field in the registration flow an unassociated label and input pair. The owner suggestions in `TaskDrawer` are plain divs with click handlers, unreachable by keyboard, while the near-identical list in `AddMemberModal` does it correctly. The entire priority badge on a task card is `aria-hidden`, hiding real information rather than a decorative icon. No modal traps focus, none restore focus to the trigger on close, `CreateBoardModal` has no dialog role at all, and `SuccessModal` auto-dismisses after two seconds with no way to pause it. `eslint-plugin-jsx-a11y` is not installed, so none of this is caught automatically.

**P4-4. Responsive coverage is thin.** Responsive prefixes appear in four files. There are none in `Column`, `TaskCard`, `TaskDrawer`, `AddMemberModal`, `PageHeader`, `LegalModal`, `SuccessModal`, `RegisterForm` or `FormInput`. The registration name row is a fixed two-column grid with no mobile fallback.

**P4-5. Missing feedback and states.** An empty column renders as blank whitespace with no message. A failed save looks exactly like an idle form. The submit button in the task drawer is disabled with no indication of which field is missing, which is the anti-pattern that made P0-1 invisible for a year. Contrast risk on `text-gray-400` icons and `gray-500` on `gray-200` avatar initials, both below the 4.5 to 1 minimum.

**P4-6. Product gaps visible from the UI.** No 404 page, unknown routes silently redirect to the dashboard. The forgot-password link points at `/login`. There is no way to edit or delete a board from the board view, and no member management there either. The footer uses emoji as decoration.

### 5.6 P5, infrastructure, testing and documentation

**P5-1. There are no tests.** No test runner, no test script, no test file, in either package. Given that three separate P0 defects survived a year in this codebase, this is the single highest-leverage gap in the list. One integration test that creates a task through the API and asserts it renders would have caught P0-1 and P0-2 together.

**P5-2. No environment validation.** The backend reads five variables with silent fallbacks including the JWT secret. The frontend reads two with a `|| ''` fallback. Zod is a dependency on both sides and is used for neither. P2-7 was caused by exactly this.

**P5-3. No linting on the backend.** No ESLint config and no lint script. Prettier is configured but is not even listed as a dependency in the frontend, so `npm run format` fails unless it happens to be installed globally.

**P5-4. No error boundary in the frontend.** Any uncaught render exception blanks the entire application with no fallback.

**P5-5. No code splitting and a defeated tree shake.** No `lazy` or `Suspense` anywhere, so every page, modal and drawer ships in one eager bundle. `lucide-react` is imported as `import * as Icons` in two files and then indexed dynamically, which makes it impossible for the bundler to drop unused icons.

**P5-6. Operational gaps.** No graceful shutdown handler. A health check that reports healthy with a dead database connection. No request logging, no request ids, no structured logging. No API documentation of any kind. No CI pipeline.

**P5-7. Documentation.** The root `README.MD` contains the words "Work in progress...". The frontend README is the untouched Vite template. Nothing documents the environment variables, the seeds, the routes or how to run any of it.

**P5-9. The frontend production build does not compile.** `npm run build` runs `tsc -b && vite build` and dies at the first step with 12 type errors across `CreateBoardModal.tsx`, `BoardDashboard.tsx`, `Board.tsx`, `TaskDrawer.tsx` and `RegisterForm.tsx`.

The consequence is larger than a failing command. It means no production bundle has ever been produced from this code, and it means the type checker has been reporting real problems that nobody has seen, because the dev server transpiles without checking types. Several of the errors are latent bugs rather than annotation noise: `BoardDashboard.tsx:345` reads `board.lastUpdated`, a field that does not exist on the model or in the API response, and `TaskDrawer.tsx:527` dereferences a possibly-null `over` inside a drag handler.

This also blocks the `prod` target of the frontend Dockerfile added in section 8, which runs the same command.

Related: 10 or more source files import from `framer-motion`, which is not a declared dependency. Only `motion` is in `package.json`, and the import resolves transitively. It works today by accident.

**P5-8. Seeds are destructive with no guard.** Both seed scripts call `deleteMany()` with no filter and then insert. `users.seed.js` hardcodes six accounts with weak passwords committed in source. Nothing prevents them from being pointed at a populated database.

## 6. Remediation roadmap

### Status

Phase 0 and Phase 1 are complete, and Phase 2 is in progress. Everything below this block still describes the plan as designed; this block records what has actually landed on the `fix/phase-1-foundations` branch.

| Phase | State | Evidence |
|---|---|---|
| 0, containers | Done | Dev and prod compose files, multi-stage Dockerfiles, uploads on a named volume |
| 1, make it work | Done | Both P0 defects fixed and verified in a browser. P0-2 was withdrawn on verification, see section 5.1 |
| 1, unplanned | Done | The production build never compiled, see P5-9. Fixed, `npm run build` now exits 0 |
| 2, backend harness | Done | Vitest, Supertest and mongodb-memory-server. 20 behavior tests plus 11 security tripwires, `npm test` exits 0 |
| 2, end to end | Done | Playwright suite covering the core loop and keyboard reachability of the drag handle |
| 2, frontend units | Done | Vitest and Testing Library, 13 tests over the task drawer, the board page and the auth guard |
| 2, overall | Done | Backend, frontend and end to end suites all green. Phase 3 closes when the 11 tripwires are flipped |
| 3, authorization | Done | Task and board routes role-gated, original exploit replayed and fully refused, 9 tripwires flipped |
| 3, validation | Done | Zod layer replacing every request value with the parsed output, all 11 tripwires flipped |
| 3, hardening | Done | Fail-fast secrets, CORS allowlist, helmet, rate limits, pinned JWT algorithm, escaped search, upload magic bytes, CSP |
| 3, sliding session | Done | Two clocks, real revocation via tokenVersion, warning toast, draft persistence, verified live |
| 3, API surface | Done | Dual mount at /api/v1 and /api, opt-in pagination, error code enum, pino with request ids |
| 3, overall | **Done** | Every P1 finding closed, all 11 tripwires flipped, verified live and in production |
| 4, transactional cascade | Done | Single node replica set in development and production, board delete and its task cascade atomic (P2-2) |
| 4, status constraint | Done | status refused unless it is ObjectId-shaped and names a column of that board (P2-9) |
| 4, order is read back | Done | Tasks list in stored order and a reorder survives a reload (P2-3) |
| 4, paused | Paused | Every open decision in section 11.2 is now resolved, see section 11.4. The schema layer goes first |
| 4b, schema layer | Next | Workspaces and board-owned columns. Revises the status validation and precedes the indexes |
| 4, remainder | Blocked on 4b | Fractional indexing, progress aggregation, drag concurrency, indexes |
| 5 onward | Not started | |

Two things were pulled forward into Phase 1 because they blocked it. The `app.js` split into an importable app plus a `server.js` that owns the connection, the listen and the shutdown handlers was a prerequisite for testing anything, and it closes the missing graceful shutdown from P5-6. The first three shared primitives, `Field`, `Modal` and `Button`, were built early because they are additive and because the React Hook Form migration in `TaskDrawer` lands on them.

The security tripwires deserve a note, because they change how Phase 3 will feel. Each one asserts the correct 403 and is wrapped in Vitest's `test.fails`, so the suite is green while the hole exists and turns red the moment it closes. They are not skipped tests waiting to be remembered; they are alarms that go off when the work is done, and Phase 3 is finished when all eleven have been flipped to ordinary tests.

Phases are ordered by dependency, not by preference. Each phase should land as its own reviewable pull request, or as a small chain of them where the diff would run past roughly 400 lines.

```mermaid
graph LR
  P0[Phase 0<br/>Docker<br/>DONE] --> P1[Phase 1<br/>Make it work]
  P1 --> P2[Phase 2<br/>Test harness]
  P2 --> P3[Phase 3<br/>Security]
  P2 --> P4[Phase 4<br/>Data integrity]
  P3 --> P5[Phase 5<br/>Architecture]
  P4 --> P5
  P5 --> P6[Phase 6<br/>Design and a11y]
  P5 --> P7[Phase 7<br/>Docs and CI]
```

Phase 2 sits before the security and integrity work deliberately. Those phases change authorization and data shape, which is exactly the kind of change that needs a safety net underneath it.

### Phase 0. Reproducible environment. Complete.

Delivered in this pass and described in section 8. The one item that was left for Phase 4, converting the MongoDB service to a single node replica set, has since landed alongside the transactional board delete that needed it.

### Phase 1. Make the product work. Size: S.

The whole phase is small in lines and total in impact. Nothing else is worth doing until it lands.

| Task | Files | Acceptance criteria |
|---|---|---|
| Fix the error-clearing bug | `TaskDrawer.tsx:533` | A task can be created and edited through the UI |
| Fix the two dead comparisons against the literal `'done'`, see P2-9 | `Board.tsx:216`, `back/src/models/Board.js:63` | Completing a checklist moves the task once, and only when it is not already in the last column |
| Remove the overriding handlers from the drag handle | `TaskCard.tsx:161-172` | A card can be dragged between columns with the mouse and the move persists across reload |
| Add an error boundary and surface save failures | new component, `TaskDrawer.tsx:480`, `CreateBoardModal.tsx:61` | A failed save shows the user a message |
| Add an error state and fix the infinite spinner on the board page | `Board.tsx:41, 51, 77-81` | A failed board fetch shows an error with a retry, never a permanent spinner |

Recommendation: replace the hand-rolled validation in `TaskDrawer` with React Hook Form and Zod in this phase rather than patching one line. The one-line fix restores the feature; the replacement removes the class of bug and is the first step of P3-1.

### Phase 2. Test harness. Size: M.

The goal is not coverage. It is a regression net under the two things that were broken, before touching authorization or data shape.

Backend: Vitest plus Supertest plus `mongodb-memory-server`. Integration tests over the real route stack for the auth flow, board CRUD, task CRUD, and one test per authorization boundary. Those authorization tests are written in this phase and are expected to fail, which is what Phase 3 fixes.

Frontend: Vitest plus Testing Library. Component tests for the task drawer submit path, the board rendering path, and the auth guard. One Playwright end-to-end test covering login, create board, create task, see it in a column, drag it to another column, reload and confirm it persisted. That single test covers all three P0 defects.

Acceptance: `npm test` runs green in both packages, the Playwright test passes against the Docker stack, and the authorization tests written against the not-yet-fixed backend fail for the documented reason.

### Phase 3. Security. Size: M.

Phase 3 does not fit in one reviewable change. The tasks below together run well past the 400-line budget, and a single diff touching authorization, validation, transport hardening and the session model at once is a diff nobody reviews carefully. It ships as five chained slices, each independently valuable and each verifiable on its own:

| Slice | Covers | State |
|---|---|---|
| 1, authorization | P1-1, P1-2, P1-4, H2, and the role-shaped middleware from section 11.2 | Done |
| 2, request validation | P1-3, P1-6, P3-2, L3 | Done |
| 3, hardening | P1-5, P1-7, P1-8, and the remaining P1-9 items | Done |
| 4, sliding session | All of section 9, backend and frontend | Done |
| 5, API surface | Versioning, pagination, error codes, request ids, structured logging | Done |

Slice 1 is complete. A note on the design choice, because it deviates from what section 11.2 literally asks for. The plan calls for a per-board role model, which read strictly means turning `Board.members` into subdocuments carrying a role. That is a schema migration whose blast radius reaches every board query and several frontend components, and it buys nothing today because there are only two roles in play.

What was built instead is the half that matters: the middleware is written in terms of a role, not a boolean. `requireBoardRole('owner')` and `requireTaskBoardRole('member')` are the route-level API, and `resolveBoardRole(board, userId)` derives owner from `createdBy` and member from the existing array. Adding a viewer or an admin later means one entry in the rank table and one change inside `resolveBoardRole`, with no route touched. The schema change becomes a separate, additive decision rather than a prerequisite.

The remaining slice content is unchanged:

| Task | Addresses |
|---|---|
| Add a task-scoped authorization middleware, apply it to all six single-task routes | P1-1 |
| Distinguish owner from member in `authorizeBoard`, restrict destructive operations to the owner | P1-2 |
| Add a Zod request-validation middleware, one schema per route, whitelist every update payload | P1-2, P1-3, P1-6, P3-2 |
| Scope `updateOrders` to tasks belonging to the authorized board | P1-4 |
| Fail fast at startup on missing secrets, remove the `secret-key` fallback, pin the JWT algorithm | P1-5, P1-9 |
| Delete `VITE_JWT` from the frontend environment example | P1-7 |
| Add `helmet`, an explicit CORS allowlist, rate limiting on the auth routes, and a CSP | P1-8 |
| Validate member ids exist, verify upload magic bytes, escape the user search term | P1-9 |
| Build the sliding session, the inactivity window and the absolute cap, per section 9 | Section 9 |
| Add the per-board role model rather than a boolean membership check, per section 11.2 | Section 11 |
| Add pagination, the `/api/v1` prefix and machine-readable error codes while every route is being touched | Section 11.2 |
| Add request ids and structured logging, pulled forward from Phase 7 | Section 11.3 |

Acceptance: every authorization test written in Phase 2 passes, the exploit in appendix A returns 403 at each step, and the session acceptance criteria in section 9.8 hold.

### Phase 4. Data integrity. Size: M.

Convert the MongoDB service to a single-node replica set, then wrap board deletion and its task cascade in a transaction. Constrain `status` at the schema level once Phase 1 has settled its representation. Read `order` back in `getTasksByBoard`. Replace the broken `progress` virtual with an aggregation and drop `.lean()` from the dashboard query, or compute progress entirely in the aggregation pipeline. Fix the missing `move` argument. Add an `AbortController` to the service layer and a concurrency guard around drag operations. Add the three missing indexes.

Acceptance: deleting a board leaves no orphaned tasks under an injected failure, dashboard progress reflects real completion, and task order survives a reload.

### Phase 5. Architecture. Size: L.

Order correction, see sections 10.1 and 12.7: this phase now opens with the design token layer and the accessible primitives, because refactoring components before they exist means refactoring them twice. Section 12 is the full component architecture, including the target structure, the primitive layer justified by duplication counts, and the per-file decomposition map. Phase 5a, the primitives and tokens, is additive and may start immediately in parallel with Phase 1. Phase 5c, the migration, waits for the Phase 2 harness.

Standardize on React Hook Form plus Zod across every form. Extract a shared `Modal` primitive and migrate all four modals plus the drawer onto it. Extract a data-fetching hook, or adopt a server-state library, and migrate every page onto it. Break `TaskDrawer`, `BoardDashboard`, `Profile` and `Board` into container and presentational pairs with the fetching and validation lifted into hooks. Extract `Button`, the response unwrapper, the priority map and the color constants. Consolidate the three `connectDB` copies and route `color` and `template` through the service layer. Wire up `logger` or delete it. Tighten the tsconfig and move `typescript-eslint` to the type-checked preset, then clear the resulting `any` casts.

This is the largest phase and the most divisible. It should be a chain of small pull requests, one concern each.

### Phase 6. Layout and product surface. Size: L.

The design token layer and the accessible primitives moved into Phase 5a and 5b, so what remains here is everything that operates above the component level.

Rebuild the board as a horizontally scrolling column set with a fixed column width, internal vertical scroll per column, and a real empty state, replacing the wrapping grid. Add the single-pointer alternative to dragging required by WCAG 2.5.7, which is the "Move to" menu described in section 10.3, and then the dnd-kit cross-column keyboard coordinates. Make the task drawer a bottom sheet below the medium breakpoint. Add responsive coverage to the nine components that have none, mobile-first. Add the missing 404 page, board editing and deletion from the board view with confirmation and undo, and either implement password recovery or remove the link.

The accessibility enforcement gate from section 10.2 should be wired at the start of Phase 5, not here, so that everything built from that point forward is checked as it lands.

### Phase 7. Documentation and CI. Size: M.

A real root `README.md` in ASCII per the formatting standard, a `README_es.md` with Mermaid, an architecture document, an environment variable reference, an OpenAPI specification generated from the Zod schemas written in Phase 3, and a contributing guide. Guard the seed scripts against running outside development. Add a CI pipeline running lint, type check, tests and a Docker build on every pull request. Add graceful shutdown, a health check that verifies the database connection, request ids and structured request logging.

## 7. Recommended sequence

Phase 1 first, and on its own. It is a few hours of work that turns a broken product into a working one, and it makes every later phase testable by hand.

Then Phase 2, because Phases 3 and 4 rewrite authorization and data shape and should not be attempted without a net.

Phases 3 and 4 can then run in parallel if desired, since they touch mostly different files.

Phase 5 before Phase 6, because redesigning components that are about to be split in half is wasted work. Within Phase 5, tokens and primitives before the component refactor, for the same reason one level down. See section 10.1.

Phase 7 last, since documenting the architecture before Phase 5 changes it means writing it twice.

Two decisions block Phase 5 and should be made before it starts rather than during it: the real-time transport and the workspace question, both in section 11.2. They are decisions, not implementations, so they cost a conversation now and a migration later. The real-time one additionally interacts with the session design, as explained in section 9.7.

Both are now resolved, along with task ordering and the column ownership question they were entangled with. Section 11.4 records what was decided and why, and adds Phase 4b, which runs before the rest of Phase 4.

## 8. Docker setup delivered in this pass

Files added: `docker-compose.yml`, `docker-compose.prod.yml`, `back/Dockerfile`, `back/.dockerignore`, `front/Dockerfile`, `front/.dockerignore`, `front/nginx.conf`.

Both Dockerfiles are multi-stage with separate `dev` and `prod` targets. The development compose file runs MongoDB 7 with a health check and a named volume, the backend under nodemon with the source bind-mounted, and the Vite dev server bound to `0.0.0.0`. Uploads go to a named volume rather than the container filesystem. The production compose file builds the frontend into nginx, which serves the static bundle and reverse-proxies `/api` and `/uploads` to the backend so the browser talks to a single origin, and it requires the Mongo credentials and the JWT secret to be set rather than falling back to defaults.

```bash
docker compose up -d --build
docker compose exec back npm run seed:all
```

The application is then at `http://localhost:5173`, the API at `http://localhost:5000/api`, and the seeded login is `admin@example.com` with password `admin123`.

Phase 4 has since changed the MongoDB service in both files. It now runs as a single node replica set called `rs0`, initiated by its own health check on first start, because multi document transactions do not exist on a standalone instance and the board delete cascade needs one. Production additionally generates a keyfile into its own named volume on first start, since enabling authentication on a replica set also requires internal authentication between members, even when there is only one. Deleting `mongo-keyfile` without also deleting `mongo-data` leaves a set that can no longer authenticate to itself.

Known limitations to address later: the development Mongo port is published to the host and should not be in any shared environment, Vite file watching over a bind mount on Windows may need polling enabled if hot reload proves unreliable, and there is no `.env` file committed, so the compose defaults are what run today.

## 9. Session and authentication hardening

Requested: close the session on inactivity, originally specified as five minutes and settled at fifteen in section 9.4, and replicate the token renewal concept from the `awc-management-web` and `awc-management-service` pair.

### 9.1 What the reference actually implements

The reference was read in full before designing this. It is worth stating plainly, because the shape is not what the name suggests: **there is no refresh token in that system.** No second token type, no `/auth/refresh` endpoint, no token table, no rotation of a long-lived credential against a short-lived one. A repository-wide search for a refresh token entity returns nothing.

What it implements instead is a **single sliding JWT**. One token is both the credential and its own renewal mechanism. Every authenticated request verifies the token, mints a brand new one with a fresh expiry, and returns it to the client in an `X-Auth-Token` response header. The client swaps it into storage and carries on. Renewal is a side effect of ordinary traffic rather than a call the client makes on purpose.

This matters for the port, because building an access-plus-refresh pair would be a different and considerably more complex system than the one being copied. The recommendation is to copy what is actually there, which is both simpler and sufficient for the inactivity requirement.

Note also that the reference's inactivity window is already five minutes (`jwt.expiration-ms` defaults to 300000), which is where the originally requested number came from. The requested timeout and the reference default were the same number because they are the same design.

### 9.2 The idea worth copying exactly: two independent clocks

This is the non-obvious part and the reason the design is good.

The token carries two timestamps. The standard `exp` is the inactivity window, and it is rewritten on every single request. A separate custom claim, `sessionStartedAt`, is stamped once at login and copied verbatim into every renewed token, never refreshed. Renewal is refused once `now - sessionStartedAt` exceeds an absolute cap, four hours in the reference, regardless of how active the user has been.

The reason `sessionStartedAt` exists rather than reusing `iat` is precise: `iat` is rewritten on every renewal, so anchoring the cap to it would silently turn a hard four hour ceiling into a second inactivity window. One clock resets on activity, the other never does. Copy both, and copy the reason.

```mermaid
sequenceDiagram
    participant C as Client
    participant M as auth middleware
    participant H as route handler

    C->>M: any request, Authorization Bearer token
    M->>M: verify signature, issuer, exp
    alt invalid or expired
        M-->>C: 401 invalid or expired token
    else valid
        M->>M: read sessionStartedAt claim
        alt now minus sessionStartedAt over absolute cap
            M-->>C: 401 session expired, sign in again
        else within cap
            M->>M: mint new token, same sessionStartedAt, new iat and exp
            M->>H: continue
            H-->>M: response, any status
            M-->>C: response plus header X-Auth-Token
        end
    end
```

Renewal happens regardless of the handler's final status. A 403 or a 500 still proves a human made the request. It also has to work that way, because middleware cannot know the final status before the chain runs.

### 9.3 Contract for BreezyBoard

| Method and path | Auth | Purpose | Notes |
|---|---|---|---|
| `POST /api/v1/auth/login` | no | Issue the first token | Generic failure message for wrong password, unknown email, disabled and locked accounts alike, to avoid enumeration. Closes finding P1-9 |
| `POST /api/v1/auth/logout` | yes | End the session | See 9.6, this must do more than the reference does |
| `GET /api/v1/auth/ping` | yes | Force a renewal with no other side effect | Returns 204 with `Cache-Control: no-store`. The renewal already happened in the middleware |
| `GET /api/v1/auth/me` | yes | Current user | Replaces the existing `validate-token` endpoint |

Transport matches the reference: `Authorization: Bearer` on the way in, `X-Auth-Token` on the way out. The renewal header must be listed in the CORS `exposedHeaders` or the browser hides it from JavaScript, which is the single most common way this design fails silently. That pairs with replacing the current wildcard CORS from finding P1-8.

Token storage on the client stays in `localStorage`, matching the reference. This is a deliberate tradeoff rather than an oversight: it is readable by any successful cross-site scripting attack, and the compensating controls are the short inactivity window, the absolute cap, the Content Security Policy from P1-8, and the fact that the application has no HTML injection surface today. Revisit only if a rich text editor is ever added to task descriptions.

### 9.4 Inactivity, and the one place to deviate from the reference

Two mechanisms cover activity, and the split is worth keeping.

Ordinary API traffic renews the token implicitly. On top of that, a keep-alive hook listens for a deliberately narrow set of DOM events and calls the ping endpoint. The reference uses `keydown`, `pointerdown`, `scroll` and `visibilitychange`, and explicitly excludes `mousemove`, because incidental cursor movement would keep a session alive with nobody present. The ping is double throttled: it fires at most once a minute, and it is skipped entirely if a real request already renewed the session within that minute. It exists for the case of a user filling in a long form and generating no other traffic.

Where this plan deviates: **the reference has no warning and no countdown.** The session simply stops working and the route guard redirects to login. For BreezyBoard that is both a WCAG failure and a data loss risk.

WCAG 2.2.1 Timing Adjustable, level A, requires that a user be able to turn off, adjust or extend a time limit, unless the limit is essential or is a security exception. A session timeout can qualify for the security exception, but the accessible and the merely decent behavior is the same here: warn before acting, and give the user a way to continue.

**Decided values.** The inactivity window is fifteen minutes and the absolute cap stays at four hours. Five minutes is aggressive for a board where reading a card is a normal, event-free activity, and the cap is what actually bounds a stolen token.

**Decided surface: a toast, not a modal.** The warning appears at fourteen minutes as a persistent toast with a sixty second countdown and a button to stay signed in, which calls the ping endpoint and dismisses it. At fifteen minutes, sign out.

The reasoning is worth recording, because the obvious choice is the modal and it is the wrong one. A modal's only advantage is that it cannot be missed, and that advantage applies to exactly one user: the one who is present but inactive, reading a card. For that user the modal is pure interruption cost. It cannot protect the absent user, who misses both surfaces equally, and it cannot interrupt a typing user, who by construction never sees the warning at all because typing is activity.

That leaves data loss as the only real argument for the heavier surface, and a louder warning is the wrong instrument for it. The correct instrument is not losing the data.

**Draft persistence, added as the actual safeguard.** The task drawer and the board creation form persist their in-progress values to `localStorage` as they are edited, keyed by task or board id, and clear the entry on successful save. Restoring on next open costs a small hook and removes the entire data loss argument. It also covers what no warning surface can: an accidental tab close, a browser crash, and a network failure mid-save. This is worth doing regardless of the session design.

Two constraints on the toast that are not negotiable:

It must not auto-dismiss. An auto-dismissing warning for an event this consequential is worse than no warning, and the existing `SuccessModal` auto-close behavior described in section 5.5 is the pattern to avoid, not to copy. It must also carry an explicit action, because WCAG 2.2.1 requires the user be able to extend the limit, not merely be told it exists.

The countdown must not be announced sixty times. A number ticking inside a live region produces one screen reader announcement per second, which is worse than silence. Announce the full message once with `role="alert"`, render the ticking number in an `aria-hidden` element, and re-announce only at thirty and ten seconds remaining.

### 9.4b What changed during implementation, and what was verified

Two refinements to the design above, both improvements on what section 9.4 originally specified.

The warning is scheduled from the token's own `exp` claim rather than from a hardcoded fourteen minutes. The client already has to decode the token, so deriving the deadline from it costs nothing and keeps the client correct if the server window is ever changed without a matching frontend release. The rule is simply: warn sixty seconds before `exp`, sign out at `exp`.

A `jti` claim was added, which the brief did not call for. It turned out to be necessary rather than decorative: `iat` and `exp` are whole seconds, so two tokens minted within the same second were byte for byte identical, and a renewal that returns the token you already had is indistinguishable from no renewal at all.

The behavior was verified by running it rather than by reading it, with the inactivity window shortened to ninety seconds so the whole lifecycle fits in a test:

| Checked | Result |
|---|---|
| Background traffic while idle | Zero API calls across 85 seconds |
| Warning timing | Appeared at t+30s of a 90s window, which is `exp` minus 60 |
| Warning persistence | Still present at t+85s, never dismissed itself |
| Warning action | Keyboard reachable, calls the ping endpoint, dismisses, and the session outlived its original expiry |
| Countdown announcement | The ticking number sits in an `aria-hidden` element |
| Unattended expiry | Signed out at t+90s and landed on the login page |
| Draft persistence | A half written description survived a full page reload and was cleared after a successful save |

The first row is the one that matters most, because the inactivity window is not enforced by the server. The server renews on every request it sees, so a single stray poll anywhere in the client would turn a fifteen minute window into a session that never ends, and nothing would fail loudly when it did.

One deliberate consequence of deploying this: tokens issued before the change carry no `sessionStartedAt`, which is treated as expired, so every existing session ends once and users sign in again.

### 9.5 Multi-tab behavior

The reference has no `BroadcastChannel`. Cross-tab behavior rides entirely on the browser's native `storage` event, which fires in every other tab whenever `localStorage` changes. That is enough to propagate a logout, since clearing storage in one tab is observed by the rest, and it is enough to propagate renewals incidentally, since each renewal writes the new token.

Copy that, because it is free. What it does not give is a synchronized countdown across tabs, and with a warning toast added that becomes visible: two open tabs would each run their own countdown. A `BroadcastChannel` carrying only the last-activity timestamp resolves it and is roughly twenty lines.

### 9.6 Gaps in the reference, and which ones to close

The reference is stateless by design, and that buys zero infrastructure at the cost of immediate revocation. Three consequences, stated because they are easy to inherit without noticing:

Logout writes an audit row and deletes the client's copy. The token itself stays cryptographically valid until its own expiry, so a stolen token survives a logout for up to the inactivity window. Password changes do not invalidate existing tokens. Deactivating a user blocks their next login, not their current session.

For BreezyBoard, close these with one cheap addition rather than a full token store. Add a `tokenVersion` integer to the `User` document, include it as a claim, and reject any token whose claim does not match the stored value. Increment it on logout, on password change, and on administrative deactivation. That gives immediate, real revocation on all three paths.

The cost is honest and should be stated: it adds one indexed document read per authenticated request, where today there is none. Given that every request already hits the database for its actual work, this is acceptable, and it can be cached later if it ever measures.

Do not attempt to add refresh token reuse detection. There is no refresh token in this design, so there is nothing to detect reuse of, and inventing one would be building a different system than the one being copied.

### 9.7 A collision to resolve before Phase 5

This is the most important paragraph in the section, because it connects this work to section 11.

The sliding token design rests on one invariant that the reference source states explicitly: **no client code may generate background traffic.** Every request is assumed to originate from a human action. The moment anything polls, or holds an open connection that counts as activity, the inactivity window silently becomes a session that never expires. The security property is not enforced by the server, it is an emergent consequence of client behavior.

Section 11 recommends deciding on real-time collaboration before Phase 5, and a Server-Sent Events stream or a WebSocket is precisely the kind of long-lived, non-human traffic that breaks this invariant.

The two features are compatible, but only if the rule is set now: the real-time transport authenticates once at connection time and must never renew the token, and the server must close the stream when the session's inactivity window lapses rather than treating the open connection as evidence of a present user. Deciding this after both are built means discovering that the session timeout has quietly stopped working, which is the kind of defect nobody finds until an audit.

### 9.8 Tasks

This work belongs in Phase 3, alongside the rest of the security work, and it depends on nothing from Phase 1 or 2.

| Task | Where |
|---|---|
| Add `sessionStartedAt` and `tokenVersion` claims, mint on login, copy on renewal | `back/src/services/auth.service.js` |
| Renew and set `X-Auth-Token` in the auth middleware, enforce the absolute cap | `back/src/middleware/auth.middleware.js` |
| Add `tokenVersion` to the `User` schema and increment it on logout and password change | `back/src/models/User.js` |
| Add the logout, ping and me endpoints, remove `validate-token` | `back/src/routes/auth.routes.js` |
| Expose `X-Auth-Token` in the CORS configuration | `back/src/app.js` |
| Read the renewal header in the axios response interceptor and swap the stored token | `front/src/services/api.service.ts` |
| Add the activity module outside React so the interceptor can write to it without rendering | new file |
| Add the keep-alive hook with the event allowlist and the double throttle | new file |
| Add the expiry timer, the warning toast with countdown, and the `BroadcastChannel` sync | new files plus `AuthProvider.tsx` |
| Add draft persistence to the task drawer and the board creation form | `TaskDrawer.tsx`, `CreateBoardModal.tsx`, new hook |
| Configure both windows as validated environment variables, defaulting to fifteen minutes and four hours | `back/src/config/env.js` |

Acceptance: a session with no activity signs out at fifteen minutes after showing a persistent toast at fourteen, activity extends it, the absolute cap ends the session at four hours regardless of activity, logout immediately invalidates the token server side, a second tab follows the first into the login screen, and a draft open in the task drawer survives the sign-out and is restored on the next login.

### Notes from slices 2 and 3

Two things are worth carrying forward from this work.

The validation middleware **replaces** the request value with the parsed output rather than merely checking it. That is the whole fix for mass assignment: a controller that still reads the raw body would happily act on a field no schema declared. There is an Express 5 detail buried in it worth knowing about, because it is not obvious and it fails loudly: `req.query` is a getter with no setter, so the parsed value has to be installed with `defineProperty` instead of assigned.

Two of the hardening changes proved themselves by breaking something during verification, which is the outcome to want from a fail-fast. Requiring `CORS_ORIGINS` in production stopped the production stack from booting, which is how it emerged that the production compose file never passed it. And adding `helmet` produced a container that crashed with a missing module, which exposed a real defect in the development compose file: it mounted a named volume over `node_modules` in both services. That protected nothing, since the bind mounts only cover source directories, and it persisted a stale dependency tree across rebuilds so that every new dependency required deleting a volume by hand. Both are fixed.

Also confirmed in production, incidentally: the computed font on a rendered page is the default Tailwind stack, not Inter. That is finding P4-1 observed rather than deduced. The typography system genuinely does not exist.

### Phase 3 closing note

Every security finding recorded in section 5.2 is closed, and the eleven tripwires the harness planted are all ordinary passing tests. The suite counts at the end of the phase: 63 backend, 41 frontend, 2 end to end, plus three standing scripts that drive the running stack rather than a test double.

Those scripts are the part worth keeping. Each one checks something a unit test structurally cannot:

The exploit replay drives two real accounts against the running API and asserts twelve outcomes, including that a legitimate owner and member can still do their work. A middleware that denied everyone would pass every negative security test ever written, so the positive cases are not padding.

The session check confirms the renewal contract over real HTTP: the header is present, the token differs, `sessionStartedAt` survives verbatim while `exp` advances, a 404 still renews, and a logged-out token is dead on its next use.

The idle check is the one that could not have been written any other way. It shortens the inactivity window to ninety seconds, drives a browser, and counts requests. Zero API calls across eighty-five idle seconds is the assertion, and it is the only way to verify a property that no code enforces: the window works because nothing polls, and nothing would fail loudly the day something did.

Two decisions made during the phase deviate from what this document originally specified, and both are recorded where they belong rather than quietly applied. The role model was built as a role-shaped middleware over the existing schema instead of a members migration, in section 6. The expiry warning is scheduled from the token's own claim rather than a hardcoded offset, in section 9.4b.

One thing this phase deliberately did not do: adopt pagination in the frontend. The contract exists and defaults to returning everything, so nothing truncates today and adopting it later is not a breaking change. That adoption belongs with the data-layer work in Phase 5.

## 10. Accessibility, responsive and UX as a gate

Requested as a standing requirement rather than a phase: accessibility correct on every element, responsive everywhere, and an interface that is intuitive by professional standards.

Treating that as a phase is what produces the outcome we already have, where `AddMemberModal` builds its suggestion list correctly and `TaskDrawer` builds the same list as unreachable divs, in the same codebase, by the same author. The difference is not knowledge, it is that nothing enforced it. So the change is to make it a definition of done backed by tooling, and to fix one ordering mistake in the roadmap.

### 10.1 The ordering correction

The current plan puts the component refactor in Phase 5 and the design and accessibility work in Phase 6. With this requirement added, that order means every component gets rewritten twice: once to split container from presentation, and again to receive tokens, focus management and responsive rules.

The corrected order moves the foundations of Phase 6 to the front of Phase 5. Concretely, Phase 5 now starts with the design token layer and the accessible primitives, and only then refactors components onto them.

```mermaid
graph LR
  A[5a. Design tokens<br/>theme block, scales] --> B[5b. Accessible primitives<br/>Modal, Button, Field, Listbox]
  B --> C[5c. Component refactor<br/>onto the primitives]
  C --> D[6. Board layout rebuild<br/>and page-level UX]
```

The primitives are where accessibility is actually won. One `Modal` with focus trapping, focus restoration, escape handling and a correct dialog role fixes five surfaces at once and makes the sixth impossible to get wrong. The same applies to a `Field` primitive that cannot render a label without an associated control, and a `Listbox` primitive for the two autocomplete lists.

### 10.2 The enforcement gate

Accessibility that is not enforced regresses on the next pull request. Three layers, all blocking in CI:

| Layer | Tool | Catches |
|---|---|---|
| Lint | `eslint-plugin-jsx-a11y` | Missing label association, `aria-hidden` on interactive elements, click handlers without keyboard handlers, invalid ARIA |
| Component test | `jest-axe` or `vitest-axe` on rendered components | Contrast, roles, names, and structure per component |
| End to end | `@axe-core/playwright` on every page and with every modal open | Everything the static layers cannot see, including focus order and live regions |

The end-to-end layer matters most here, because the three defects in section 5.1 were all invisible to static analysis. An axe scan with the task drawer open would have flagged the unlabeled dialog immediately.

Definition of done for any component from here on: zero axe violations, operable by keyboard alone, visible focus ring, correct role and accessible name, and renders correctly at 390px, 768px and 1440px.

### 10.3 WCAG 2.2 criteria that specifically apply to this product

These are not generic. Each one maps to something the audit found.

**2.5.7 Dragging Movements, level AA.** Any drag operation the author controls must have a single-pointer alternative. This is the important one, and it is stronger than what the plan currently says. Fixing keyboard drag (P0-3 and P0-4) is necessary but not sufficient: the board also needs a non-drag way to move a card, such as a "Move to" menu on each card or move-up and move-down controls next to the handle. That is also the fastest correct fix for cross-column movement, because a menu works for keyboard, screen reader, touch and mouse users at once, and it can ship before the dnd-kit keyboard coordinate work.

**2.5.8 Target Size Minimum, level AA.** The web threshold is 24 CSS pixels, not the 44 pixels often quoted from native platform guidance. The drag handle currently measures 24.48 pixels, so it passes by a fraction. Any reduction, or any new icon-only control, needs checking.

**2.4.11 Focus Not Obscured Minimum, level AA.** Relevant once the board scrolls horizontally and the header is sticky. Reserve space with `scroll-padding-top` rather than letting the header cover the focused card.

**2.2.1 Timing Adjustable, level A.** This one is triggered by the inactivity timeout and is covered in section 9.4, including why the warning is a persistent toast rather than a modal and why the countdown must not be announced every second.

**1.3.1 Info and Relationships, level A.** The `FormInput` label association bug fails this across the entire registration flow.

**4.1.2 Name, Role, Value, level A.** The owner suggestion list, the unlabeled dialogs and the `aria-hidden` priority badge all fail this.

Note: the session timeout guidance in section 9.4 comes from WCAG 2.2.1 directly. The UX guideline database returned no match for session timeout patterns, so that recommendation is not backed by a database result.

### 10.4 Responsive

Nine components currently contain no responsive rules at all: `Column`, `TaskCard`, `TaskDrawer`, `AddMemberModal`, `PageHeader`, `LegalModal`, `SuccessModal`, `RegisterForm` and `FormInput`. The approach is mobile-first, meaning the base styles target the narrow viewport and breakpoints add capability, which is the opposite of how the existing four responsive components were written.

Three layout decisions carry the most weight:

The board becomes a horizontally scrolling column set with a fixed column width and internal vertical scroll per column, replacing the wrapping four-column grid. This is what makes it a Kanban board rather than a card grid, and it is the only layout that survives a board with eight columns.

The task drawer becomes a bottom sheet below the medium breakpoint and keeps the side panel above it. A full-height side drawer on a 390 pixel viewport leaves no room for the board behind it.

The registration name row drops to a single column below the small breakpoint.

Verification is part of the end-to-end suite rather than a manual pass: the Playwright run exercises 390, 768 and 1440 pixels, and fails on any horizontal overflow of the document body.

### 10.5 Intuitiveness

The product database match for this product type is Productivity Tool, whose recommended direction is Flat Design with micro-interactions, with Minimalism and Swiss style as the secondary, and a color strategy built on clear hierarchy plus functional color. That is close to what exists, which is the actual problem: the current interface is the unconsidered version of the right direction rather than a considered one. Section 5.5 covers the visual side. What follows is the behavioral side.

**Never disable a submit button without saying why.** This is the anti-pattern that hid P0-1 for a year. A user who fills in every field and sees a grey button has no path forward and no information. Either enable the button and validate on submit with errors next to the offending fields, or keep it enabled and show what is missing on click. React Hook Form with Zod, already the direction in Phase 5, does this correctly by default.

**Every asynchronous action needs three states.** Pending, success and failure, each visible. Today a failed task save and an idle drawer are pixel-identical, and a failed board fetch and an empty board are pixel-identical. This is the single largest gap between the current product and one that feels trustworthy.

**Every empty state needs a next action.** An empty column currently renders 500 pixels of nothing. The dashboard empty state is done well and is the model to follow.

**Destructive actions need confirmation and undo.** Board deletion cascades to every task in it and currently happens on one click. Undo is better than a confirmation dialog where it is feasible, and for a soft-deleted board it is feasible, which is one of the reasons soft delete appears in section 11.

**Optimistic updates need visible reconciliation.** Once drag and drop works, a move that fails on the server must visibly return the card and say why, not silently roll back.

## 11. Foundational decisions to make now

Requested explicitly: what is missing that, if decided now, avoids an expensive refactor later.

The filter used below is retrofit cost. Every item is something that is cheap to build into a model, a contract or an abstraction today, and expensive to retrofit once there is data in the database and code depending on the current shape. Items that are merely useful features are not listed. None of these compete with Phase 1, and most of them are decisions rather than implementations, which is the point: deciding now costs a conversation, deciding later costs a migration.

### 11.1 Ranked by retrofit cost

| Decision | Cost if built now | Cost if deferred |
|---|---|---|
| Real-time collaboration transport | A transport choice and a reconciliation rule while the data layer is being written in Phase 5 | Rewriting the entire client data layer, because fetch-once-and-cache and stream-and-merge are different architectures |
| Task ordering strategy | A field type choice in the `Task` schema | Data migration of every task, plus rewriting the reorder endpoint and the drag handlers |
| Workspace or organization layer | One field on `Board` and one collection | Migration across every collection, every query, and every authorization check in the system |
| Per-board role model | A role on the membership record instead of a bare id array | Rewriting the authorization middleware that Phase 3 is about to write, plus a data migration |
| Pagination on list endpoints | A shared query contract | A breaking API change for every consumer, and a UI that has already been built assuming full arrays |
| API versioning and error codes | A path prefix and an error envelope | A breaking change, or permanent support for an unversioned surface |
| Soft delete and audit fields | Three fields on each schema and a query default | Backfill with no source data for the historical values, which means the audit trail simply does not exist for anything before the change |
| Internationalization | A provider and a key convention while components are being rewritten anyway | A mechanical but enormous diff touching every component, done a second time |
| File storage abstraction | An adapter interface with a local implementation | Migrating stored URLs and every reference to them |

### 11.2 The four that matter most

**Real-time collaboration.** The login page says "Team Collaboration, work together seamlessly in real-time". That is currently false: two people with the same board open see nothing of each other until one reloads. This is the decision with the highest retrofit cost in the entire list, because it determines how the client data layer is designed, and Phase 5 is where that layer gets written. Building a fetch-once cache in Phase 5 and adding a socket in Phase 8 means rewriting Phase 5. Recommendation: decide the transport before Phase 5 starts, and design the cache around server-authoritative events from the beginning even if the socket itself ships later. Server-Sent Events over a board-scoped channel is the cheaper option and is sufficient for board updates; WebSocket is warranted only if presence indicators and live cursors are wanted.

**Task ordering.** Integer `order` with bulk renumbering is the shape the schema has today. It costs one write per affected task on every drag, and it is inherently race-prone when two people reorder at once, which is exactly the scenario real-time collaboration introduces. Fractional indexing, meaning a string or decimal key computed between the two neighbors, makes a move a single write to a single document with no coordination. Changing this later is a migration of every task row plus a rewrite of the reorder endpoint and the drag handlers. Recommendation: change it in Phase 4, when the ordering bug P2-3 is being fixed anyway and the cost is close to zero.

**Workspace layer and per-board roles.** Today a board has a `createdBy` and a flat array of member ids, and section 5.2 shows that the flat array is precisely why any member can delete the board. Phase 3 is about to write the authorization middleware. If that middleware is written against a boolean membership check, it gets rewritten the first time a viewer role or a workspace admin is needed. Writing it against a role from the start costs the same. The workspace layer is a separate question and can be deferred, but the decision cannot: adding a `workspaceId` after there are boards means touching every collection, every query and every authorization check. Recommendation: build roles into Phase 3 now, and decide the workspace question before Phase 4 touches the schemas.

**Pagination, versioning and the error contract.** All three are API surface decisions that become breaking changes the moment anything depends on them. `GET /api/boards` and `GET /api/tasks/board/:id` return unbounded arrays today. The error envelope carries a human-readable message with no machine-readable code, so the frontend can only match on English strings, which breaks the moment internationalization lands. All three are cheap in Phase 3, when the Zod validation layer is being added and every route is being touched anyway.

### 11.3 Also worth deciding, lower cost

**Optimistic concurrency.** A `version` field on `Task` and `Board`, checked on update. Without it, two users editing the same task means last write wins silently. Cheap now, and it becomes necessary the moment real-time collaboration exists.

**Email capability.** Three separate items are blocked on it: the dead password-recovery link, board invitations by email rather than by user id, and any notification. It is one provider decision.

**Domain model gaps that will be asked for.** `Task` has no due date, no labels, no comments and no attachments, and supports exactly one owner rather than multiple assignees. `Board` has no archived state and no settings. `User` has no email verification, no last-login timestamp and no disabled state. None of these need to be built now. The one worth deciding now is comments, because a comment collection with an author and a timestamp is the natural place the audit trail from soft delete and audit fields also lives, and building both against one activity model is cheaper than building two.

**Observability.** Request ids, structured logging and error tracking are already in Phase 7. The reason to pull them earlier is that Phases 3 and 4 change authorization and data shape, which is exactly when production-shaped diagnostics are worth having. Recommendation: move request ids and structured logging into Phase 3.

**Rate limiting granularity.** Phase 3 adds rate limiting on the auth routes. Decide at the same time whether limits are per IP, per account, or both, because per-account limiting requires a store and adding it later means adding infrastructure.

### 11.4 The resolutions

Everything 11.2 left open was settled with Kevin on 2026-09-14. This subsection is the authoritative record; where it contradicts the recommendation written above it, this subsection wins, and the reasoning for the change is given.

The question that collapsed three of the four: two people will have the same board open at the same time only occasionally, editing in bursts, with rare collisions.

**Real-time transport: none is built.** Occasional concurrency rules out WebSocket outright, since presence indicators and live cursors are the only things that would justify it. It also undercuts Server-Sent Events, because the plan's own diagnosis locates the retrofit cost in the cache rather than in the transport: fetch-once-and-cache and stream-and-merge differ in whether the cache can be written from something that is not a fetch. A server-state library provides that write path as a matter of course, so Phase 5 adopts one and revalidates on window focus. Adding a stream later becomes writing the producer rather than redesigning the consumer.

This also disposes of the collision in section 9.7 rather than managing it. There is no long-lived connection, so there is nothing that must authenticate once and never renew, and nothing the server must close when the inactivity window lapses. The invariant that no client code generates background traffic continues to hold by construction, and `idle.mjs` continues to be the thing that would notice if it stopped.

**Task ordering: fractional indexing.** `order` becomes a string key computed between its two neighbours. `PATCH /tasks/:id/move` takes a relative position rather than an absolute number, the server computes the key, and `updateOrders` is removed rather than kept as a renumbering endpoint. The recommendation on the table had been to stay with integers, on the grounds that fractional indexing mainly buys uncoordinated concurrent reordering, which occasional concurrency does not need, and that the migration was not worth it. Kevin overrode it on a fact that removes the objection entirely: the application has never run anywhere but development, so there is no data to migrate and the change is close to free.

A defect surfaced while examining this and is worth recording, because it is not in section 5. A cross-column drag always lands at the bottom of the destination column regardless of where it was dropped, because `Board.tsx` computes `newOrder` as one past the maximum of the target column. Reordering within a column respects the drop position; moving between columns does not. It is a consequence of `/move` taking an absolute number, and the neighbour-based contract fixes it as a side effect.

**Workspaces: built now.** The recommendation was to defer, on evidence that the cost of deferring is far lower than 11.2 claimed. That claim, a migration across every collection, every query and every authorization check, was written before Phase 3 existed. Authorization is now resolved in a single function, `resolveBoardRole(board, userId)`, which both middlewares call and no route bypasses, so adding a workspace level means changing one function and no routes. Combined with there being no data to backfill, deferring would have cost a field, a collection and two queries. Kevin chose to build it anyway, which the cost argument no longer opposes.

The shape: every board belongs to exactly one workspace, with no exceptions, and a personal workspace is created automatically at registration so that no query carries a null branch and no user meets an onboarding wall. Membership is two levels. Belonging to the workspace is a prerequisite, and explicit board membership is still required on top of it, so `Board.members` and `AddMemberModal` survive unchanged. A workspace admin holds owner rights over every board in the workspace. A viewer role is deliberately not decided here, because 11.2 already established that adding one later changes `resolveBoardRole` and no routes.

**Columns belong to the board.** They are copied out of the `BoardTemplate` when the board is created, which turns the template into a mould rather than a live reference. This closes the domain problem recorded at the end of P2-9, where two boards created from one template shared column ids and neither could rename a column without renaming it on the other. It also simplifies work already committed: validating `status` becomes a single document read instead of a populate into another collection.

**Sequencing.** The schema layer goes first, as Phase 4b, and the rest of Phase 4 follows against the final shape. Both alternatives cost rework: the `status` validation committed in `3a20f1a` is rewritten against board-owned columns, the indexes depend on `workspaceId`, and the progress aggregation needs to know which column means done on that particular board. Only fractional indexing and the drag concurrency work are genuinely independent of the schema.

### Phase 4b. Workspaces and board-owned columns. Size: M.

Add a `Workspace` collection with a membership list carrying roles, create a personal workspace on registration, and give `Board` a required `workspaceId`. Extend `resolveBoardRole` to require workspace membership and to grant owner rights to a workspace admin, leaving every route untouched. Copy the template's columns onto the board at creation and move `status` validation onto the board's own columns. Update the board and dashboard queries to scope by workspace.

Acceptance: a new account can create a board without choosing a workspace first, a workspace admin can administer a board they were never added to, a member of the workspace who is not a member of a board still cannot read it, and renaming a column on one board leaves every other board created from the same template untouched.

## 12. Component architecture

Requested: review whether the current components are correctly separated, whether they should be broken into reusable pieces, and whether the pages are carrying code that belongs in components.

### 12.1 The diagnosis, in one number

There are 14 components and 5 real pages. Of those 14 components, **9 have exactly one importer, and not a single one has four or more.** The highest reuse count in the entire codebase is `PageHeader`, at three.

That is the whole finding. `components/` is not a component library, it is a folder of page fragments that were moved out of pages for length rather than for reuse. A component library has a reuse curve: a few primitives imported everywhere, then progressively more specific pieces. This has a flat curve at one.

The consequence is visible everywhere in the inventory, and it always takes the same shape: the same visual unit exists three, four or five times, and the copies have drifted apart, with the accessible version and the broken version living side by side.

| Visual unit | Copies | The drift |
|---|---|---|
| Modal shell | 6 | Four near-identical centered modals, one drawer variant, and an inline one in `Login.tsx:194-233` with no `role="dialog"` and no `aria-modal` |
| Avatar with initials fallback | 6 | `SimpleUserAvatar` exists and is imported by exactly one file. The other five are hand-rolled with different sizing and different null handling |
| Form field | 11 | `FormInput` is used correctly in two files, and the same label-plus-input-plus-error shape is rebuilt by hand in three others |
| Close button | 6 | Same classes, icon size varies between 14, 18, 20 and 24 |
| Escape to close | 5 | Five separate `keydown` listeners in five files |
| Empty state | 4 | One with icon, heading, body and call to action; one with icon and body; one text only |
| Error state | 7 | Four structurally different shapes plus three inline red banners |
| Dropdown menu | 2 | `UserAvatar` has `role="menu"` and animation, the board options menu in `BoardDashboard` has neither |
| Progress bar | 2 | `BoardDashboard` has `role="progressbar"` and `aria-valuenow`, `TaskCard` has neither |
| Priority colors | 2 | `TaskCard` and `TaskDrawer` each define their own independent color map |
| Stat tile | 4 | The identical block repeated four times inside one file, never extracted |

This is the mechanical explanation for finding P4-3. Accessibility is not inconsistent because of uneven knowledge, it is inconsistent because there are six chances to get a modal right and each one was taken separately.

### 12.2 The design tokens already exist, uncredited

The class-string analysis is the most useful part of the inventory, because it shows a token system that was designed and then never named:

| Repeated verbatim | Times | What it actually is |
|---|---|---|
| `block text-sm font-medium text-gray-700 mb-2` | 10 | The label token |
| `focus:ring-2 focus:ring-blue-500 focus:border-transparent` | 9 | The focus ring token |
| `mt-1 text-sm text-red-600` | 8 | The error text token |
| `text-gray-400 hover:text-gray-600` | 13 | The muted icon token |
| `bg-white rounded-xl shadow-sm border border-gray-100` | 3 | The card surface token |
| `p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer` | 4 | The icon button token |

Two things follow. First, the `@theme` block from finding P4-1 is not a design exercise, it is a transcription of decisions that were already made consistently. Second, `text-gray-400` appearing thirteen times is the same string flagged for contrast failure in section 5.5. Naming the token and fixing the contrast are one edit in one place instead of thirteen.

### 12.3 Target structure

Feature-sliced in three layers, with the domain visible at the top level.

```
src/
  app/            router, providers, error boundary, layouts
  shared/
    ui/           primitives, no domain knowledge
    hooks/        useAsync, useEscapeKey, useClickOutside, useDebouncedValue, useDraft
    lib/          normalizeRef, formatDate, initials, unwrap
  features/
    auth/         components, hooks, services, model, index.ts
    boards/
    tasks/
    users/
  pages/          composition only
```

The reason for this over atomic design is enforceability. Atomic design classifies by visual complexity, which no lint rule can check, so the boundary erodes. This classifies by dependency direction, which is three rules in `eslint-plugin-import` or `dependency-cruiser`, failing the build:

```mermaid
graph TD
  P[pages] --> F[features]
  F --> S[shared]
  A[app] --> P
  A --> F
  F -.->|only via index.ts| F2[other features]
  S -.->|never| F
```

`shared` must not import from `features` or `pages`. `features` must not import from `pages`. One feature reaches another only through its public `index.ts`. A structure that cannot be verified automatically is a convention, and this codebase is the evidence of what happens to conventions.

On container and presentational: the pattern's original job, separating data access from rendering, is done by hooks now. What survives is the rule, not the file pair. A component under `shared/ui` or a feature's `components/` may not import from `services/`. Data access lives in the feature's `hooks/`. Pages compose. That gives the separation without `TaskDrawerContainer` plus `TaskDrawerView` boilerplate at every level.

### 12.4 The primitive layer

Every entry below is justified by a count from the inventory, not by anticipation. Nothing is built because it might be needed.

| Primitive | Replaces | Evidence |
|---|---|---|
| `Overlay`, `Modal`, `Drawer` | 6 modal shells | Focus trap, focus restoration, escape and dialog role solved once. Closes most of P4-3 |
| `Button`, `IconButton` | Primary CTA in 5 files, 6 close buttons, back button | The `cursor-pointer cursor-not-allowed` conflict in `TaskDrawer` disappears with it |
| `Field`, `Input`, `Textarea` | 11 form fields | `Field` cannot render a label without threading `htmlFor` and `id`, which makes the `FormInput` bug unrepresentable |
| `Avatar` | 6 reimplementations | Promote `SimpleUserAvatar`, delete the other five |
| `SearchInput` | 2 | Icon, clear button and labelling in one place |
| `Menu` | 2 | The accessible one becomes the only one |
| `ProgressBar` | 2 | Same, `role="progressbar"` becomes unavoidable |
| `Badge` | Priority pills, department pills, column tags, count badges | Consolidates the two divergent priority maps |
| `Spinner`, `EmptyState`, `Alert` | 4, 4 and 7 | The three states that section 10.5 requires on every async surface |
| `Card`, `StatTile` | 3 and 4 | `StatTile` collapses four identical inline blocks |
| `SwatchPicker` | 2 divergent color pickers | |
| `Toast` | New | Required by the session warning in section 9.4 |

Shared hooks, each replacing a counted duplication: `useEscapeKey` for 5 copies, `useClickOutside` for 2 divergent implementations, `useDebouncedValue` for 2 at different delays, `useAsync` for the 6 hand-rolled unmount guards plus the loading and error state every page reinvents, and `useDraft` for section 9.4.

Shared lib, from table B of the inventory: `normalizeRef` for the object-or-id guard written at 4 call sites, `formatDate` for 2 divergent implementations where only one has a try block, `initials` for 4 sites with inconsistent null handling.

### 12.5 Feature decomposition

The four nested component definitions come out first, because they are the clearest signal. `UserSearchInput` is 173 lines living inside `TaskDrawer.tsx`, with its own fetching, its own debounce and its own suggestion list, while `AddMemberModal` independently implements user search a second time. That is one `features/users/UserPicker` serving both.

| Current | Lines | Becomes |
|---|---|---|
| `TaskDrawer.tsx` | 728 | `tasks/TaskDrawer` shell, `tasks/TaskForm`, `tasks/Checklist`, `tasks/PrioritySelect`, `users/UserPicker`, `shared/ui/SwatchPicker`, `useTaskForm` |
| `BoardDashboard.tsx` | 505 | `boards/BoardCard`, `boards/BoardCardMenu`, `boards/BoardStats`, `useBoards`, `shared/ui/StatTile` and `EmptyState` |
| `Profile.tsx` | 410 | `users/ProfileSummary`, `users/ProfileForm`, `users/AvatarUploader`, `useProfile` |
| `AddMemberModal.tsx` | 370 | `users/AddMemberModal` shell over `shared/ui/Modal` plus the shared `UserPicker` |
| `Board.tsx` | 326 | `tasks/BoardColumns`, `useBoardData`, `useTaskDragAndDrop` |
| `CreateBoardModal.tsx` | 281 | `boards/CreateBoardForm` over `Modal`, `TemplatePicker`, `SwatchPicker` |
| `RegisterForm.tsx` | 247 | `auth/RegisterForm` over `Field`, plus `PasswordInput` for the toggle repeated 3 times |
| `Login.tsx` | 242 | `auth/LoginForm` on React Hook Form and Zod, its inline modal replaced by `Modal` |
| `UserAvatar.tsx` | 234 | `users/UserMenu` over `shared/ui/Menu` and `Avatar` |
| `TaskCard.tsx` | 222 | Stays presentational, drops its own color fetching and priority map |
| `AuthLayout.tsx` | 167 | Moves to `app/layouts`, its two nested components split out |

`Column`, `Footer`, `PageHeader` and `FormInput` are the four that are already roughly right. `PageHeader` is the closest thing to a real primitive in the codebase and should move to `shared/ui` unchanged.

### 12.6 Page targets

A page should read as composition and nothing else: route params in, hooks for data, primitives and feature components out.

| Page | Now | Target |
|---|---|---|
| `BoardDashboard.tsx` | 505 | Under 70 |
| `Profile.tsx` | 410 | Under 60 |
| `Board.tsx` | 326 | Under 80 |
| `Login.tsx` | 242 | Under 40 |
| `Register.tsx` | 26 | Unchanged |

The reduction is not deletion, it is relocation. The `handleDragEnd` block in `Board.tsx:92-183` is 91 lines of business logic in a page component, and it is also finding P2-6, the drag concurrency problem. Moving it into `useTaskDragAndDrop` is what makes it testable, which is what makes P2-6 fixable with confidence.

### 12.7 Sequencing

The work splits into two halves with very different risk, and they should not be scheduled together.

Building `shared/ui` and `shared/hooks` is **additive**. It is new code with new tests, it imports nothing existing, and it cannot break a running feature. It can start immediately, in parallel with Phase 1, and it is the natural place to establish the accessibility gate from section 10.2 since every primitive is written under it from birth.

Migrating 4,600 lines onto those primitives is **refactor**, and it needs the Phase 2 harness underneath it for the same reason Phases 3 and 4 do. Recommending otherwise here would contradict section 7.

So: primitives and tokens land as Phase 5a, which may start now. The migration is Phase 5c and waits for tests. The dependency lint rules go in with the first primitive, while the graph is still small enough that they pass trivially, rather than after the migration when turning them on means fixing a hundred violations at once.

One ordering exception worth taking: `Field`, `Modal` and `Button` are on the critical path for Phase 1, because the recommended fix for P0-1 replaces the hand-rolled validation in `TaskDrawer` with React Hook Form and Zod. Build those three first and Phase 1 lands on them directly, rather than writing code that is scheduled to be replaced.

## Appendix A. Reproducing the confirmed defects

P0-1, task creation. Log in, open any board, click Add Task, fill in title, description, owner and color. The Save button stays disabled.

P0-2 was withdrawn. To confirm the board is correct: fix P0-1, create a task through the drawer, and observe that it appears in the first column and is stored with `status` equal to that column's `_id`.

P0-3, drag and drop. Drag a card by its handle or its body. Nothing happens and no request is issued. Focus the handle and press space. The console shows `TypeError: Cannot read properties of undefined (reading 'dndKit')`.

P1-1, task IDOR. **Closed in Phase 3 slice 1.** Every step below now returns 403. Kept here as the reproduction to re-run against any future change to the authorization middleware. Log in as a second account that is not a member of the board.

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:5000/api/boards/$BOARD -H "Authorization: Bearer $JOHN"
# 403, correct

curl -s http://localhost:5000/api/tasks/$TASK -H "Authorization: Bearer $JOHN"
# 200, full task document

curl -s -X PUT http://localhost:5000/api/tasks/$TASK \
  -H "Authorization: Bearer $JOHN" -H 'Content-Type: application/json' \
  -d '{"title":"PWNED BY JOHN"}'
# 200, and the title is now overwritten
```

## Appendix B. Change made during this assessment

One code change was made, because it blocked the stack from booting in Docker. `back/src/config/env.js:11` now reads `Number(process.env.SALT) || 10`. Without it, setting `SALT` as an environment variable makes `bcrypt.genSalt` throw and breaks both registration and the user seed. This is finding P2-7.
