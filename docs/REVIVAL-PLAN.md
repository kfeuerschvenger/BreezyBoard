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

Superseded by the move to fractional indexing, recorded below. `order` is now a base 62 key rather than a position, the sort reads it, and `PATCH /tasks/:id/move` names the two neighbours a card was dropped between rather than an absolute number. `PATCH /tasks/board/:boardId/orders` was removed rather than adapted: there is nothing left to renumber.

Three consequences worth stating. A move is one write to one document, whatever the length of the column, where the integer version rewrote every card below the insertion point. The cross-column drop defect recorded in section 11.4 is fixed as a side effect, because a client can finally express "between these two" instead of "one past the maximum". And a client naming a neighbour that has moved since it last fetched gets a 409 carrying `CONFLICT` rather than a 400, which is a distinction it can act on: refetch the board, rather than fix a payload that was never malformed.

The P1-4 security tripwire was rewritten rather than deleted. It guarded the bulk renumbering endpoint against a task id belonging to another board, and that endpoint is gone, but the property survives the move: a client still names other tasks when it moves one, and the neighbour lookup is scoped to the authorized board and target column, so a foreign neighbour is refused and nothing moves.

Fixed in Phase 4. The query sorts by `order` ascending with `createdAt` descending kept as the tiebreaker, so tasks that genuinely share an order keep the arrangement they had. The board page had been re-sorting the array itself after fetching, which hid the bug there and left it visible everywhere else, including in any paginated request, where the page boundary was being cut on a different ordering than the one the caller saw.

Worth recording how close one of the regression tests came to being worthless. The first version reordered two tasks and asserted the result, and it passed against the broken sort, because the arrangement it expected happened to be the one creation order already produced. Both tests now expect an arrangement that creation order cannot produce, and both fail against the previous code. The same trap is written into `e2e/verify/integrity.mjs`, where the fixture creates its tasks with deliberately reversed orders for exactly this reason.

**P2-4. Average progress is always zero.** Files `back/src/services/dashboard.service.js:6-8` and `back/src/models/Board.js:57-71`.

Two independent bugs stacked. The dashboard query uses `.lean()`, which strips virtuals, so `board.progress` is `undefined` at the point it is summed. And the virtual itself is declared as an async getter, which Mongoose does not support: it would return a pending Promise rather than a number. The `toJSON` transform never copies it either. This is dead code that should be replaced with an aggregation.

Fixed in Phase 4. The virtual is gone and one aggregation in `board.service.js` produces both the task total and the completion count per board, used by the dashboard totals and by the board list alike.

It turned out to be three numbers rather than one. The dashboard cards render a task count, a member count and a progress bar, and two of the three were always zero for the same class of reason: `taskCount` is a populate virtual that no query ever populated, so `doc.taskCount` was `undefined` and the `toJSON` transform faithfully copied `undefined`. Only `memberCount` worked, because it is a plain getter. The board list now computes all three explicitly and the transform is no longer load-bearing for it.

A task counts as complete when it sits in its board's last column, or when it carries a checklist with every item ticked. The second rule is what the old virtual intended; the first is what it was trying to say by comparing `status` to the literal `'done'`, which is the second of the two impossible comparisons recorded under P2-9 and is now closed with it.

One detail that is easy to get backwards, and has its own test. An empty checklist satisfies "every item is ticked" vacuously, so the rule has to require at least one item. Written the obvious way it would report every board with no checklists anywhere as a hundred percent done.

Matching every board's done column in a single `$in` is correct rather than merely convenient, and only became correct in Phase 4b: column ids belong to one board now, so a task whose status appears in that set is necessarily in its own board's last column.

**P2-5. `TaskService.move` is called with a missing required argument.** Files `front/src/services/task.service.ts:29` and `front/src/pages/Board.tsx:254`.

`move(taskId, newStatus, newOrder)` declares three required parameters and is called with two, so the backend receives `order: undefined` whenever a task auto-moves to done on checklist completion.

**P2-6a. Drag activation is timing-sensitive.** File `front/src/pages/Board.tsx:43-48`.

Observed while building the end-to-end suite rather than by reading the code. The `PointerSensor` is registered with no activation constraint, so it activates on the first pointer move after the press, and the card simultaneously runs a framer-motion tap animation that transforms it under the cursor. Adding video and trace recording to the test run, which slows the renderer by a few milliseconds, was enough to make the drag intermittently fail to start.

A human pressing and moving generates many more intermediate events than an automated pointer, so this is not a defect a user would hit often. It does mean the interaction has very little margin, and a slow device or a heavy board is exactly where that margin disappears. Adding a distance activation constraint was tried and made the automated case worse, so the fix is not obvious and should be done with the drag rewrite in Phase 4 rather than guessed at now.

**Status: closed in Phase 6b. The root cause is in the last paragraphs of this entry, and the paragraphs between are the investigation that preceded it.** The text below is kept because it records two ruled-out hypotheses and a measuring lesson. It has not been reproduced by hand, and the measurements so far place the failures inside full runs of the end to end spec rather than in isolation, which points at state carried between tests or at contention. It is not scheduled in any phase and does not block one. Whoever picks it up starts from the measurements in section 12.6b, and from the "Move to" menu, which gives every move a path that does not depend on the drag sensor.

Measured during Phase 4b, because it was briefly mistaken for a regression: the core loop spec fails roughly one run in six, and the failure is always the same one, the sensor never announcing the pickup so the `role="status"` live region stays empty. The rate is identical with and without the workspace authorization layer, at 5 passes in 6 either way and with the same durations, so the extra query that layer adds per request is not what causes it.

Two things made it look worse than it is, and both are worth knowing before diagnosing this again. Three consecutive failures is unremarkable at a one-in-six rate, so a handful of runs is not a measurement. And each separate `npx playwright test` invocation reports browser startup inside the test duration, which turns an 8.8 second run into a 16 second one and invites a conclusion about performance that the numbers do not support. Use `--repeat-each` within one invocation to compare.

The `retries: 1` in the Playwright config masks this in ordinary use, which is why it has stayed open.

**Still open after Phase 4, and two hypotheses are now ruled out.** Both were tried, measured and reverted rather than shipped, and both are recorded here so nobody spends the afternoon on them again.

The first was `whileTap={{ scale: 0.98 }}` on the card's outer `motion.div`, which contains the drag handle. It looked compelling: pressing the handle scales the card and moves the handle out from under the cursor at the exact moment the sensor is waiting for a pointer move on it, and it would have explained why a distance constraint made things worse. Removing it measured 5 passes in 8, against a baseline of 5 in 6. No improvement.

The second was `whileHover={{ scale: 1.02 }}`, on the theory that the spec measures the handle's bounding box before moving the pointer there, so it presses at coordinates taken before the card grew. Removing both animations measured 3 passes in 8. No improvement either, and if anything worse.

So it is neither animation. What remains untested is whether this is a product defect at all or a defect in the spec's pointer choreography, and answering that needs a measurement method better than eight runs on a laptop that has been running Docker all afternoon. The honest state is: the mechanism is not understood, the fix is still not obvious, and guessing at it is what this entry has now cost twice.

**Root cause, found in Phase 6b: the press never reached the drag handle, in two ways, and the sensor was never the problem.** An event log on the page (capture listeners on `pointerdown`, `pointermove`, `selectstart`) showed every failing run pressing on a `DIV` and starting a text selection, never on the handle button, so dnd-kit received no press and never announced a pickup. The two ways are independent. First, the drawer that creates the task is still leaving when the spec presses: its scrim, `fixed inset-0 z-40`, stays mounted until the panel's spring finishes (about 480 to 580 ms in the measurements) and intercepts the pointer for all of it. Second, the spec decided the card had stopped moving by reading the handle's box twice, 120 ms apart. The card's entrance spring starts late when the renderer stalls on its first frame (animation frames 100 to 125 ms long were logged right after the card mounts), so both readings saw the starting position, 20 px low, agreed, and the press landed on the card's header row after the card had risen. A slower renderer makes both races more likely, which is why the rate moved between sessions and rose when the backdrop blur and the wind layer were added.

It is both a test defect and a product defect. The spec pressed before the page was settled, which a person does not do with a mouse, so that half is fixed in the spec: it waits for the dialog to be gone and for the card's own state to say it has stopped (opacity 1, transform cleared), instead of comparing two boxes. The product half is real if small: for the length of the exit, anything pressed on the board lands on the scrim, so the first click after a save is swallowed and a drag started in that window becomes a text selection. `Drawer` now sets `pointer-events: none` on its scrim and panel as soon as it is closed, and a component test holds it. `Modal` wraps its scrim in a full screen container with the same shape, but it leaves in 200 ms and was not measured, so it was not changed.

Measured with the drag spec in isolation, retries off, one change at a time:

| Change | Failures |
|---|---|
| None, the spec as it was | 8 of 12 |
| Wind layer hidden | 3 of 12 |
| Backdrop blur removed everywhere | 6 of 12 |
| Card transform forced to none | 4 of 12 |
| Spec waits for the dialog to be gone | 0 of 16 |
| Scrim made inert from outside (CSS), spec unchanged | 5 of 16 |
| Product fix alone (`Drawer` inert while leaving), spec unchanged | 3 of 16 |
| Spec fix alone (dialog gone, card settled), product unchanged | 0 of 16 |
| Both | 0 of 24 |

Every row except the first, the spec fix alone and the last ran on a copy of the spec that logs the events, whose own baseline was 6 failures in 14 runs over two sets. Rates at 12 to 16 runs are noisy, which is why the wind, blur and transform rows could not be told apart from that baseline and why the earlier attempts concluded nothing. The scrim row leaves 5 failures because the stale box remains; the product row leaves 3 for the same reason. Neither half is enough alone for the product, and the spec's wait is enough alone for the spec, which is the sense in which the spec was at fault. A distance activation constraint was not measured again: it cannot help when the press does not land on the handle, and the earlier result that it made things worse is within the noise of a rate that swung between 1 in 6 and 2 in 3 across sessions.

**P2-6. Drag-and-drop has no concurrency control.** File `front/src/pages/Board.tsx:92-183`.

The optimistic state computation sits outside the try block, no service accepts an `AbortController`, and nothing prevents a second drag starting while the first request is in flight. A late failure from an earlier drag can roll back over a newer already-applied update. This becomes reachable the moment P0-3 is fixed, so it should be fixed in the same pass.

Fixed in Phase 4. A ref holds the move currently in flight and a second drag aborts it rather than racing it, and an aborted move returns without touching state at all, since the newer drag owns the board by then. That is precisely the rollback-over-a-newer-update this finding describes.

Any other failure, including the 409 the server now sends when the neighbours have moved, refetches the board rather than restoring a snapshot. Restoring is wrong for the same reason the original defect is wrong: a snapshot taken before the drag may by now be older than changes that did land.

The arrangement logic came out of the page into `front/src/features/board/arrangeColumn.ts`, which is both the first piece of the feature-sliced structure in section 12 and the only way this was going to be tested. Driving a real dnd-kit drag under jsdom is not practical; a pure function that decides where a card lands and which neighbours that implies is thirteen cheap tests, including the cross-column case that used to always land at the bottom.

One gap stated plainly rather than left implied: the abort guard itself has no automated test. Its correctness rests on a three-line early return and on the end-to-end suite exercising the happy path. Covering it properly needs the drag driven at the component level, which is Phase 5 work.

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

Done. `Board` now carries its own `columns`, copied out of the template when the board is created, and Mongoose assigns them fresh subdocument ids on the way in, which is the whole mechanism: two boards built from one template no longer share a single column id between them. Validating `status` became a single document read as a result. `template` survives as provenance and as the source of the dashboard icon, and was removed from the update whitelist, because repointing a board at another template would now swap an icon and leave every column and every task exactly where they were.

The standing scripts earned their keep here. `authorization.mjs` crashed on the first run after the change, because it was still building a task status out of the template's column ids. That is precisely the behavior the change introduces, caught by a script rather than by a user.

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

Closed in Phase 5c. All four now use the shared `Modal`, which is also where escape handling, focus trapping, focus restoration and a labelled close button live, so the gaps the four copies got inconsistently right are right once. `LegalModal` lost about half its lines to it and `SuccessModal` rather more.

Only the shells moved. `AddMemberModal`'s member list is untouched on purpose: P4-3 singles it out as the one autocomplete in this codebase that was already keyboard operable, and there is nothing to gain from rewriting the part that was right.

**P3-4. The modal shell is reimplemented four times.** `AddMemberModal`, `CreateBoardModal`, `LegalModal` and `SuccessModal` each build their own backdrop, panel, animation and escape handler from scratch. The escape listener is duplicated verbatim three times, and `CreateBoardModal` and `TaskDrawer` simply forgot theirs, which is why escape does not close the task drawer. A single shared `Modal` primitive removes the duplication and fixes the accessibility gaps in one place.

**P3-5. No shared data-fetching abstraction.** Every page reimplements loading, error and unmount-guard state by hand, inconsistently, which is why some pages have error states and others do not. Either a small `useAsync` hook or a proper server-state library is the fix.

**P3-6. Duplication in the small.** `response.data.data` unwrapped at roughly eighteen call sites with no helper, the avatar-with-initials fallback written three times when `SimpleUserAvatar` already exists for it, priority color maps duplicated between `TaskCard` and `TaskDrawer`, two different hardcoded default colors, button styles copy-pasted across five files with no `Button` component, and `connectDB` written three times in the backend.

**P3-7. Missing indexes.** No index on `Task.boardId`, `Board.createdBy` or `Board.members`, all of which are the primary filter in every query that touches them. Cheap to add, and the right time is before there is data volume.

**P3-8. TypeScript discipline.** Eleven `any` casts, six of which cast a field whose correct union type is already declared in the models. Four non-null assertions, two of them on a `boardId` that the same file guards properly elsewhere. `noUncheckedIndexedAccess` is absent from the tsconfig. `typescript-eslint` runs on the non-type-checked preset, so `no-floating-promises` and `no-explicit-any` are both inactive.

**P3-9. Backend layering inconsistencies.** `color.controller.js` and `template.controller.js` skip the service layer. `logger.js` exists and is imported by nothing, while every actual log call uses `console` directly. Authorization lives in middleware for boards and inline in the service for users.

### 5.5 P4, interface, experience and accessibility

The interface is competent and completely generic. It reads as default Tailwind: `blue-600` primary, `gray-200` borders, `rounded-lg` everywhere, uniform shadows, no typographic hierarchy beyond weight, and no visual identity that would distinguish it from any other tutorial Kanban board. There is nothing wrong with any individual screen. There is also nothing memorable in any of them.

**P4-1. The typography system does not exist.** `font-heading` and `font-body` are applied across eight files and roughly thirty-five call sites. There is no `@theme` block, no `tailwind.config` file, and `index.css` is two lines. Under Tailwind 4 an undefined utility is a silent no-op, so every one of those classes does nothing and the entire application renders in the default sans stack. Inter is imported and then never actually bound to anything.

Fixed in Phase 5a. `index.css` now carries an `@theme` block binding both role tokens to Inter, plus a `body` rule so that the far larger number of elements carrying neither class also get it; without that, declaring the two tokens alone would have produced an application in two different typefaces.

Both roles resolve to the same family, which is the faithful fix rather than a shortcut. Inter is the only family the application loads, and the two names record a distinction the design already makes in weight. Introducing a separate display face later is one line here instead of forty edits.

Verified the way the finding was found, on a rendered page rather than in the stylesheet: `e2e/verify/design-tokens.mjs` reads the computed font family off the running application. Against the previous stylesheet all three of its assertions fail, and the middle one reports the symptom in as many words, that the `font-heading` utility is silently ignored.

**P4-2. The board is not a board.** Columns are laid out as `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, so they wrap into rows rather than scrolling horizontally, which stops being a Kanban board at five columns. Each column is pinned to a 600px minimum height with no internal scroll, so on the screenshot from the running application three empty columns occupy the full viewport height while holding nothing, and a busy column will instead grow the page indefinitely.

**P4-3. Accessibility gaps, ranked.** Drag and drop is unusable by keyboard even after P0-3 (see P0-4), and the droppable columns carry no role or label so a screen reader is told nothing. `FormInput.tsx:17` renders a label with no `htmlFor` and threads no `id`, which makes every field in the registration flow an unassociated label and input pair. The owner suggestions in `TaskDrawer` are plain divs with click handlers, unreachable by keyboard, while the near-identical list in `AddMemberModal` does it correctly. The entire priority badge on a task card is `aria-hidden`, hiding real information rather than a decorative icon. No modal traps focus, none restore focus to the trigger on close, `CreateBoardModal` has no dialog role at all, and `SuccessModal` auto-dismisses after two seconds with no way to pause it. `eslint-plugin-jsx-a11y` is not installed, so none of this is caught automatically.

**P4-4. Responsive coverage is thin.** Responsive prefixes appear in four files. There are none in `Column`, `TaskCard`, `TaskDrawer`, `AddMemberModal`, `PageHeader`, `LegalModal`, `SuccessModal`, `RegisterForm` or `FormInput`. The registration name row is a fixed two-column grid with no mobile fallback.

**P4-5. Missing feedback and states.** An empty column renders as blank whitespace with no message. A failed save looks exactly like an idle form. The submit button in the task drawer is disabled with no indication of which field is missing, which is the anti-pattern that made P0-1 invisible for a year. Contrast risk on `text-gray-400` icons and `gray-500` on `gray-200` avatar initials, both below the 4.5 to 1 minimum.

The contrast half is now measured rather than estimated, by `e2e/verify/design-tokens.mjs` against a real element on the running application: `text-gray-400` comes out at **2.6 to 1** against the surface behind it. That fails 1.4.3 for text at 4.5 to 1 and also fails 1.4.11 for the meaningful parts of an icon at 3 to 1, so it is worse than the finding claimed rather than better.

It is reported rather than asserted, deliberately. The colour appears thirty five times across ten files, used for both text and icons, and the right replacement differs per call site: a decorative chevron and a piece of secondary text want different answers. A global swap would be a design change made blind. It belongs with the component migration, and the number is recorded here so that work starts from a measurement.

One trap worth recording, because the first version of that script fell into it and reported 8.31 to 1, which would have closed the finding wrongly. Tailwind 4 states its palette in oklch, so a computed colour reads as `oklch(0.707 0.022 261.325)`. A parser that pulls three numbers out and treats them as channels of 0 to 255, which is what almost every contrast snippet on the internet does, produces a confident and meaningless answer. The script paints the colour onto a one pixel canvas and reads the bytes back instead, which is exact for any colour space the browser accepts.

**P4-6. Product gaps visible from the UI.** The 404 half is closed: an unknown route and a board that is missing, deleted or not the caller's now show a not found page, see 12.6b. The password recovery half is closed: the forgot-password dialog requests a real reset link and `/reset-password` sets the new password, see 12.6b. There is no way to edit or delete a board from the board view, and no member management there either. The footer's emoji decoration went with the footer, see 12.6b.

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

A trap discovered in Phase 4 while changing the type of `Task.order`, and worth knowing before anyone trusts a type check in this repository. **`npx tsc --noEmit` in `front/` checks nothing and exits 0 unconditionally.** The root `tsconfig.json` is a solution-style config: it declares `"files": []` and delegates everything to project references, so the command compiles an empty file list and reports success. The real check is `tsc -b`, which is what `npm run build` runs.

This was not theoretical. A test fixture was left holding `order: 0` after the field became a string, `tsc --noEmit` reported clean, and the error only surfaced when the test ran and the page threw `a.order.localeCompare is not a function`. `tsc -b` catches it immediately. Use `npm run build`, or `tsc -b`, and never the bare `--noEmit` form in this project.

Related: 10 or more source files import from `framer-motion`, which is not a declared dependency. Only `motion` is in `package.json`, and the import resolves transitively. It works today by accident.

**P5-8. Seeds are destructive with no guard.** Both seed scripts call `deleteMany()` with no filter and then insert. `users.seed.js` hardcodes six accounts with weak passwords committed in source. Nothing prevents them from being pointed at a populated database.

## 6. Remediation roadmap

### Status

Phases 0 through 6 are complete, phase 6b is in progress, and phases 7 and 8 have not started. Everything below this block still describes the plan as designed; this block records what has actually landed on the `fix/phase-1-foundations` branch.

Two things are deliberately left open and are not oversights. Three of the line targets in section 12.6 are missed, and 12.6b records the reason for each rather than the number alone. And `FormInput` is gone but the wider half of `P4-3` is not: nothing below a browser catches a label whose content is an expression.

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
| 3, hardening | Done | Fail-fast secrets, CORS allowlist, helmet, rate limits, pinned JWT algorithm, escaped search, upload magic bytes, CSP. Member ids were checked for shape only until Phase 6, see P4-25 |
| 3, sliding session | Done | Two clocks, real revocation via tokenVersion, warning toast, draft persistence, verified live |
| 3, API surface | Done | Dual mount at /api/v1 and /api, opt-in pagination, error code enum, pino with request ids |
| 3, overall | **Done** | Every P1 finding closed, all 11 tripwires flipped, verified live and in production |
| 4, transactional cascade | Done | Single node replica set in development and production, board delete and its task cascade atomic (P2-2) |
| 4, status constraint | Done | status refused unless it is ObjectId-shaped and names a column of that board (P2-9) |
| 4, order is read back | Done | Tasks list in stored order and a reorder survives a reload (P2-3) |
| 4, paused | Paused | Every open decision in section 11.2 is now resolved, see section 11.4. The schema layer goes first |
| 4b, board-owned columns | Done | Columns copied from the template at creation, status validated against the board's own |
| 4b, workspaces | Done | Workspace collection, personal workspace at registration, two-level access with an admin exception |
| 4b, overall | **Done** | Phase 4 resumes against the final schema |
| 4, fractional indexing | Done | order is a server minted key, /move names neighbours, /orders removed (P2-3, P2-5, and the cross-column drop) |
| 4, progress aggregation | Done | Board progress, task counts and the dashboard average all computed (P2-4) |
| 4, drag concurrency | Done | In-flight move aborted by the next drag, failures refetch rather than restore (P2-6) |
| 4, indexes | Done | One compound index on tasks, three on boards, all verified as IXSCAN against the real queries |
| 4, overall | **Done** | P2-6a was left open here and is closed in Phase 6b, see the row below and section 5.3 |
| 5a, accessibility gate | Done | jsx-a11y plus layer rules, vitest-axe on every primitive, an axe ratchet over six live surfaces |
| 5a, design tokens | Done | Inter actually bound, font-heading and font-body stop being no-ops (P4-1) |
| 5c, create board modal | Done | On Modal, Field and React Hook Form. Labels 10 to 6, button-name cleared, region 10 to 6 |
| 5c, task drawer | Done | On Drawer and Field. Orphan labels 6 to 0 application wide, aria-dialog-name cleared |
| 5c, owner combobox | Done | Keyboard operable suggestion list with the combobox pattern (P4-3) |
| 5c, dashboard cards | Done | Cards are containers with a stretched title link. Gate warnings 4 to 2, all on TaskCard |
| 5c, server state | Started | TanStack Query with refetch on focus, dashboard migrated, idle invariant confirmed intact |
| 5c, board page onto queries | Done | Fetching effect gone, optimistic drag writes through the cache, P2-6 guard intact |
| 5c, remaining modals | Done | All four modals on the shared shell (P3-4), success message no longer auto-dismisses |
| 5c, profile onto queries | Done | Fetch, writes and cancel through the cache; a duplicated field mapping removed |
| 5c, create board flake | Done | The defaults are applied per field, so a name typed as the fetch resolves survives. 18 runs, 0 recurrences |
| 5d, owner picker extracted | Done | `features/users/UserPicker` with the resolution on the feature query. `TaskDrawer` 852 to 588 |
| 5d, checklist extracted | Done | `features/tasks/Checklist` owns its sensors and its four edits, 6 tests of its own. `TaskDrawer` 588 to 442 |
| 5d, priority select extracted | Done | `features/tasks/PrioritySelect`, and its selected state now exists in the stylesheet (P4-7) |
| 5d, task form hook | Done | `useTaskForm` owns the values, the errors, the draft and the submit. 10 tests, 6 mutations caught |
| 5d, swatch picker shared | Done | `shared/ui/SwatchPicker` serves both colour pickers. `TaskDrawer` 196 to 163 |
| 5d, drawer reference data | Done | `useColors` and `useBoardMembers` replace two effects that refetched per task. `TaskDrawer` 163 to 121 |
| 5d, drawer shell and form split | Done | `TaskForm` and `useTaskDrawer` in `features/tasks`. `TaskDrawer` 121 to 32, from 852 where this started |
| 5d, dashboard characterized | Done | 15 tests over a page that had none, 8 mutations caught after one test was strengthened |
| 5d, dashboard colours | Done | One board palette request replaces one per board (zero calls to `/colors/:id` in an end to end run) |
| 5d, dashboard totals | Done | `shared/ui/StatTile` and `features/boards/BoardStats`. `BoardDashboard` 475 to 405 |
| 5d, board delete in-flight | Done | The unreachable "Deleting..." state now reads the mutation (P4-8). `BoardDashboard` 405 to 403 |
| 5d, board card extracted | Done | `BoardCard`, `BoardCardMenu` and `useBoardMenu`. `BoardDashboard` 403 to 217 |
| 5d, dashboard composed | Done | `useBoardDashboard` and `shared/ui/EmptyState`. `BoardDashboard` 217 to 140, section 12.5 row closed |
| 5d, failed task save | Done | The board page stopped swallowing the error, so the drawer can report it and keep the draft (P4-9) |
| 5d, board drag extracted | Done | `useTaskDragAndDrop` with 13 tests and 8 mutations caught, P2-6 covered at last. `Board` 344 to 233 |
| 5d, board page composed | Done | `useBoardData`, `BoardColumns` and `shared/ui/LoadingScreen`. `Board` 233 to 153 |
| 5d, profile characterized | Done | 13 tests on a page that had none, 8 mutations caught after one test was strengthened |
| 5d, profile accessibility | Done | Joined date no longer reads Invalid Date (P4-10), avatar upload reachable by keyboard (P4-11) |
| 5a, gate covers the profile | Done | A seventh surface, measured and budgeted. Its first run found a prohibited aria-label in `PageHeader` |
| 5d, profile composed | Done | `useProfile`, `ProfileSummary`, `ProfileForm`, `ProfileActions`, `AvatarUploader`. `Profile` 380 to 66 |
| 5d, add member modal | Done | `features/users/AddMemberModal` over `useMemberSearch`, `MemberSearchResults`, `SelectedMembers`. 335 to 130 |
| 5d, member search retry | Done | Try again refetches instead of clearing an already empty term (P4-12) |
| 5d, task card colours | Done | Resolved by the board and passed in. `colorUtils` deleted with its uninvalidated cache. Zero `/colors/:id` in a full run |
| 5a, legacy a11y list empty | Done | The drag handle is a real button and the priority badge is announced (P4-3). The warn list is deleted and the three rules are errors everywhere |
| 5d, password toggles | Done | `shared/ui/PasswordInput` replaces three copies. Two were rendered off their fields and stacked (P4-13), one had no name |
| 5d, FormInput retired | Done | `RegisterForm` and `ProfileForm` on `Field` and `Input`. `FormInput` deleted, closing its half of P4-3 |
| 5a, rendered layout gate | Done | A standing script asserting a control sits on the field it belongs to, which no layer below a browser can check |
| 5d, login on a form library | Done | `features/auth/LoginForm` on React Hook Form and Zod. `Login` 231 to 61 |
| 5d, auth layout moved | Done | `app/layouts` with `AuthIllustration` and `FeatureItem`. One heading level closed `heading-order` on three surfaces |
| 5d, priority colours shared | Done | `features/tasks/priority` decides them once, in both spellings P4-7 requires (P3-6) |
| 5d, avatar promoted | Done | `shared/ui/Avatar` replaces five hand-written copies and the one-caller component built for it (P3-6) |
| 5d, user menu extracted | Done | `users/UserMenu`, named independently of a breakpoint (P4-15). `UserAvatar` 232 to 45 |
| 5d, create board composed | Done | `TemplatePicker` out, the dialog in `features/boards`. 306 to 264 |
| 5d, create board on the cache | Done | `useColors` and `useTemplates` replace an effect that refetched a palette the dashboard already held |
| 5d, remember me removed | Done | A checkbox nothing read and nothing sent, so ticking it did nothing (P4-14) |
| 3, fifth modal found | Done | The forgot password dialog was the one P3-4 missed. On the shared shell, and scanned open for the first time |
| 5d, section 12.5 | **Done** | Every row closed. Nine pages and modals decomposed, five files deleted outright, eight findings opened and closed |
| 5c and 5d overall | **Done** | Phase 5 is complete. What is left of it is three line targets in section 12.6, each recorded in 12.6b with the reason |
| 6, board layout | Done | Columns are a fixed width in one row that scrolls sideways, each column scrolls inside itself under a fixed header, empty columns say so, an empty board shows a banner with an Add task button, the board page has no footer, by product decision, and fills the viewport under the header. `e2e/verify/board-layout.mjs` measures it at 390, 1024 and 1440 pixels (55 assertions) including dnd-kit auto-scrolling the row while a card is held at the edge |
| 6, move to menu | Done | Every task card has a "Move to" menu, the single-pointer alternative to dragging that WCAG 2.5.7 requires. It runs through the same move path as a drop, `useTaskMover`, so it shares the optimistic cache write, the `/move` request with neighbour keys and the P2-6 in-flight guard. New `shared/ui/Menu` primitive, and `UserMenu` is on it. Keyboard only end to end test, the axe gate scans the menu open |
| 6, keyboard move | Done | The drag handle works with the keyboard across the whole board: Space or Enter picks up, Up and Down move within a column, Left and Right move to the neighbouring column at the same row, clamped to the end of a shorter one, Space or Enter drops and Escape cancels. The target is chosen by position (`keyboardDrag.ts`), not by screen geometry, and a drop goes through `useTaskMover` with the P2-6 guard. Announcements name the task and the column, focus returns to the handle, and the row scrolls to the target column at 390 pixels. Four Playwright tests |
| 6, bottom sheet drawer | Done | `shared/ui/Drawer` is a bottom sheet below the medium breakpoint and the side panel from it up: full width, anchored to the bottom, capped at 90 dvh so the page header stays in view, with a fixed header and footer and a body that scrolls. The task form's Save and Cancel moved into the footer so a long form never carries them off screen. `useMediaQuery` picks the animation axis, `interactive-widget=resizes-content` asks the browser to shrink the layout for the on-screen keyboard, and no drag to dismiss gesture was added. `e2e/verify/responsive.mjs` measures it at 320, 390, 768, 1024 and 1440 pixels (39 assertions) and the axe gate scans it open at 390 |
| 6, responsive coverage | Done | Every main surface is measured at 320, 390, 768, 1024 and 1440 pixels by `e2e/verify/responsive.mjs` (516 assertions, with the drawer): no sideways page scroll, no clipped, off screen or overlapping control, no control under 24 by 24, a readable page title, and no control hidden behind a hover on a touch screen. It found five defects, P4-19 to P4-23, fixed in `PageHeader`, `Modal`, `Checklist`, `BoardCardMenu` and the controls that were too small. The registration name row drops to one column below the small breakpoint. The nine components of section 10.4 are accounted for in 12.6b |
| 6, board soft delete | Done | Deleting a board marks it with `deletedAt` and touches nothing else. Every read and authorization path treats a marked board as missing, the owner can restore it with `POST /boards/:id/restore` for exactly seven days, after which the board answers 404 to a restore whether or not the purge has reached it, and a purge job removes boards past that window with their tasks in one transaction. 28 tests, 11 mutations caught |
| 6, board editing | Done | The owner edits name, description and colour from an options menu on the board page. The dialog shares its fields and its schema with the create dialog, a failed save keeps the dialog open with what was typed, and the edit is written into the board page and the dashboard list without a refetch. The server tells the page the caller's role (`viewerRole`), so a member sees no menu. 25 tests, 9 mutations caught, responsive 516 to 551 assertions |
| 6, board deletion with undo | Done | Deleting a board, from its page or from the dashboard, asks first in a dialog that names it, then shows a toast with Undo that restores it on the server. One hook, `useDeleteBoardWithUndo`, serves both places. The toast is a live region, pauses while hovered or focused (WCAG 2.2.1) and is reachable from the keyboard. 29 mutations caught, responsive 551 to 621 assertions |
| 6, not found page | Done | An unknown address shows a real not found page instead of redirecting to the dashboard, for a signed in visitor inside the app header and for a signed out one on its own, with no bounce to login. A board that is missing, deleted, not the caller's or not an id shows the same page, and a server failure keeps its retry. The tab is titled. Closes the 404 half of P4-6. The axe gate scans three more surfaces (21 to 24, all clean) and the responsive script three more (621 to 721 assertions) |
| 6, card menu by role | Done | Every entry of the board list carries `viewerRole`, resolved by the same `resolveBoardRole` the single board read uses, so the workspace admin rule is in both. The dashboard card renders its options menu for owners only, since both its actions are owner only on the server, and a board with no role gets no menu rather than a guessed one. Closes P4-24. 126 backend tests, 4 mutations on the list and 3 on the card caught |
| 6, board colour validation | Done | `createBoard` and `updateBoard` look the colour id up before writing and answer 400 `VALIDATION_ERROR` when it names no palette entry, so a board can no longer be saved with a colour that reads back as null. The id must also name a `board` colour: a task or column colour is refused the same way. 5 tests, 7 mutations caught. Opens P4-25 |
| 6, mail transport | Done | `mail.service.js` sends through nodemailer over SMTP, configured by `FRONTEND_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`. Development compose starts a Mailpit container (web interface on 8025) and points the API at it. Production refuses to start without `FRONTEND_URL`, `SMTP_HOST` and `MAIL_FROM`. The connection must be TLS: implicit with `SMTP_SECURE`, otherwise STARTTLS is required, and only `SMTP_ALLOW_PLAINTEXT` (set by the development compose for Mailpit, refused in production) lifts it. 17 tests |
| 6, password recovery, backend | Done | `POST /auth/forgot-password` answers 202 with one body for every address and issues the same statements for an unknown one: the same lookup and the same conditional write, which stores a token for a known address and matches nothing for an unknown one. The token is 32 random bytes, stored as its SHA-256 on the user, valid 30 minutes (`PASSWORD_RESET_TTL_MS`). A new request adds a link and keeps the earlier ones until each expires, at most five at a time (`PASSWORD_RESET_MAX_OUTSTANDING`) with the oldest dropped, and inside the per-address cooldown (`PASSWORD_RESET_COOLDOWN_MS`, one minute) it adds nothing and sends no mail. The emailed link carries the token in the URL fragment. `POST /auth/reset-password` consumes the link and every other outstanding one with one `findOneAndUpdate`, applies the registration password rule and bumps `tokenVersion`. A password change also cancels every pending link. 29 tests, 24 mutations caught |
| 6, password recovery, frontend | Done | The sign in page's "Forgot password?" dialog asks for the address and shows a confirmation worded as a conditional, the same for every address the server accepted. A public `/reset-password` route reads the token from the URL fragment, takes it out of the address bar with `history.replaceState`, asks for the new password twice, and on success ends the local session and goes to sign in with a notice. A refused token replaces the form with a way to request a new link. Referrer-Policy is `no-referrer` in nginx and in `index.html`. 29 new unit tests across the dialog, the form and the page, 4 end to end tests through Mailpit, the axe gate 24 to 27 surfaces clean, the responsive script 721 to 811 assertions. Closes the password recovery half of P4-6 |
| 6, member id existence | Done | `addBoardMembers` and `createBoard` (when `members` is supplied) look every id up in `User` before writing and answer 400 `VALIDATION_ERROR` if any names nobody, so nothing is written and the workspace is not touched. The check is all or nothing, and an id repeated in one request counts once. Closes P4-25, and the member id half of P1-9. 5 tests, 5 mutations caught |
| 6, layout and product surface | Done | Every item of the phase has landed. What remains of the product surface is Phase 6b |
| 6b, visual redesign | In progress | Reference design in `docs/design`, nine slices and the decisions in Phase 6b |
| 6b.1, tokens and fonts | Done | The `@theme` block is the single token source and is `static`, so every variable reaches `:root`: semantic colours, the six hues as tint, deep and mid in oklch, navy alpha borders, radii by role, the signature shadows, three easings and six durations. Bricolage Grotesque, Instrument Sans and DM Mono are self-hosted through Fontsource and Inter is gone. nginx names no third party origin for styles or fonts. The text tertiary token is `#5E6B7E`, measured at 5.41:1 on white, 4.99:1 on the ground and at least 4.63:1 on every note tint. `design-tokens.mjs` asserts the families, that each face really loads, the global basics and that contrast (24 assertions), and `csp.mjs` asserts the font files come from the app origin |
| 6b.1, Tabler icons | Done | `@tabler/icons-react` replaces `lucide-react` at all 33 import sites. A `shared/ui/Icon` primitive takes the glyph as `as={IconPlus}` and applies the one stroke width (1.75) and `aria-hidden` by default, hidden unless the glyph carries an `aria-label`, `aria-labelledby` or `title`, because Tabler marks nothing decorative on its own. The template icon helper is `shared/lib/templateIcons`, an explicit table from the stored template icon names to glyphs. The script bundle fell from 1,496.91 kB to 666.38 kB (363.32 to 210.03 kB gzip), see P4-39 |
| 6b.1, one motion package, reduced motion | Done | Every import is `motion/react`, `framer-motion` is out of `package.json`, and the app is wrapped in `MotionConfig reducedMotion="user"`. A `prefers-reduced-motion: reduce` rule in `index.css` collapses every CSS animation and transition to 0.01 ms and plays animations once. `design-tokens.mjs` emulates the preference in a real browser and asserts the collapse and that a dialog still opens and unmounts under it, and with motion on (30 assertions in all) |
| 6b.2, keyframes, buttons and fields | Done | Thirteen keyframe sets and eleven `--animate-bb-*` tokens, the `focus-ring` utility, `Button` (six variants, three heights, loading, press), `IconButton` (three sizes, two shapes) and the field frame shared by `Input`, `Textarea` and `PasswordInput`, with `Field` restyled. The field boundary is `--color-line-control` at 3.34:1 on white, see P4-40. `design-tokens.mjs` grew from 30 to 93 assertions: thirteen colour pairs, every keyframe, the rendered input at rest and focused, the rendered buttons and the keyboard focus ring |
| 6b.2, hues, Chip, SegmentedControl, Switch, ProgressBar, Cover | Done | `hue.ts` (six hues, whole-literal class maps, a pinned `hueFromSeed`, `coverGradient`), the new `edge` step of each hue, and five new primitives with tests and mutation checks. Where the reference fails 3:1 it is darkened: the off switch track and the segmented frame use `--color-line-control` (3.34:1), the selected segment has an ink ring, the progress fill is the hue's edge step (3.26 to 3.57:1 on its track). The gate mounts the real primitives in a real browser and grew to 160 assertions |
| 6b.2, Modal, Drawer, Menu, Toast, ConfirmDialog | Done | The shared surfaces are on the tokens: a blurred navy scrim, radius 26, the modal shadow and the `bbUp` entrance (350 ms on the standard easing, a faster fade-only exit) for `Modal`, the same surface language for `Drawer`, which stays a bottom sheet below `md`, and a dark ink pill at the bottom centre with the wind icon, a translucent action pill and the `bbToast` entrance for `Toast`. `Menu` has its enter and exit back, and a leaving popup is inert and hidden from assistive technology. The easings that `motion` needs are one module checked against the stylesheet by a test. `design-tokens.mjs` reads the rendered dialog, menu, confirm dialog and toast in a signed in browser session and grew to 201 assertions |
| 6b.2, Avatar, SwatchPicker, EmptyState, StatTile, LoadingScreen | Done | `Avatar` is filled with the mid step of a hue chosen by `hueFromSeed` from the user id or, failing that, the name, with ink initials and ring variants; ink on the six mid steps measures 6.66 to 7.35:1, which closes the open Avatar contrast item. `SwatchPicker` outlines a hue swatch in its edge step (3.75 to 4.12:1 on white) and draws the chosen one with the white and ink double ring. `EmptyState` and `StatTile` take a hue and enter on `bbUp` as CSS, with no animation library. `LoadingScreen` is the wind glyph swaying on a gradient mark, with no spinner. 270 gate assertions |
| 6b.2, WindLayer | Done | Streaks and drifting particles drawn from their index by the specification's formulas (`windMath.ts`, pinned value by value in `windMath.test.ts`), at `still`, `calm`, `breezy` and `gusty` (0, 3 and 3, 6 and 9, 11 and 20), in a `light` and a `dark` tone. Pure CSS: React renders it once and nothing changes in the page while it plays. `still` and a reduced motion preference render nothing at all. It is `aria-hidden` and takes no pointer events. The gate counts the elements, the running animations, the clicks that pass through it, and the mutations to the page while it plays (none) |
| 6b.3, the breeze field | Done | `User.breeze` is `still`, `calm`, `breezy` or `gusty`, default `breezy`, and a record written before the field existed reads as the default. It travels in the current user payload (`/auth/me` and the login and registration answers), and `PUT /users/:id` accepts it through the Zod schema and the service whitelist. Only its owner can write it |
| 6b.3, app shell, sidebar, header and navigation panel | Done | Every signed in page sits in `AppShell`, a layout route: the three-gradient ground, a 240 pixel glass sidebar in a 252 pixel column, a 56 pixel header with a breadcrumb and the view's main action, and a content area that scrolls on its own. The document never scrolls, and the board route clips the content area so its columns scroll alone. The sidebar holds the logo and wordmark, Home, the boards as real links with a hue dot and an active state, a plus button that opens the create board dialog, and the account button with the privacy policy, the terms, the author's links and name under it. Below 1024 pixels it is an off-canvas panel opened from a header button, with a focus trap, Escape, scrim, focus return and closing on navigation. The axe gate's `landmark-one-main` budget fell to zero on every signed in surface and `region` to zero on all but the move menu's popup, see 12.6b |
| 6b.3, the Breeze control and the wind | Done | `features/breeze` holds the setting. `BreezeProvider` reads the stored level from the signed in user and writes a choice optimistically through TanStack Query, and `useBreeze` gives `stored`, `level` and `reducedBySystem` to anything below the shell, which is how card sway will read Gusty in slice 6. `AppShell` draws the wind layer over the ground in the dark tone at that level, the logo glyph sways only while there is wind, and the sidebar's Breeze box is a four segment control with the speed hint. A `prefers-reduced-motion` preference holds `level` at still and never touches `stored`, and the box says so in its hint and in the group's name. `SegmentedControl` gained an `xs` size for it. `design-tokens.mjs` grew to 349 assertions |
| 6b.4, the auth screen | Done | Sign in and sign up are one screen with two modes, `pages/Auth.tsx`, chosen by the route (`/login`, `/register`): the switch under the form is a link, so the address always names the mode, and switching moves focus to the new title. `AuthLayout` is a layout route over sign in, sign up and the two reset pages, so the brand panel (gradient, wind layer, postcard with its gradient fallback, a floating trip card and a floating sticky note, the headline, the paragraph and the badge) stays mounted while the form changes, and below 1024 pixels it is not rendered and a small wordmark takes its place. The form has the error banner (an alert, coral tint, the wind icon) and a shake that restarts on every refusal, from `useShake`; reduced motion collapses it with the rest. Forgot it? opens the existing dialog, the reset pages and the terms dialog are on the tokens, `RegisterForm` no longer carries its own copy of the legal dialogs and the screen carries the shell's `LegalLinks`, and the brand headline is a paragraph, which closes P4-26. `Field` gained `labelAside`. No raw palette class is left in the files touched. `design-tokens.mjs` grew from 349 to 378 assertions, among them the brand panel text measured against the pixels behind it (paragraph 6.61:1, meta line 6.37:1, badge 6:1, wordmark 13.52:1, headline 7.3:1, the coral end of the gradient word 3.62:1), see P4-43 and P4-44 |
| 6b, P2-6a | Done | Root cause: the press never reached the handle, because the leaving drawer's scrim caught it and the spec read a stale box. `Drawer` is inert while leaving and the spec waits on the page settling. 0 of 24 failures in isolation, from 8 of 12. Native drag and drop evaluated and rejected, see 12.6b |
| 7, documentation and CI | Not started | The contributing guide is out of scope |
| 8, product growth | Planned | Labels and due dates, notes, column management, profile preferences, Google sign-in, Today's view |

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
  P5 --> P6[Phase 6<br/>Layout and product]
  P6 --> P6b[Phase 6b<br/>Visual redesign]
  P6b --> P7[Phase 7<br/>Docs and CI]
  P7 --> P8[Phase 8<br/>Product growth]
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
| 3, hardening | P1-5, P1-7, P1-8, and the remaining P1-9 items | Done, except member id existence, which landed in Phase 6 as P4-25 |
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
| Validate member ids exist (shape only here, existence closed by P4-25), verify upload magic bytes, escape the user search term | P1-9 |
| Build the sliding session, the inactivity window and the absolute cap, per section 9 | Section 9 |
| Add the per-board role model rather than a boolean membership check, per section 11.2 | Section 11 |
| Add pagination, the `/api/v1` prefix and machine-readable error codes while every route is being touched | Section 11.2 |
| Add request ids and structured logging, pulled forward from Phase 7 | Section 11.3 |

Acceptance: every authorization test written in Phase 2 passes, the exploit in appendix A returns 403 at each step, and the session acceptance criteria in section 9.8 hold.

### Phase 4. Data integrity. Size: M.

Convert the MongoDB service to a single-node replica set, then wrap board deletion and its task cascade in a transaction. Constrain `status` at the schema level once Phase 1 has settled its representation. Read `order` back in `getTasksByBoard`. Replace the broken `progress` virtual with an aggregation and drop `.lean()` from the dashboard query, or compute progress entirely in the aggregation pipeline. Fix the missing `move` argument. Add an `AbortController` to the service layer and a concurrency guard around drag operations. Add the three missing indexes.

Acceptance: deleting a board leaves no orphaned tasks under an injected failure, dashboard progress reflects real completion, and task order survives a reload.

Done, all three, plus the ordering strategy change from section 11.4 and the schema layer that became Phase 4b.

The indexes deserve a note, because declaring one and having a query use it are different claims. There is one compound index on tasks, `{ boardId, status, order }`, which serves the busiest query in the product end to end: the board page's match, its sort and its projection of `order` all come out of it without touching a document, and it also covers the three narrower lookups the ordering work added. Boards get three separate single-field indexes rather than one compound, because `visibleBoardFilter` is an `$or` over `createdBy` and `members` with `workspaceId` `$and`-ed across it, and MongoDB uses one index per `$or` branch, so a compound index would serve one branch and leave the other scanning. All of them were checked with `explain()` against the real query shapes on the running database, and every one reports `IXSCAN` rather than `COLLSCAN`.

### Phase 5. Architecture. Size: L.

Order correction, see sections 10.1 and 12.7: this phase now opens with the design token layer and the accessible primitives, because refactoring components before they exist means refactoring them twice. Section 12 is the full component architecture, including the target structure, the primitive layer justified by duplication counts, and the per-file decomposition map. Phase 5a, the primitives and tokens, is additive and may start immediately in parallel with Phase 1. Phase 5c, the migration, waits for the Phase 2 harness.

Standardize on React Hook Form plus Zod across every form. Extract a shared `Modal` primitive and migrate all four modals plus the drawer onto it. Extract a data-fetching hook, or adopt a server-state library, and migrate every page onto it. Break `TaskDrawer`, `BoardDashboard`, `Profile` and `Board` into container and presentational pairs with the fetching and validation lifted into hooks. Extract `Button`, the response unwrapper, the priority map and the color constants. Consolidate the three `connectDB` copies and route `color` and `template` through the service layer. Wire up `logger` or delete it. Tighten the tsconfig and move `typescript-eslint` to the type-checked preset, then clear the resulting `any` casts.

This is the largest phase and the most divisible. It should be a chain of small pull requests, one concern each.

### Phase 6. Layout and product surface. Size: L.

The design token layer and the accessible primitives moved into Phase 5a and 5b, so what remains here is everything that operates above the component level.

Rebuild the board as a horizontally scrolling column set with a fixed column width, internal vertical scroll per column, and a real empty state, replacing the wrapping grid. Add the single-pointer alternative to dragging required by WCAG 2.5.7, which is the "Move to" menu described in section 10.3, and then the dnd-kit cross-column keyboard coordinates. Make the task drawer a bottom sheet below the medium breakpoint. Add responsive coverage to the nine components that have none, mobile-first. Add the missing 404 page, board editing and deletion from the board view with confirmation and undo, and password recovery.

Password recovery is decided: it is implemented, not removed. That means a reset request that answers the same way whether or not the address exists, a single-use token with a short expiry stored hashed, a reset page that sets the new password, and a bump of `tokenVersion` on success so every existing session is revoked, per section 9. The request route sits behind the same rate limit as the other auth routes. Delivery needs a mail transport, which in development can be a local catcher container rather than a real provider.

The accessibility enforcement gate from section 10.2 should be wired at the start of Phase 5, not here, so that everything built from that point forward is checked as it lands.

### Phase 6b. Visual redesign. Size: L.

The interface works and is accessible, but it reads as generic: it has no visual identity of its own. This phase gives it one, from a reference design: `docs/design/prototype/BreezyBoard.dc.html`, exported from Claude Design, and `docs/design/SPEC.md`, the readable specification of it with every token, component, animation and string. Where this section and the specification disagree, this section wins.

The identity is wind and Patagonia. A cool ground (`#F3F6F9`) and ink (`#0F1B2D`), a palette keyed on six hues (sky, teal, green, sand, coral, lavender) each with a tint, a deep and a mid step, frosted glass surfaces over three soft radial gradients, Bricolage Grotesque for display, Instrument Sans for text, DM Mono for small labels, Tabler icons. Motion carries the theme: an ambient wind layer of streaks and drifting leaves, cards that land with a settle after a drop, deletions that blow away, an undo called "Catch it". The copy speaks the same language ("Landed", "Still air", "Blow it away").

It runs after Phase 6 so it styles the final layout rather than one about to be rebuilt. That costs little because of Phase 5: colour, type and spacing land in the token layer and the `shared/ui` primitives instead of in every feature component. Where a screen needs more than a restyle, that is a finding against the primitive layer and is fixed there.

**What the reference does not decide, decided here.**

| Question | Decision |
|---|---|
| Accessibility gaps in the reference | Not copied. The tertiary grey `#8391A4` measures 3:1 and is darkened until text passes 4.5:1. Every control keeps a visible focus ring, dialogs keep their semantics and focus trap, cards stay focusable, keyboard drag and the Move to menu stay, targets stay at the sizes the responsive gate enforces. |
| Mobile | The reference is desktop only. The sidebar becomes an off-canvas panel below the large breakpoint, opened from a header button. The responsive gate keeps its five widths. |
| Dark mode | Out of scope. Tokens are semantic so it can be added later without touching features. |
| Priority | Kept as low, medium and high, drawn as a chip in the hue system. Labels arrive in Phase 8a and sit beside it. |
| Task editing | A centered modal from the medium breakpoint up, a bottom sheet below it, replacing the side drawer. A task is created by typing its title in a composer at the foot of its column; clicking the card opens the modal for everything else. |
| Ambient motion | The Breeze setting offers Still, Calm, Breezy and Gusty. Still stops every ambient animation, which WCAG 2.2.2 requires for motion that runs longer than five seconds. Breezy is the default, a reduced-motion preference forces Still, and the choice is stored on the user so it follows them across devices. |
| Imagery | The reference has five image slots: the login postcard, the Home photo, the profile cover and two empty-state illustrations. Each renders its gradient fallback until real images exist. The Home photo comes from an image source chosen in Phase 8f. |
| Voice | The wind vocabulary is adopted in interface copy: toasts, empty states, buttons. User data such as column names is never renamed. |
| Board colour | A board's hue is the colour its owner chose, not a hash of its id. The board palette is the six hues of the design system, and the sidebar dot and the Home tile cover use it. Slice 5 implements it. |
| Board width at 1440 | The reference's 292 pixel columns stay and the row scrolls horizontally when four do not fit beside the sidebar. P4-42 is closed as accepted behaviour. |
| Drag and drop engine | dnd-kit stays. The reference's native HTML5 drag and drop has no keyboard model and no announcements. The gap, the column highlight and the landing animation are built on dnd-kit in slice 6, see 12.6b. |
| Fonts and icons | Fonts are self-hosted, so the CSP no longer allows a third-party font origin. Tabler replaces Lucide. One animation package, `motion`, replaces the `framer-motion` and `motion` pair. |

**Slices, in order.**

| # | Slice | Contents |
|---|---|---|
| 1 | Foundation | Colour, radius, shadow, easing and duration tokens in `@theme`, self-hosted fonts, Tabler icons, a single motion package, a global reduced-motion policy. The design tokens gate and the CSP gate are updated in the same commit. |
| 2 | Primitives | `Button`, `Input`, `Field`, `Modal`, `Drawer`, `Menu` (its enter and exit animation returns), `Toast`, `Avatar` restyled. New: `Chip`, `SegmentedControl`, `Switch`, `ProgressBar`, `Cover` (an image with a gradient fallback), `WindLayer`. |
| 3 | App shell | Glass sidebar with Home, Notes (hidden until Phase 8b), the board list, the Breeze control and the account button; a header with a breadcrumb and the view's main action; the gradient ground and the wind layer; the off-canvas sidebar on small screens. |
| 4 | Auth | Login and register as one screen with two modes, the brand panel with the postcard and floating cards, the form with its error banner and shake. Forgot password, reset and the terms dialog keep working, restyled. `RegisterForm` drops its own copy of the legal dialogs for the shell's `LegalLinks`. The brand panel's headline stops being a second `h1`, which closes P4-26. |
| 5 | Home | Greeting by time of day, board tiles with a hue cover, members and progress, the "New board" tile, the board totals. "Up next" and "Pinned notes" join in Phases 8a and 8b. The board palette becomes the six hues: the create and edit dialogs offer them, existing boards and the seed data map their stored colour to the nearest hue, and the tile cover and the sidebar dot (which still uses `hueFromSeed(board._id)`) both read it. |
| 6 | Board | Header with cover, title, progress, member stack and the board menu. Glass columns at 292 pixels, the composer at the foot of each column, the redesigned card, a drop gap while dragging and a landing animation after, "Still air" for an empty column, the empty board hero, the last column drawn as "Landed". The board layout gate takes the new column width. |
| 7 | Task modal | The modal and sheet above, with the header strip, Move to, priority, owner, colour, description, checklist, and "Blow it away" with undo. Unsaved drafts and the failed-save report keep working. `Modal` stops receiving pointer events while it leaves, as `Drawer` does since the P2-6a fix, or the first click after saving lands on its fading wrapper. |
| 8 | Profile | Cover, avatar with upload, About, password change, the "Your breeze" panel, sign out. |
| 9 | Close | Not found pages, loading states, the remaining copy, a final contrast measurement of every colour pair, the plan updated. |

**Nothing that exists today is lost.** Every current capability has a place in the new layout:

| Today | In the redesign |
|---|---|
| Login, register, forgot password dialog, reset page, terms dialog | One auth screen with two modes; "Forgot it?" opens the existing dialog; terms stay in the sign-up mode |
| Sliding session, idle warning, drafts | Unchanged, on the restyled toast |
| Dashboard board cards, totals, create board dialog with template and colour | Home: board tiles, totals in the hero, "New board" tile opening the same dialog |
| Board card menu: add member, delete with undo | The same menu on each tile |
| Board header: edit, delete, members, add task | Board header: menu with edit and delete, member stack with add member, "Add card" focusing the first column's composer |
| Move to menu, keyboard drag, move announcements | Unchanged, restyled |
| Empty board banner with Add task | The empty board hero |
| Task drawer: title, description, priority, colour, owner, checklist, draft, failed save | The task modal, every field kept |
| Profile: summary, form, avatar upload, password change, joined date | The profile page, with password change in its own panel |
| Account menu | The account button at the foot of the sidebar |
| Legal links in the footer | The auth screen and the sidebar foot |
| Not found pages | Restyled |

Acceptance: the axe gate and the rendered layout gate stay green on every surface, every text and control colour pair meets WCAG 2.2 AA contrast by measurement, no capability in the table above is lost, and the change is visible in the tokens and primitives rather than as overrides scattered across features.

### Phase 7. Documentation and CI. Size: M.

A real root `README.md` in ASCII per the formatting standard, a `README_es.md` with Mermaid, an architecture document, an environment variable reference, and an OpenAPI specification generated from the Zod schemas written in Phase 3. A contributing guide is out of scope. Guard the seed scripts against running outside development. Add a CI pipeline running lint, type check, tests and a Docker build on every pull request. Make the health check verify the database connection: `/health` answers ok while the database is down. Graceful shutdown (`startServer.js`), request ids and structured request logging (`logging.middleware.js`) already landed in Phases 1 and 3.

The frontend unit suite flakes when its files run in parallel on a loaded machine (timeouts at the default `waitFor` on a debounce, section 12.6b), and a CI runner is a loaded machine. Before the pipeline gates on it, either run it with `--no-file-parallelism` or remove the timing dependence; raising timeouts is not the fix.

The standing scripts in `e2e/verify` carry 48 fixed waits (`waitForTimeout`), most of them waiting for an animation to finish. That is the P2-6a failure pattern: a fixed wait passes while the machine is fast and fails when the renderer stalls, and it grows riskier as Phase 6b adds motion. Before CI gates on them, each is replaced by a wait on observable state (animations finished, element settled, network idle where it means something), and `page.clock` replaces the waits on timer-driven behaviour, such as the 35 second wait in `idle.mjs` and the debounce waits in `drafts.mjs`. The Playwright specs were converted in the change recorded in 12.6b and are the model for it.

### Phase 8. Product growth from the reference design. Size: L.

The reference design in `docs/design` proposes capabilities the product does not have: the task model has no due date, no labels and a single owner; boards cannot add or rename a column after creation; there are no notes. These are features, not styling, so they are a phase of their own, built directly in the Phase 6b visual language and after the Phase 7 CI exists to guard them. Each sub-phase ships backend, frontend and tests together.

| Sub-phase | Contents |
|---|---|
| 8a, labels and due dates | A board owns its set of labels (name and hue), added and removed from the edit board dialog. A task carries any number of them, chosen in the task modal and shown on the card. A task gets a due date, set from presets (today, tomorrow, in a week) or a date picker, shown as a chip that turns sand when due soon and coral when overdue. Home gains "Up next": open tasks with a due date, soonest first, with a quick complete that moves the task to the board's last column. |
| 8b, notes | A notes module in the sidebar: quick capture, title and body, seven colours, pinning, search, colour filter, an editor modal, delete with undo. Home gains "Pinned notes". |
| 8c, column management | In the edit board dialog: add a column with its name and its position (first, last, or between two named columns), and rename any existing column. The board header's "Add column" opens the dialog on that section. The board title can also be edited in place on the board page. |
| 8d, profile and preferences | Bio and a cover image on the profile. Preferences for due date reminders and a weekly digest, which need scheduled mail jobs on the existing transport. |
| 8e, Google sign-in | OAuth sign-in alongside the password, last because it touches the session model of section 9. |
| 8f, Today's view | The Home photo comes from Unsplash. The backend calls GET /photos/random with query patagonia and orientation landscape once a day, caches the result for 24 hours and serves it to every user from a route such as /api/v1/today-photo, so the access key never reaches the browser and the demo limit of 50 requests per hour is never approached. The image is hotlinked from images.unsplash.com as the Unsplash guidelines require, keeping the ixid parameter, and the CSP `img-src`, which accepts any https origin today, is narrowed in the same change to `'self'`, `data:` and `images.unsplash.com`. The photographer and Unsplash are credited in the postcard caption, with the photo's location when it carries one. Pexels and Wikimedia Commons were the alternatives considered; Pixabay was ruled out because it forbids permanent hotlinking. |

Open questions for the phase, decided when it starts: whether "assignees" replaces the single owner, and whether comments are built or the count the reference shows is dropped.

## 7. Recommended sequence

Phase 1 first, and on its own. It is a few hours of work that turns a broken product into a working one, and it makes every later phase testable by hand.

Then Phase 2, because Phases 3 and 4 rewrite authorization and data shape and should not be attempted without a net.

Phases 3 and 4 can then run in parallel if desired, since they touch mostly different files.

Phase 5 before Phase 6, because redesigning components that are about to be split in half is wasted work. Within Phase 5, tokens and primitives before the component refactor, for the same reason one level down. See section 10.1.

Phase 6b after Phase 6, so the redesign styles the final layout rather than one about to be rebuilt.

Phase 7 after Phase 6b, since documenting the architecture, and taking screenshots of an interface, before it stops changing means writing it twice.

Phase 8 last, because it adds features rather than fixing the product, and the CI from Phase 7 should be guarding every change before the data model grows.

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
| `POST /api/v1/auth/forgot-password` | no | Mail a password reset link | Always 202 with the same body, whether or not the address has an account. Behind `passwordRecoveryLimiter`, which counts successful requests too |
| `POST /api/v1/auth/reset-password` | no | Set a new password with the mailed token | Consumes the token and bumps `tokenVersion`, so every session is revoked. An unknown, expired or used token gives one error, `INVALID_RESET_TOKEN` |

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

**All three layers are in, as of Phase 5a.** The lint layer runs `eslint-plugin-jsx-a11y` plus the dependency-direction rules from section 12.3 written as `no-restricted-imports`. The component layer registers `vitest-axe` globally and covers every primitive. The end to end layer is `e2e/verify/accessibility.mjs`, driving six surfaces including two with a dialog open.

Two of the three are ratchets rather than clean passes, and that is deliberate. The lint layer holds three accessibility rules at warn inside `src/components` and `src/pages`, the directories Phase 5c rewrites anyway, while the same rules are errors in `shared/`, `features/` and `app/`, where all new code lives. The end to end layer records the violation count per surface and fails on anything above it. Neither can get worse, and neither demanded that a linter's installation also rewrite the drag handle. A gate that failed on all the existing debt at once would be switched off within a week.

The gate justified itself three times on the day it went in.

It confirmed the prediction two paragraphs above, word for word: the task drawer reports `aria-dialog-name`, an unlabelled dialog, which nothing else in this repository had ever noticed.

It found a defect no component could have fixed. `index.html` carried `user-scalable=no`, which stops a person pinching to zoom, fails WCAG 1.4.4, and disables the browser's own remedy for every other accessibility problem in the application. One line, and `meta-viewport` cleared from all six surfaces at once.

And it nearly lied. The first measurement reported eleven contrast violations on the login page and four on the dashboard. Every one was an artefact of scanning during the entrance animation: framer-motion animates opacity from zero by writing inline styles, and axe computes contrast against whatever opacity it happens to find, so the count moved between 0, 3 and 11 across consecutive runs of an identical page. The script now waits for animations to settle, after which the count is zero and stays there. A ratchet built on a number that flaps is worse than no ratchet, because the first false red teaches everyone to ignore it. The contrast concern in P4-5 is about icon colours, which is WCAG 1.4.11 and a rule axe does not run by default, so it is neither confirmed nor refuted by any of this.

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

Done, all four, covered by `back/test/workspaces.test.js` and by `e2e/verify/workspaces.mjs` against a running stack.

Two things came out of building it that were not in the design.

The board listing had to be rewritten to mirror `resolveBoardRole` clause for clause, including the admin exception. A listing that is merely close to the per-board check is worse than one that is obviously wrong: boards appear and then answer 403 when opened, or exist and never appear at all, and neither reads as a rule anyone could state. The dashboard totals use the same filter for the same reason.

Adding somebody to a board now also admits them to its workspace. Without it the invitation is inert: `resolveBoardRole` gives no role to somebody outside the workspace, so they would sit in `Board.members` and be refused on every request, which reads as a bug rather than a policy. The consequence is deliberate and should be revisited when workspace management gets a real interface: a board owner who is only a plain member of the workspace can pull somebody into that workspace by adding them to a board.

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

Corrected on extraction: the two are not one component. The picker in the drawer filters a `members` list it is handed, selects exactly one user and writes an owner id; the one in `AddMemberModal` searches the server through `UserService.search(term, boardId)`, accumulates a multi-selection and carries its own loading and error states. They also answer to two different patterns, a combobox over a listbox against a search field over a list of toggles. Serving both from one component means a data source strategy, a cardinality switch and two ARIA shapes behind one name, which is worse than the duplication it removes. What they genuinely share is a debounce and a result row, and neither is worth a shared component. `UserPicker` is therefore the drawer's picker, extracted and named, and `AddMemberModal` keeps its own list, which section 12.6b already singles out as the one autocomplete here that was right from the start.

| Current | Lines | Becomes |
|---|---|---|
| `TaskDrawer.tsx` | 852 | Done, 32 left. `tasks/TaskDrawer` shell, `tasks/TaskForm`, `tasks/Checklist`, `tasks/PrioritySelect`, `users/UserPicker`, `shared/ui/SwatchPicker`, `useTaskForm` and `useTaskDrawer` |
| `BoardDashboard.tsx` | 513 | Done, 140 left. `boards/BoardCard`, `boards/BoardCardMenu`, `boards/BoardStats`, `useBoardDashboard`, `useBoardMenu`, `shared/ui/StatTile` and `EmptyState` |
| `Profile.tsx` | 380 | Done, 66 left. `users/ProfileSummary`, `users/ProfileForm`, `users/ProfileActions`, `users/AvatarUploader`, `useProfile` |
| `AddMemberModal.tsx` | 335 | Done, 130 left. `users/AddMemberModal` over `shared/ui/Modal`, plus `useMemberSearch`, `MemberSearchResults` and `SelectedMembers`. Keeps its own search, see above |
| `Board.tsx` | 348 | Done, 153 left. `tasks/BoardColumns`, `useBoardData`, `useTaskDragAndDrop`, `shared/ui/LoadingScreen` |
| `CreateBoardModal.tsx` | 306 | Done, 264 left. In `features/boards` over `Modal`, `Field`, `SwatchPicker` and `boards/TemplatePicker`. The rest is the draft machinery |
| `RegisterForm.tsx` | 247 | Done, 196 left. On `Field` and `PasswordInput`, in `features/auth` |
| `Login.tsx` | 231 | Done, 61 left. `auth/LoginForm` on React Hook Form and Zod, the inline modal replaced by `auth/ForgotPasswordModal` over `Modal` |
| `UserAvatar.tsx` | 232 | Done, 45 left. `users/UserMenu` over the existing `SimpleUserAvatar`. Moved onto `shared/ui/Menu` in Phase 6, see 12.6b |
| `TaskCard.tsx` | 222 | Colour fetching dropped, 199 left. Priority map still duplicated with `PrioritySelect`, see 12.6b |
| `AuthLayout.tsx` | 167 | Done, 52 left. In `app/layouts` with `AuthIllustration` and `FeatureItem` split out |

`Column`, `Footer`, `PageHeader` and `FormInput` are the four that are already roughly right. `PageHeader` is the closest thing to a real primitive in the codebase and should move to `shared/ui` unchanged.

### 12.6 Page targets

A page should read as composition and nothing else: route params in, hooks for data, primitives and feature components out.

| Page | Now | Target |
|---|---|---|
| `BoardDashboard.tsx` | 140, from 513 | Under 70, not reached. See 12.6b |
| `Profile.tsx` | 66, from 380 | Under 60, six lines short |
| `Board.tsx` | 153, from 348 | Under 80, not reached. See 12.6b |
| `Login.tsx` | 61, from 231 | Under 40, not reached |
| `Register.tsx` | 26 | Unchanged |

The reduction is not deletion, it is relocation. The `handleDragEnd` block in `Board.tsx:92-183` is 91 lines of business logic in a page component, and it is also finding P2-6, the drag concurrency problem. Moving it into `useTaskDragAndDrop` is what makes it testable, which is what makes P2-6 fixable with confidence.

### 12.6b Migration notes

What the first component migration actually taught, recorded as it happens rather than as a retrospective.

**`CreateBoardModal`, onto `Modal`, `Field` and React Hook Form.** Ten characterization tests went in first, against the implementation that was already there, which is what the sequencing below argues for and is the only reason the rest of this entry is short. Its draft persistence is three effects whose ordering is load bearing and documented only in comments; a rewrite that quietly lost one would have looked entirely fine.

The two selection grids became `fieldset` and `legend` around real radio inputs, hidden with `sr-only` and styled through `has-[:checked]:`. That is less code than the button grid it replaced, and it buys keyboard operation, grouping and naming from the browser rather than from anything written here. Two of the ten `label-has-associated-control` warnings were those grids.

The close control moved into `Modal` and `Drawer` as an `IconButton`, whose type demands an `aria-label`. That closes `button-name` for every modal at once rather than four times.

**A regression the unit tests missed and the end to end suite caught.** The first version replaced two effects with a single `reset()` of computed values, which reads as a simplification and is one, except that the effect fires when an async fetch resolves. A fast typist is mid-word by then, and the reset threw their typing away. Every test in the new file waited politely for the data before typing, so all ten stayed green; the Playwright core loop did not wait, and failed. The fix is that anything already in the form wins over both the restored draft and the defaults. It is the same defect as P2-10 in a new place, which is worth stating plainly: the pattern is not "this component was careless", it is "state derived from an async value must be merged, never replaced".

**A day lost to a warning already written down.** Several of the failures chased after that fix were the front container serving the previous build. The Vite hot reload caveat in the working notes says to restart it before believing a browser result, and it cost a full debugging cycle when it was written. It cost another one here, having been read.

**`TaskDrawer`, onto `Drawer`, `Field` and grouped radios.** The biggest component in the application and the one carrying the most debt: six of the ten orphan labels, and the `aria-dialog-name` violation. Both are closed. The drawer's dialog is now labelled by its own title, which is the violation section 10.2 predicted this gate would find, word for word, and the label warnings are at zero across the whole application.

The nine tests that were already here did the work the characterization tests did for the modal, so none had to be written. What they needed was query changes, not assertion changes, and one assertion genuinely improved on the way: the selected colour used to be asserted by looking for `ring-2` in a class string, and is now asserted with `toBeChecked`, which is both sturdier and what a screen reader actually reports.

Its validation state machine was deliberately left alone. `isFormValid` and the `errors` object are where P0-1 lived, and mixing a shell swap with a rewrite of the thing that broke for a year would make both harder to judge. React Hook Form can come later on its own.

**A visually hidden radio is clicked by its label, not by itself.** Three end to end selectors broke on this and the error is worth knowing: Playwright resolves `getByRole('radio')` to the `sr-only` input, which is a clipped one pixel box, and refuses to click it because the container intercepts the pointer. That refusal is correct, and so is the markup: a real person clicks the swatch, which is the label. `page.locator('label', { has: page.getByRole('radio', { name }) })` is the faithful simulation. Reaching for `check({ force: true })` instead would have passed while proving nothing about whether a person can click it.

**The owner suggestions became a combobox.** They were a stack of divs with click handlers, reachable by mouse and by nothing else, which is what P4-3 records alongside the observation that the near-identical list in `AddMemberModal` already did it correctly. The input now carries `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`; the list is a real `listbox` of `option` elements; arrow keys move the highlight and wrap, Enter takes it, Escape dismisses the list without discarding what was typed. Focus never leaves the input, which is what the pattern asks for and what stops the typing being taken away from the person doing it. Six tests cover it and all six fail against the previous markup.

One `eslint-plugin-jsx-a11y` rule is disabled on exactly one line for it, with the reason written next to it. `click-events-have-key-events` wants a key handler on whatever is clickable, and an option in a combobox is never focused, so a handler there could not fire. Following the rule would make the component worse. That is the only kind of reason worth silencing one for, and the alternative, restructuring until a rule is satisfied, is how components end up with keyboard handlers nothing can reach.

**A fragile end to end locator, made dangerous by the fix for the thing it was working around.** Several intermittent failures in this phase were `page.getByLabel(/board name/i).or(page.locator('input').first())`, the fallback dating from when that label was not associated with anything. It was still there after `Field` gave the field a real label, and the symptom was the create button staying disabled forever, which reads as a product defect and was diagnosed as one twice, once wrongly attributed to the development container serving a stale build. Removing the fallback, at all four sites, removed the failures. The mechanism is inferred rather than proved: the fill was landing somewhere other than the title. The lesson stands either way, that a workaround outlives the problem it was written for and gets more dangerous as the code around it improves.

**The board cards stopped being buttons.** The last two accessibility warnings on the dashboard were `div`s whose only `onClick` was `stopPropagation`, and chasing them found the reason they existed: the whole card was `role="button"` with a `tabIndex` and a key handler, wrapping the options button and its menu. Interactive content nested inside an interactive element is invalid, screen readers flatten it, and every control inside then needs to stop the parent from firing.

The card is a plain container now, and the board title is a real link whose hit area is stretched over the card by an `after:absolute after:inset-0` pseudo element. A mouse keeps the large target, the keyboard gets one link per card instead of a button holding buttons, three `stopPropagation` calls and the imperative `navigate` disappeared, and the options button sits above the stretch on `z-10`.

That stretch is also the risk, and it is invisible to the component suite: jsdom has no layout, so it has no opinion about which element a pointer actually lands on. An overlay covering the card is exactly what would swallow the click meant for the options button. There is now an end to end test for it, which fails against the previous markup.

**`TaskCard` is deliberately left alone.** The same two warnings remain on it and the same fix would apply, except that it is the drag card, P2-6a is still open on it, and a stretched hit area is precisely the kind of change that would alter pointer timing on an interaction whose margin is already too small. Guessing at that component has cost two attempts already. It belongs with the drag work, not here.

**The server state layer.** TanStack Query, with `refetchOnWindowFocus`, a thirty second `staleTime` and retries off. That is the decision from section 11.4 made concrete: no transport, revalidate when somebody comes back to the tab, and a cache whose write path does not have to be a fetch. `queryClient.setQueryData` is that write path, so a Server-Sent Events stream later writes through it and no page changes.

Query keys live in one object in `features/boards/queries.ts` rather than being spelled out per call site. Typing a key differently at one of four call sites shows up as a list that quietly fails to refresh, which looks exactly like having no cache at all and is much harder to find.

`BoardDashboard` migrated first, as the page with the most fetching. Its hand-rolled `refreshData`, called from four handlers, is gone: each write invalidates the two keys it affects, said once. The read error state went with it, since a query already knows whether it failed; the page keeps a separate piece of state only for failures it causes itself.

Retries are off deliberately. The pages have real error states now, and a silent triple retry is how a broken endpoint comes to look like a slow one.

**And the check that mattered most cost nothing, because it was already written.** Every authenticated request renews the session token, so anything that polls quietly turns a fifteen minute inactivity window into a session that never ends. That is the collision section 9.7 warned about, and it is why the transport decision was taken seriously. Focus is a human action rather than a timer: a window nobody touches never regains focus and so never refetches. `idle.mjs` asserts zero API calls across an idle period, and it still reports exactly zero, all the way to the sign-out at expiry. The script written in Phase 3 to protect a property nothing enforces is what proves this design does not break it.

**The board page followed, and the drag proved the design.** Its fetching effect is gone and the optimistic drag update now writes through `queryClient.setQueryData` rather than into component state. That is the external write path the whole decision rested on, exercised every time somebody drags a card, which means it is covered by the existing end to end suite rather than only by intention. A server-sent event would use the same entry point.

The concurrency guard from P2-6 survived intact, deliberately. The abort ref stayed imperative rather than being pushed into a mutation hook, because aborting a superseded request is not something the mutation API expresses well and the behaviour had already been verified. Failures still refetch rather than restoring a snapshot, which is now one call instead of a hand-rolled reload function.

A test helper came out of it, `renderWithQuery`, with a fresh client per call. A shared one carries a previous test's data into the next, which reads as a test that passes alone and fails in the suite, or worse, passes for the wrong reason.

**The remaining three modals, and a success message that stopped vanishing.** `AddMemberModal`, `LegalModal` and `SuccessModal` moved onto the shared shell, which closes P3-4 entirely.

`SuccessModal` is the one worth naming. It closed itself after two seconds with no way to stop it, which P4-3 records and which fails WCAG 2.2.1 plainly: two seconds is not enough for somebody reading with a screen reader, reading slowly, or looking elsewhere when it appeared, and nothing let them ask for more time. A confirmation that vanishes before it is read is the same as no confirmation, except the person cannot tell which of the two happened. The `autoCloseMs` prop is deleted rather than defaulted to zero, so no call site can quietly bring it back, and the message is now in a `role="status"` region so it is announced rather than merely present.

**The layer rule caught its author.** `features/tasks/queries.ts` imported `features/board/arrangeColumn` directly, which is exactly the reaching-into-internals the `no-restricted-imports` rule from section 12.3 forbids, and it fired the first time a second feature existed. The answer was to give `features/board` the public `index.ts` the architecture calls for, not to widen the rule. Worth recording that the rule's whole justification was that a structure nobody can verify automatically decays into a convention, and it proved the point against the person who wrote it, within a week.

**`Profile` onto queries, and a duplicated mapping that was hiding a bug.** Its fetch effect became a query, its two writes became mutations that invalidate the record, and cancel resets from the cache instead of refetching, because the cached record is by definition the last thing the server confirmed and that is exactly what cancel means.

The field mapping from the stored user to the form was written out twice, once in the load effect and once in cancel, and the second copy was missing `createdAt`. Cancelling therefore blanked the joined date until the page was reloaded. One mapping now, used by both.

**The create board flake, and the measurement that found it after four diagnoses had not.** The submit sometimes never became enabled, at roughly one end to end run in three. It is closed, and how it was found matters more than the fix.

Four explanations were tried and were all wrong: a stale development container, a failed colour or template fetch, the fragile `.or(locator('input').first())` selector, and a last-write-wins race between the form library's asynchronous validation and the defaults effect. The fourth was ruled out by sweeping thirteen interleavings in jsdom, where the button enabled every time. Every one of the four was an explanation of why the form would not become valid, and that is why none of them landed.

What ended it was instrumenting the running application rather than reasoning about it. A `data-probe` attribute carrying the component's state, dumped from a Playwright hook at the moment of failure, said the same thing in every failure: colours and templates loaded, one of each selected, no error, and the board name empty in both the DOM and the form state. The field was not failing validation. It was being erased, and nobody had checked the one value the form actually needed.

The cause is `reset()`. It discards the form library's field registry, and a change event that arrives between that call and React re-running the register refs finds no field to record against, so it is dropped in silence; the re-registration then writes the stale empty value back over the typed text. A recorded event log put the defaults effect one millisecond before the keystroke in every failure, which is the window. Merging the typed values inside the `reset()` call cannot close it, because the value that gets lost arrives after the merge has read them.

The fix is that defaults and the restored draft are written field by field, only into fields that are still empty, so a keystroke racing the effect has nothing to collide with. Eighteen runs afterwards, no recurrence; the two failures in that sample are P2-6a, which is unrelated and still open.

Two things are worth carrying out of this. The recorded signal from the previous attempt was accurate and was read too narrowly: setting `isLoading` to true at the start of the fetch made the rate worse because it moves the defaults effect later and widens the window, which pointed at this effect all along. And a probe that reproduces a flake zero times out of twelve is not evidence that the flow is sound, it is evidence that the probe is not the failing path; the instrument belongs in the path that actually fails.

A second defect was fixed on the way and is worth having regardless: a failed colour or template fetch used to log to the console and nothing else, leaving both lists empty. The schema requires both, so the create button was disabled permanently with nothing on screen explaining why. A form that looks entirely ordinary and is dead is the worst shape a failure can take, and it is now an alert with a retry.

**Two flaky tests, both the test's fault.** After the migration the submit button stays disabled until the colour and template lists arrive, because the schema requires both. Two tests clicked it after waiting only for the title input to exist. A click on a disabled button is a silent no-op with no retry, so under load the failure read as "the parent was never called" and looked like a product defect. Waiting for the button to be enabled fixed both. Worth noticing that the underlying experience is genuinely poor, and is P4-5: a submit disabled with no indication of why.

**P4-7, a selected state that was never generated.** Found while lifting the priority group out of the drawer, and confirmed against the compiled stylesheet rather than by reading the markup.

This finding was first written down as P4-6, which section 5.5 had already given to the product gaps visible from the interface. Renumbered here rather than left as two findings under one name.

The three priority chips composed their selected styling at runtime, as `has-[:checked]:${priority.color}` over a value holding `bg-green-100 text-green-800`. Tailwind generates a rule only for a class it can read in the source, so `has-[:checked]:bg-green-100` named a rule that was never emitted. The build output confirms it: the literal `has-[:checked]:` classes used by the two swatch pickers are all present, and the three priority ones are absent entirely.

The composition also splits wrongly. Only the first of the two classes inherits the variant, so `text-green-800` applied unconditionally. The result is three chips permanently tinted and no indication of which one is selected, which is the same failure as having no selected state at all.

Every class is written out in full now, and the six rules appear in the build. The guard is an assertion about class names, which is normally the wrong way to test a selection and is the only way here: the markup was always correct and the missing piece was a stylesheet the test environment does not consult.

**`useTaskForm`, and the one property that had to survive it.** The form's state machine moved out of the drawer into `features/tasks/hooks`, which takes `TaskDrawer` to 196 lines from 852. The hook owns the values, the errors, the draft and the submit together, and owning them together is the point: four effects write to these values, and splitting the writers between a hook and its caller is what produces the defect this form has already hit twice, where one writer rebuilds the whole object over what another just put in it.

The submit gate reads error values rather than error keys. That is the whole of P0-1, the regression that made task creation impossible for a year: clearing an error writes `undefined` under a key that stays in the object, and choosing an owner is what creates that key, so a gate counting keys is closed by the very act of completing the form. Reintroducing the key count fails five tests, which is how the move was judged safe rather than by reading it.

Six mutations were run against the extracted hook and all six are caught: the key count, the two whitespace trims, the single member preselect, the guard that stops a hand picked colour being overwritten, and the stored colour resolution. Two of them were not caught on the first attempt, and both failures were in the tests rather than in the code. One asserted on a form with several fields blank, so removing a single check still left the form invalid and the test green. The other passed an empty colour list, so the effect it meant to exercise returned before doing anything. A test that cannot fail is worse than no test, because it is counted.

One inconsistency is preserved rather than fixed, and named in the hook: only the owner clears its own error as it changes, while the title and the description keep theirs until the next submit. That is an accident rather than a rule, and changing it belongs with a validation rewrite, not with a move.

**`SwatchPicker`, and the cost of a second integration mode.** The two colour pickers are now one primitive, which takes the drawer to 163 lines from 852 where this decomposition started.

They diverged on three axes and only two of them mattered. The layout differs, a row of round swatches against a four column grid of bordered cards, and that is a `layout` prop. The name is visible in the grid and carried for assistive technology alone inline, which follows from the layout. The third was the real question: the drawer's picker is controlled, and the modal's was registered directly with the form library, so a single component would have needed to accept either a value and a change handler or a spread registration, and an API that takes one of two shapes is an API that can be given both.

The answer was to keep the primitive controlled and reach it through the form library's `Controller` at the registered call site, which is what that wrapper exists for. One mode, both callers, and the field stays registered so the per field defaults pass that fixed the create board flake is untouched. Measured afterwards rather than assumed: ten end to end runs, no create board failure.

This is the opposite conclusion to the `UserPicker` entry above, and the difference is worth stating because the two look alike. Merging the user pickers would have needed a data source strategy, a cardinality switch and two ARIA patterns, which is three kinds of behaviour behind one name. Merging the colour pickers needed one layout prop and one wrapper at one call site, and the accessible shape, a fieldset with a legend over radios whose labels are the controls, is identical in both. A shared component is worth it when what differs is presentation and what is shared is behaviour, and not when it is the other way round.

The accessibility gate caught its author again, as it did during the query layer migration. The first version put `aria-invalid` on the radio inputs, which that role does not support, and the lint rule refused it before any test ran.

**The drawer's two fetching effects, and what the query migration had missed.** `TaskDrawer` still held two hand written `useEffect` fetches, one for the task colour palette and one for the board's members, after the pages around it had already moved onto the query cache. They were 43 lines of the drawer, which is why they read as a line count problem, but the defect underneath was a cache scope: both effects listed `task` as their dependency, so pointing the drawer at a different task refetched both lists. The colour palette is the same list for every task in the product and the member list belongs to the board, so neither request could return anything new.

They are now `features/colors/useColors(type)` and `features/users/useBoardMembers(boardId)`, each keyed on the scope its data actually has. Working through six tasks on one board costs one palette request and one member request rather than six of each. The colour palettes carry `staleTime: Infinity` because they are seeded reference data that no part of the product writes to, which also means a window regaining focus does not revalidate them.

`useColors` takes the type as an argument rather than existing as a `useTaskColors`, because `CreateBoardModal` asks the same endpoint for the board palette and is the next caller. That is also the one thing the drawer's own tests cannot show, since the drawer only ever asks for one type: a key that ignored its argument would hand the second palette the first one's colours and every drawer test would stay green. It has its own test for that, and the mutation confirms it.

Three mutations were run and all three are caught: the colour key dropping its type, the member key dropping its board id, and the member query enabled unconditionally. The three tests behind them are new, and the two that matter were written against the old code first and watched to fail with two calls where one was expected.

One thing in the result is not covered by a test and is named here rather than left to be rediscovered. The two lists fall back to module level constants instead of a `[]` literal, because `useTaskForm` keys three effects on them and a fresh literal gives each render a new identity. Those three effects all return at their first guard on an empty list, so today the difference is a no-op rather than a defect, and no test distinguishes the two. It is written that way because this exact trap already cost a debugging cycle in the hook's own tests, where an object literal in a `renderHook` callback reset the form on every rerender.

**The shell and the form, which closes this row.** `TaskDrawer` is 32 lines and lives in `features/tasks` with everything it once contained. It reads as a title and a composition, which is the target section 12.6 sets for a page and is worth holding one level below one too. The fields are `tasks/TaskForm` and the two lists plus the form state machine are `tasks/useTaskDrawer`.

The hook exists rather than the shell calling the three hooks itself, and the reason is the rule already in the lint config: a component renders and does not fetch. Which lists the form needs and how they are keyed is a question about the feature, so a component that composed them would be answering it in the markup. The split also moved the file out of `src/components`, which is the directory holding the legacy accessibility warnings, so the three rules held at warn there are errors for this code from now on. It passes them.

`TaskForm` is not quite presentational and the distinction is worth keeping honest: `UserPicker` inside it resolves the name of an owner the member list does not contain, and owns that query itself. A test asserting the form renders with no query cache in scope was drafted and then dropped, because it would have been asserting something untrue.

**P4-8, an in-flight state that nothing could ever enter.** Found while extracting the dashboard's board card. The delete item in each board's menu carried `disabled={isDeleting}` and a label reading "Deleting..." when that was true, and `isDeleting` compared the board's id against a `deletingId` piece of state that only ever had `null` written to it. The mirror was never filled, so the disabled state and the label were unreachable and the menu item looked idle throughout.

Deleting a board cascades to every task on it and is not fast. With nothing on screen to say it started, the only thing left to do is click again, and each click starts another cascade against the same board.

It now reads the mutation's own in-flight state and the id it was called with, so the second piece of state is gone rather than corrected. That is the general form of the defect: the fact was already held by the mutation, and copying it into a neighbouring `useState` created a second version that had to be kept in step with the first and was not. Two tests cover it, one that the item disables and says so, and one that the other boards stay deletable, which is what makes the id comparison load bearing rather than decoration.

What made the split safe to judge was one characterization test written before it. Choosing between the two titles is the only decision the shell keeps, and nothing pinned it, so a split that dropped the title entirely would have left all eighteen other tests in that file green. It is asserted as the dialog's accessible name rather than as text, which is what assistive technology announces and what section 10.2 records as having been missing here.

**P4-9, a failed task save that looked exactly like a successful one.** Found while reading `Board.tsx` before decomposing it, and it is the worst defect this migration has turned up so far, because the outcome is lost work rather than a wrong pixel.

The task drawer knows how to report a failed save. Its hook wraps `onSave`, catches, and sets a message the drawer shows while staying open and holding what was typed. There is a test for it, and that test passes, because it hands the drawer an `onSave` that rejects.

The real `onSave` is the board page's handler, and it wrapped everything in a try/catch that logged and returned normally. A rejected create therefore reached the drawer as a resolved promise, so the drawer cleared the saved draft and closed itself. The person is returned to the board with no message, no task, and no draft to recover. The drawer's entire error path was unreachable in the running application.

This is the same shape as P0-1 and worth naming as a class: a guard that is tested in isolation and never reached in composition. The unit test proved the drawer behaves correctly when told about a failure. Nothing proved anything ever told it.

The handler no longer catches. The write throws, the drawer reports it and keeps itself open, and closing on success is the drawer's job through `onSaved` rather than something both of them did. One thing is still swallowed on purpose: the follow-up move that sends a fully checked task to the last column. That runs after the save succeeded, and answering "the task could not be saved" because a follow-up failed would be a worse answer than saying nothing.

The test for it goes through the page rather than the drawer, because the seam is the defect. A drawer level test cannot see it, which is exactly how it survived this long.

**`BoardDashboard`, and the target this one did not reach.** The page went from 513 lines to 140 over five commits, and every component this section named for it exists: `BoardCard`, `BoardCardMenu`, `BoardStats`, `shared/ui/StatTile`, `shared/ui/EmptyState`, plus `useBoardMenu` and `useBoardDashboard`. Section 12.6 asks for under 70 and 140 is not that, so the number is recorded as it is rather than rounded into a claim.

What the remaining 140 are is worth writing down, because the gap is not more of the same work. Roughly fifty-five are the page's own composition, which is what a page is for. Twenty-five are two full-page states, one for loading and one for an unreadable read. Twenty-five more are three buttons written out by hand, where `shared/ui/Button` exists and its primary variant was harvested from this very page. The rest are imports and the two modal call sites.

The buttons are a real migration and were left out on purpose: two of the three match the primitive exactly and the third, the reload button, is `px-4 py-2` where the primitive is `px-6 py-3`, so migrating it changes a size that nothing asserts. That belongs in a change about the button surface, judged on its own.

The two full-page states are the more interesting one. `Board.tsx` has the same pair behind the same `min-h-screen bg-gray-50 flex items-center justify-center` wrapper, which is four instances across two pages, so a primitive for them is justified rather than speculative. It was still not written here: it would save the dashboard twenty lines and leave it at 120, so it does not reach the target either, and building it while only one of the two pages can use it repeats the mistake this section already records under `UserPicker`. It is worth doing when `Board.tsx` migrates, with both callers in hand.

Two things the decomposition surfaced that were not decomposition. The first is P4-8 above. The second is the board colours: the page resolved each board's colour with a request of its own, through the same `resolveColorValue` that `TaskCard` still uses per card, where `GET /colors?type=board` returns the list whole. It now reads that one palette through `useColors`, which is why that hook takes the colour type as an argument, and an end to end run against the live stack makes zero requests to `/colors/:id`. `TaskCard` has the same defect and keeps its own row in section 12.5 rather than being pulled into this one.

**P4-10 and P4-11, found on a page the accessibility gate was never pointed at.** Both were in `Profile.tsx`, and the reason they survived is the more useful half of the entry: section 10.2's gate scans six surfaces and the profile page is not one of them. A surface nobody scans is a surface nobody knows about, so it is scanned now and its measured numbers are the baseline in `e2e/verify/accessibility.mjs`.

P4-10 is a record with no joined date reaching `new Date('')`, which formats as the literal string "Invalid Date". Every other missing field on that page has a fallback. This one printed the error to the person, and the field now reads "Unknown" like the location beside it.

P4-11 is the avatar upload being mouse-only. The file input was hidden with Tailwind's `hidden`, and the compiled stylesheet confirms that is `display:none`, which removes a control from the focus order entirely. It is `sr-only` now, which hides it while leaving it focusable, with the focus ring drawn on the label through `focus-within`. The accessible name moved off the label and onto the input at the same time: it had been on the label, so the control itself had no name, which did not matter while nothing could focus it and does now.

That second one is asserted as a class name rather than by tabbing, and the reason is worth repeating from P4-7: jsdom loads no stylesheet, so `hidden` has no effect there and a focus test would pass just as happily against the broken version. The difference between the two techniques exists only in the compiled CSS, so the compiled CSS is where it was checked and the class is what the test can hold.

Extending the gate also caught a third thing on its first run: `PageHeader` wrapped its action area in a `div` with no role carrying `aria-label="page actions"`, which ARIA prohibits. It had never fired because this is the first scanned page that renders that header with an empty action area. The label is gone, which is why `aria-prohibited-attr` has no line in the profile baseline rather than a zero.

**`Profile`, the closest any page has come to its target.** 380 lines to 66, against a target of under 60. `useProfile` owns the record, the form over it and the two writes; `ProfileSummary`, `ProfileForm`, `ProfileActions` and `AvatarUploader` own what is drawn.

Two things here were not moves. The save and cancel pair was written out twice, once in the page header and once at the foot of the form for a narrow screen, and the two copies had drifted: the header's save ignored `isDirty` while the footer's did not. One `ProfileActions` now serves both, and it takes an `onSave` only for the pair outside the form, so the one inside it stays a real submit and pressing Enter in a field still works.

And the summary takes the form's current values as one object rather than seven named props. That reads as line count and is not: this card updates as the fields are edited, so the form's values are what it shows, and naming them one at a time described it as a view of the stored record, which it is not.

Twelve mutations were run across the four new files and eleven were caught first time. The survivor made `save` answer that it worked after being refused, which shows the confirmation and the failure side by side; the test asserted the failure half and never checked that the confirmation stayed away. It does now.

Six lines short of the target, and the last six are not worth inventing a component for. What is left is the header block, the two card call sites and the success modal, which is a page composing its parts.

**`AddMemberModal`, and P4-12, a retry that could not retry.** 335 lines to 130, over `useMemberSearch`, `MemberSearchResults` and `SelectedMembers`. The row in section 12.5 above already records why this modal keeps its own search rather than sharing `UserPicker`, and nothing here changes that reading.

The search moved onto the query cache, and the point is what came out rather than what went in. A request id and a mounted flag were tracking which answer was allowed to win, by hand. Each term is its own cache key now, so a slow search resolving late lands under a key nobody is reading, and both refs are gone. The guard had never been tested either; it has a test now, written before the move and passing on both sides of it.

P4-12 came out of a surviving mutation rather than out of reading. "Try again", offered beside a failed search, called nothing but a function that cleared the search term. The search that fails most often is the one that runs as the modal opens, where the term is already empty, so clearing it changed no state, moved no query key and ran nothing: the button did nothing at all in precisely the case it exists for. It refetches now.

That is the second defect this session found by writing a mutation rather than by reading code, and both were the same shape: an assertion that a control exists, with nothing asserting it does anything. The mutation that deletes the handler is the cheapest way to find them.

The decomposition also dropped a duplicate Escape handler. The modal registered its own window listener calling the raw `onClose` prop, while the shared `Modal` underneath it already handles Escape and calls the handler that resets the selection first. Both fired, and the component's own one bypassed the reset.

**`Login`, a fifth modal P3-4 never counted, and two more unreachable branches.** 231 lines to 61, with the form in `features/auth/LoginForm` on React Hook Form and Zod. `RegisterForm` moved into the same feature, so auth is one place now.

The forgot password dialog was written out by hand inside the login page: a backdrop, a panel, an animation and a close button, with no dialog role, no accessible name, no focus trap, no focus restoration, no Escape and a close button with no name. P3-4 counted four copies of the modal shell and this was a fifth. It is `auth/ForgotPasswordModal` over the shared `Modal` now, and the gate scans it open for the first time: its only reported violation is the login page's own heading order showing through from behind it, so the dialog contributes nothing of its own. That is the argument of P3-4 in one measurement.

The first unreachable branch is the custom "Email is invalid" message. The field was `type="email"` on a validating form, so the browser refused the submit before the handler ran: the person saw the browser's own wording with none of the page's styling, and the line that wrote the page's message could never execute. Confirmed in a real browser, where the field reported `valid=false` with the browser's text while the page's message never rendered. The form carries `noValidate` now and Zod owns every message, which is the only way the two can agree.

The second is "Forgot password?", which was a `Link to="#"` whose own handler cancelled the navigation it had just asked for. It opens a dialog on this page and goes nowhere, so it is a button.

**P4-14, a control that does nothing.** The "Remember me" checkbox on the login page appears four times in that one file and nowhere else in the frontend or the backend. It is uncontrolled, nothing reads it, nothing sends it, and ticking it has no effect anywhere in the product. Removed, on Kevin's call, rather than implemented. A session that outlives the tab is a decision about the session contract in section 9 and its two clocks, not a checkbox on a form, so shipping the checkbox would have meant promising something the session design has not been asked for. Leaving it was the one option that was certainly wrong.

**The create board dialog, and a palette fetched twice on one screen.** The dialog loaded its colours and its templates with an effect of its own, and the colours it asked for are the list the dashboard behind it already holds in the cache. Measured before the change: one request for the board palette when the dashboard loads, and a second when the dialog opens, for the same list.

Both lists come from the cache now, and the measurement after says what was wanted. The dashboard still makes its one palette request. Opening the dialog fetches the templates and does not touch the palette. Reopening it fetches nothing at all.

The templates query is gated on the dialog being open, and that gate is the interesting half. Ungated it moved the request earlier rather than removing it: the dialog is mounted closed on every dashboard load, so every visit paid for a list most visits never look at. The effect it replaced had that right with its `if (open)`, and the first version of this migration quietly lost it. The measurement is what noticed.

One defect was introduced by this change and caught by the suite written before it. The effect that applies the defaults and restores the draft marks itself done once it has run, and the old code reset that flag whenever the retry counter changed. Splitting the fetch out dropped the reset, so a retry landed the data and changed nothing: the colour and template arrived, the effect refused to run, and the create button stayed disabled with no visible reason. It now refuses to mark itself done until both lists are in hand, which says the intent directly and needs no retry signal.

**`AuthLayout`, and one heading level that was three violations.** The layout moved to `app/layouts` with its two nested components split into `AuthIllustration` and `FeatureItem`, which is what section 12.5 asked for. What it also found is better value than the move.

The three feature titles beside the sign in form were `h3` under the layout's `h1`. A jump from h1 to h3 is a level skipped, and that single fact was the entire `heading-order` budget the gate carried on the login page, the register page and the dialog over them. They are `h2` now and all three rules went to zero in one change. Three baseline lines are gone rather than sitting at zero.

Two pieces of dead configuration went with it. Every icon carried both `aria-hidden` and `role="img"`, which is a role on an element nothing can reach; the role is gone and the wrapper is hidden. And `FeatureItem` took a `decorativeSvgAriaHidden` flag that defaulted to false and was passed true at all three call sites, so the default was unreachable and the only thing the prop could ever do was produce an unnamed `role="img"` for whoever forgot it. The icon is simply decoration.

**The priority colours, decided in two files.** P3-6 names the priority colour map as duplicated between the task card and the task drawer. It is `features/tasks/priority` now, and which colour a priority is gets decided once.

The duplication inside that module is deliberate and is the interesting part. It holds the three colour pairs twice, once plain for the card's badge and once as the `has-[:checked]` variant the picker's radios need, both written out in full. Deriving the second from the first at runtime is precisely finding P4-7: Tailwind emits a rule only for a class it can read in the source, so a composed variant names rules that were never generated, and composing from a value holding two classes is worse because only the first inherits the variant. The build output confirms both forms are present for all three colours. What was worth removing is the decision living in two files, not the two spellings of it.

An unrecognised priority normalises to the least urgent in both the word and the colour, rather than the raw value being printed in a colour that means something else. The colour is what anybody scanning a board actually reads, so a badge saying "urgent" in the green that means low is a worse answer than one saying "low".

Two mutations survived the first sweep and both were gaps rather than wrong code: nothing covered an unrecognised priority, and nothing pinned the order the three chips are offered in, so reversing it would have passed.

**The avatar, written five times and already solved once.** P3-6 records the avatar-with-initials fallback as written three times while `SimpleUserAvatar` already existed for it. The count was low: it was hand-written in the user menu twice, in the selected member chips, in the member search rows, and on the profile card, while the component built for the job had exactly one caller.

It is `shared/ui/Avatar` now and the five copies are gone. Two things changed in the promotion rather than being carried across. It takes a name instead of a user, so a shared primitive does not need to know what a user is and the initials rule lives in one place. And it takes a `decorative` flag, because the two uses are genuinely different: an avatar standing alone needs a name, and one with the person's name written beside it must not announce it a second time. Every hand-written copy did one or the other by accident.

Two of the copies drew grey text on a grey circle, which is the avatar half of the contrast risk P4-5 names. They are on the primitive's blue on light blue now. That is a change in the right direction rather than a measured pass, and the contrast of the result has not been measured.

**P4-15, a control with no name on a phone, and the breakpoint nobody scans.** The account control in the page header draws an avatar, a name that is `hidden md:block`, and a chevron. Below the medium breakpoint the name is `display:none` and therefore out of the accessibility tree, the chevron is `aria-hidden`, and the avatar wrapper carried `aria-hidden={!!user.avatar}`, so for anybody who had uploaded a picture the control had no accessible name at all. Measured at 390 pixels, where the button read as the two initials with no avatar and as nothing once one was set.

The gate scans at 1440 by 900 and only there, so every one of its eight surfaces is a desktop. Section 10.4 asks for responsive behaviour and nothing measures it. That is the same shape as the profile page being outside the surface list and the register page's layout being outside any browser: the defect was not hard to see, it was in a place nothing looked.

The fix is a name that does not depend on text a breakpoint can remove: the trigger carries its own `aria-label` naming the person, so the visible name is free to come and go. Verified at 390 pixels with an avatar image in place, where the control is now findable by that name.

Two smaller things went with it. The menu's `aria-labelledby` was written as `buttonRef.current ? undefined : undefined`, which is `undefined` either way, so the menu had no name; it points at the trigger now. And the avatar markup, written out twice in this one component, is the `SimpleUserAvatar` that already existed for it and had exactly one caller. P3-6 records that fallback as written three times; it is written more often than that, and the other call sites are a commit of their own.

**P4-13, two controls rendered in the wrong place, and the gate that could not have caught them.** The register page's two password reveal toggles were positioned with `absolute` inside a parent that was never made `relative`, so both resolved against an ancestor further up the page. Measured on the running application before anything was changed: the password toggle at y=441 against a field spanning 459 to 509, the confirm toggle at y=440 against a field spanning 560 to 610, and the two of them one pixel apart. They were stacked on each other, above the first field, and neither was on the field it belonged to. Whichever painted last took every click, so the control a person could see and press toggled the other field.

This is worth more than its own fix, because of what could not see it. The markup is correct, the classes are correct, the behaviour is correct, and every component test passes: the defect exists only once a browser computes layout, and nothing below a browser does. The static lint cannot see it, axe does not report it, and jsdom has no layout at all.

So it has a standing script now, `e2e/verify/rendered-layout.mjs`, asserting that a control sits inside the box of the field it belongs to. Containment rather than coordinates, so a redesign does not break it, with two pixels of slack because a control stretched with `inset-y-0` lands on fractional coordinates. It failed four of four before the fix and passes four of four after.

The fix is `shared/ui/PasswordInput`, which section 12.5 asked for by name. Three hand-written copies existed: two on the register page with the positioning defect, and one on the login page that was positioned correctly and had no accessible name at all, which is the `button-name` the gate was carrying on that surface. All three are gone and the login baseline drops a line.

`RegisterForm` moved onto `Field` and `Input` in the same change, and `ProfileForm` followed, which leaves `FormInput` with no consumers. It is deleted. That closes the `FormInput` half of P4-3 recorded above: labels there are associated through `Field`'s `useId` and `htmlFor` rather than sitting beside an input hoping a placeholder names it.

**A measurement about P2-6a, recorded because it is new.** The drag test failed once during this work, by its own assertion, and then passed eight times out of eight run on its own with retries off. The failures seen this session have all been inside a full run of the spec rather than in isolation, which points at state carried between tests or at contention rather than at the sensor alone. The drag handle became a real button in this session, so it was worth checking whether that moved the rate; eight clean runs say it did not make it worse, and cannot prove it made it better.

**The legacy accessibility list reached zero and was deleted, which is what it was for.** The lint config held three rules at warn for `src/components` and `src/pages`, with a note saying each file drops out as it migrates and the list is expected to reach empty and be deleted. It has, and it is. Those three rules are errors everywhere now and nothing violates them.

What was left in it was the task card's drag handle, a div carrying a role. As a div it relied on dnd-kit to supply the role, the tab stop and the key handling through a spread, none of which static analysis can see, so it sat under two warnings that could not be answered without rewriting it. It is a `button` now. It needs none of those to be reachable, and dnd-kit's attributes sit on top unchanged, in the same spread-last order that finding P0-3 is about.

P4-3 closed its last visible item in the same change. The whole priority badge was `aria-hidden`, which hid real information rather than a decorative icon: it is the only place a task shows its priority, so a card said nothing about it at all. The badge is exposed, the icon inside it is hidden instead, and the word gains a subject carried for assistive technology only, so it still reads as one word on screen.

One piece of P4-3 stays open and is worth naming precisely, because neither gate catches it. `FormInput` renders a label with no `htmlFor` and threads no id, so every field in the registration flow and on the profile page is an unassociated label beside an input. The static rule does not fire on it: the label's content is a `{label}` expression, and the rule cannot decide statically whether a control is nested inside one. A probe with a literal label in the same file tree does fire, so the rule works and this specific shape is invisible to it. Axe does not report it either, because each of those inputs carries a placeholder and a placeholder counts as an accessible name of last resort, which is exactly why relying on one is poor practice: it disappears the moment somebody types. Closing it means threading an id through the primitive, and it belongs with the `RegisterForm` and `Login` rows rather than here.

**The unit suite flakes under CPU contention, and this is what was measured.** Worth recording before someone spends a session chasing it as a regression.

Running `npm test` while the Docker stack was rebuilding produced four failures in one run and one in the next: two task drawer submit gating cases, the board page create case, and `CreateBoardModal`'s "does not throw away a board name the form has not recorded". Three of those failed at almost exactly five seconds, which is the default `waitFor` timeout, on paths that wait on the owner combobox's 220 millisecond debounce against a real timer.

The measurements. Serially, with `--no-file-parallelism`, the suite passed every time. In parallel on an otherwise idle machine it passed six runs in a row. `CreateBoardModal.test.tsx` alone passed five in a row. The suite grew from fifteen files to eighteen and from 113 tests to 167 during this work, so the parallel load is higher than it was.

The `CreateBoardModal` one deserves its own line because it failed in 119 milliseconds rather than timing out, which makes it an assertion rather than a slow wait. That test writes `input.value` directly, bypassing React, because the race it models is a keystroke the form has not recorded yet. Whether the raw value survives depends on which renders happen before the assertion, so it is legitimately sensitive to scheduling. It is not obviously wrong, and loosening it would remove the guard the previous session added for the create board flake. It is left as it is, with the behaviour written down here.

Nothing was changed for this. Raising a timeout is the usual wrong answer to a flake, and the suite is stable on an idle machine. If it starts failing without contention, that is new information and this entry is the baseline to compare against.

**`Board`, and what moving the drag logic actually bought.** The page went from 348 lines to 153: `useTaskDragAndDrop`, `useBoardData`, `tasks/BoardColumns` and `shared/ui/LoadingScreen`.

This section predicted that moving `handleDragEnd` into a hook is what makes it testable, and that is the one claim here worth checking rather than repeating. It was right. The ninety lines had no unit coverage of any kind, and could not have any: reaching them meant simulating a pointer drag over a layout jsdom does not compute, so the only thing exercising them was a single end to end run. The hook takes the two event shapes as plain objects, and thirteen tests now cover every branch, including two that were findings before they were code. P2-6, that a second drag aborts the first and the abandoned request must not touch the board afterwards, had never been asserted anywhere but in the comment explaining it. Eight mutations were run against the hook and all eight are caught.

One of those tests was wrong on the first run while the code was right, and it is worth recording which way that was resolved. A card released onto the first card of a column lands above it, so its neighbours are nothing above and the displaced card below; the test had expected the card after that one. It was corrected against `arrangeColumn`, not against whatever the run produced, because a test rewritten to match the output it just saw asserts nothing.

`shared/ui/LoadingScreen` is the primitive the `BoardDashboard` entry above declined to write for one caller. Both pages have a full-page loading state, so it has two, and it closes a gap that was sitting in a test file as a comment rather than in the markup: the spinner carried no role and no name, so a page with nothing on it yet was indistinguishable from an empty one to anyone not looking at the screen. Both pages' tests now assert the accessible name rather than a spinning class.

The target is under 80 and 153 is not that, for the same reasons as the dashboard and one more. The error screens stayed: the two pages' versions differ enough, one an alert card with two buttons and one a red box with one, that a shared component would be a switch over presentation with no behaviour in common, which is the merge this section argues against under `UserPicker`. The rest is the header, three hand-rolled buttons and the save handler, which is genuine page logic about what a completed checklist means.

One simplification went in with the last commit and is named because it is a behaviour change rather than a move. The add member modal was held open by a `showAddMemberModal` boolean beside a `selectedBoardForMembers` board, two pieces of state that had to agree. They are one now, and the modal is open when there is a board. The old pair could open the modal with no board, showing an empty title, which nothing reached in practice because the id always came from a rendered card. It is the same shape as P4-8: a second copy of a fact that something has to keep in step.

**The board layout, and P4-16, a page that grew to the position of the last card.** The wrapping four column grid is a row of fixed width columns now. `BoardColumns` owns one labelled scroll container, `Column` is `w-72` below the small breakpoint and `w-80` above it, keeps its header out of the scrolling body, and fills the height of the row, so the whole of an empty column is a drop target and carries a one line hint. `Board` and a new `AppShell` in `App.tsx` pin the board route to the viewport, and the footer is not rendered there, so the document never has a second vertical scrollbar. Removing the footer on that route only was a product decision, and it returned 141 pixels of column height at 390 pixels wide and 85 at 1024 and 1440 (columns now end at 828 of 844, 752 of 768 and 884 of 900). `AppShell` lives in `app/layouts` with a test that the board route renders no footer and the others still do.

P4-16 was found by the new script rather than by reading. With fourteen cards in one column the document overflowed the viewport by 906 pixels although every column scrolled internally. The cause is that `TaskCard` carries `sr-only` text, which is `position: absolute`, and an absolutely positioned descendant is clipped and scrolled only by a scroller that is also its containing block. The column body was not, so each card's hidden text escaped it and the page grew to the position of the last card in the longest column. The column body is `relative` now and the script asserts the document does not scroll vertically at three viewports, which fails without it. The same shape would appear around any scroller that contains `sr-only` text.

The scroll row takes `tabIndex={0}` with a name, which needed one `jsx-a11y/no-noninteractive-tabindex` disable with a reason: the rule cannot know the region scrolls. It cannot be left out, because a board with no tasks has no drag handle inside the row and axe's `scrollable-region-focusable` would otherwise fail on a screen too narrow for the columns. Scroll snapping is `proximity`, not `mandatory`, because mandatory snapping fights dnd-kit's auto-scroll; the script holds a card at the right edge at 390 pixels, asserts the row scrolled, and asserts the drop landed in another column. A board with no tasks at all shows a banner above the column row, by product decision: a compact `EmptyState` (new `compact` and `headingLevel` props on the existing primitive, no new component) with an Add task button that calls the same `openNewTask` as the header button, so the task is aimed at the first column. It is a banner rather than a block inside the first column because it describes the whole board, never covers a drop target, and is the same shape at 390 and 1440 pixels. It disappears as soon as one task exists, and the columns and their per-column hints stay on screen beneath it. The heading is level 2 because no level 2 precedes it on the page. `e2e/verify/board-layout.mjs` asserts at all three widths that the banner and its button are on screen, that it adds no page scroll and that the columns still reach the bottom, and the axe gate's board surface is an empty board, so that state is scanned too.

**The "Move to" menu, and the third menu that settled the primitive question.** Every task card has a button beside its drag handle that opens a menu of the board's columns, and choosing one moves the card. It is the single-pointer alternative WCAG 2.5.7 asks for, and it works for keyboard, screen reader, touch and mouse alike. The card goes to the end of the target column. That is where a drop on a column's empty space lands and where a finished checklist sends a task, so every way of arriving in a column without choosing a position agrees, and a menu has no position to offer. The column the card is already in is listed and marked Current but cannot be chosen, so the menu always reads as the whole board with a "you are here".

The move is not duplicated. What a drop turns into, the optimistic cache write, the `/move` request with neighbour keys and the P2-6 in-flight guard, moved out of `useTaskDragAndDrop` into `useTaskMover`, and the drag hook keeps only what is specific to dnd-kit. The mover is created once and handed out on the drag hook's result, so a drag and a menu move share one guard: a test starts a slow menu move, then a drag, and asserts the first is abandoned and the board is left to the second. Without the sharing, the exact race P2-6 was opened for would reappear between the two paths.

After a move the card is a new element in a different column, so the one that had keyboard focus is gone. The mover records a focus request and `BoardColumns` focuses the same task's menu button once the cache write has rendered it, retrying across a few frames. A live region that is mounted from the start announces "Moved X to Done." or "Could not move X to Done.", because a card that leaves leaves nothing at the place the person was working. The button is 44 pixels square below the small breakpoint and 32 above it, and every menu item is 44 pixels tall on a phone; the end to end test measures both at 390 pixels. It does not touch the drag: the handle's listeners stay on the handle, the PointerSensor activation is unchanged, and the menu button is a separate control.

`shared/ui/Menu` was deferred in Phase 5 for one reason, which was that two menus disagreed about who owns the open state: `UserMenu` held its own and `BoardCardMenu` was driven by `useBoardMenu` for a whole grid. A third caller made the answer clear. The `Menu` owns its open state, privately, and nothing outside can open or close it. One-open-at-a-time, which is what `useBoardMenu` exists for, needs no coordinator because pressing anywhere outside a menu closes it, including pressing another menu's trigger. The popup is rendered in a portal at fixed coordinates measured from the trigger, since the cards sit in a scrolling column body that would clip an absolutely positioned popup, and it is measured again on scroll and resize rather than closed: the first version closed on scroll and was closed again by a scroll snap that was still settling at the moment it opened. Arrows, Home, End, Escape and Tab, focus returning to the trigger on every close, and a click stop at the popup boundary, because React events bubble through a portal to the card's own click handler and would otherwise open the drawer on every choice. Twelve mutations of the primitive and the mover were each caught by a test.

`UserMenu` moved onto it, which was cheap and safe: its tests held except one that expected the menu to be named by its trigger, which `Menu` now does by default when no label is given. That removed its hand-written outside click, Escape and focus code. It also lost its enter and exit animation, which belongs to Phase 6b. `BoardCardMenu` stays as it is. Its items are plain buttons that the end to end suite finds by the button role, it is driven by `useBoardMenu`, and replacing it changes roles and the contract of a test in one go: it is its own unit and is recorded as the next one.

The axe gate has a new surface, `board, move menu open`, because a popup nothing scanned open is a popup nothing has measured. It reports the board's own two numbers and nothing more, so the portal adds no landmark finding. The end to end spec drives the whole flow by keyboard, reloads and confirms the move persisted, since a menu that only repainted the card would pass every step before the reload, and a second test measures where the account menu lands at 1440 and 390 pixels.

One measurement belongs to P2-6a. With the menu on every card, the drag test failed 5 of 12 runs in isolation, and with the menu switched off in the same build it failed 6 of 12, so the menu is not the cause. The earlier measurement was 0 of 8 on its own, so the failure rate in isolation is not a constant of the test: it moved between sessions of the same code, which weakens the reading that it only fails inside full runs and points further at the machine. Everything else is unchanged and the issue stays deferred.

**The keyboard sensor across columns, and P4-17 and P4-18.** The plan expected the keyboard sensor to be unable to leave a column, and measured against the running board it is not: with `sortableKeyboardCoordinates` a card did cross columns. What it could not do was cross them predictably. That getter picks the nearest droppable in the direction pressed by corner distance, and on a row of columns the nearest one is not the one a person expects. Probing it with scripted key presses, Down pressed while the card was over an empty column answered with a card in the column to its left, because that card sat lower on the screen than the empty column's top. A sighted person can correct for that and a person who cannot see the board cannot, so geometry is the wrong model for a keyboard.

The model is now positional and lives in `features/tasks/keyboardDrag.ts` as pure functions. A held card has a slot, a column and the index it would take once dropped. Up and Down step the index and stop at the column's ends. Left and Right go to the neighbouring column and keep the index, clamped to that column's end, and stop at the first and last column instead of wrapping. In the card's own column the last slot is its last card; in any other column there is one more, the end, because dropping below the last card is a real destination. The landing index is the same row, clamped. The alternative was always the end of the column, which is what the menu does because a menu has no position to offer, but a keyboard has one: it is already holding a row, and keeping it makes a run of sideways presses read as a straight line across the board and lets a card reach the middle of a column. The menu's end placement and the keyboard's same row placement are different on purpose, and the second is still one Down press from the end.

The getter only chooses the slot. It reads where that is on screen from the document, because the row and the column bodies scroll and a rectangle dnd-kit measured when the drag began is where the card used to be, and it returns those coordinates so the sensor moves the overlay and scrolls the row. It does not scroll the row itself: the sensor already scrolls it by the distance to the target and a second scroll would overshoot. It does scroll the target column's own body to show the card, which nothing else does. The collision detection reports the droppable the getter chose while a keyboard drag is going on and falls back to `closestCorners` otherwise, so the drag overlay can sit over a card shorter than the column body around it without the column body winning the match. Pointer dragging is untouched: the sensor activation and the default collision are what they were.

Announcements are dnd-kit's `accessibility` option with the board's own wording, built from a snapshot of the board that is read through a ref so the sensor never holds a stale one: "Picked up Write the spec. Backlog, position 2 of 3.", then "Doing, position 1 of 2." as the card moves, "Dropped Write the spec in Doing, position 1 of 2.", "Move cancelled. Write the spec is back in Backlog, position 2 of 3.", and the instructions read on the handle say what each key does. No id is ever spoken. dnd-kit reports the card as hovering itself the moment it is picked up, which would replace the pickup message a moment after it was said, so that one report is skipped. The existing live region from the menu stays the only place the mover speaks, and it is used here for one thing dnd-kit cannot know, that a request failed, so no move is announced twice.

P4-17: after a keyboard drop into another column focus fell to the page. The card is a new element in its new column and the handle that held focus went with the old one, so a keyboard user dropped a card and lost their place. The mover's focus request now names a target, the menu button or the drag handle, and a keyboard drop asks for the handle; `BoardColumns` finds it by `data-task-drag-handle`. P4-18: a drag whose request failed was never announced, for the pointer or for the keyboard, and the board silently refetched. It is announced now through the mover's live region, in the same words the menu uses.

Two limits are named rather than hidden. Pressing a key at the edge of the board or of a column announces nothing, because the getter has no way to speak and a bare "no" would need its own channel. And the row is remembered only through the current slot: going right into a shorter column and back left returns to the clamped row, not the original one, which is the usual behaviour of a cursor and not a defect.

Tests: the pure model is covered by 30 unit tests (stepping, clamping, the end of another column, the edges, announcements, the getter against rectangles and against fake nodes that scroll, the collision detection), the hook and the board by tests for the focus target, the failed move and the cancel, and sixteen mutations of the model, the getter, the hook and `BoardColumns` were each caught by a test, after two survivors: an unreachable branch, now removed, and a prop `BoardColumns` passed to the drag context that nothing asserted, which has a test now. Four Playwright tests drive it with the keyboard alone: pick up with Enter, move right and down, drop, check the announcements and the focus, reload and confirm the order; reach the end of another column and stop; Escape leaves the board unchanged and sends no `/move` request; and at 390 pixels the row scrolls toward each column in turn with the carried card on screen all the way across. Removing the focus request fails the first of them. The two older tests that waited for the word "draggable" in the live region now wait for "picked up", since the announcements are the board's own. P2-6a: the pointer drag test passed on both full runs of the spec in this slice, and nothing here changes how the pointer sensor is activated.

**The task drawer as a bottom sheet.** `shared/ui/Drawer` is a bottom sheet below the medium breakpoint and the right hand side panel from it up, so every caller gets both and nothing about the task drawer is special. The sheet is full width, anchored to the bottom, capped at 90 dvh so the page header stays in view behind it, and rounded at the top. The panel never grows past the screen: the header and the `footer` slot stay put and only the body scrolls. `vh` is the wrong unit on a phone because it is the height with the browser chrome retracted, taller than what is visible, so the cap is in `dvh`, and the footer pads for the home indicator with `env(safe-area-inset-bottom)`.

The task form's two buttons used to be the last thing inside the form, which is how a long form on a short screen put Save below the fold. They moved into the drawer's footer as `TaskFormActions`, and the submit button stays the form's own through the `form` attribute: pressing it and pressing Enter in a field go through the same handler. Every existing submit test held without a change, which is the evidence that the attribute behaves in the environment those tests run in.

The entrance animation drives `y` on a phone and `x` from the medium breakpoint up. A stylesheet cannot say that because the animation is JavaScript, so it is the one place that needed a media query in code, and `useMediaQuery` is built on `useSyncExternalStore` and reports a fallback where `matchMedia` does not exist.

A drag to dismiss gesture was not added. Escape, the close button and the backdrop already dismiss the sheet for every input method, a swipe would add a path only a touch screen can take, and it would compete with the body's own scroll. The on-screen keyboard is handled in two ways. `dvh` follows whatever the browser reports, and `interactive-widget=resizes-content` in the viewport meta tag makes Chrome and Firefox on Android shrink the layout viewport for the keyboard, so the sheet ends above it. Safari ignores the key, and there the browser scrolls the focused field into view inside the sheet's scrolling body. What was measured is a viewport resized to half its height, which is how a browser that resizes the layout reports a keyboard. It is not a keyboard, and the behaviour on a real device is unverified.

`e2e/verify/responsive.mjs` asserts, at 320, 390, 768, 1024 and 1440 pixels, that the drawer is a full width bottom sheet below 768 and a side panel at and above it, that the page does not scroll sideways, that Save and Cancel are inside the viewport, that the form scrolls inside the panel while the title and the actions stay where they are, that with half the height gone the sheet fits and the focused field is on screen, and that focus, Escape and focus restoration still work. Mutating the sheet classes back to a full height side panel and removing `overflow-y-auto` from the body were each caught. The axe gate has a new surface, `board, task drawer open, phone`, because the drawer was only ever scanned at 1440 pixels.

**Responsive coverage, and P4-19 to P4-23.** Section 10.4 names nine components with no responsive rules: `Column`, `TaskCard`, `TaskDrawer`, `AddMemberModal`, `PageHeader`, `LegalModal`, `SuccessModal`, `RegisterForm` and `FormInput`. That list is a snapshot of the code before the board layout and Phase 5, so it was audited rather than followed. `Column` and `TaskCard` were rebuilt by the board layout work and pass at every width unchanged. `TaskDrawer` is the bottom sheet. `FormInput` was deleted in Phase 5 and its job is done by `Field` and `Input`, which every form measured here goes through. `SuccessModal` passes as it is. `AddMemberModal`, `PageHeader`, `LegalModal` and `RegisterForm` each needed a change, and the audit found six more that the list never named: `Modal`, `Footer`, `LoginForm`, `Checklist`, `BoardCardMenu` and `UserMenu`. Rather than a list of components, the standing check is a list of surfaces, which is the unit a person actually sees.

`e2e/verify/responsive.mjs` visits fourteen surfaces at five widths and asserts seven properties of each. The interesting part is what it had to model to avoid crying wolf. A control's visible box is its own box cut by every ancestor that clips: an ancestor that scrolls only hides what can be scrolled to, which is fine, while an ancestor with `overflow: hidden` that removes part of the control is a defect, because nothing can bring it back. Absolutely positioned controls skip ancestors that are not their containing block. A button placed inside its own field, such as a password toggle, is the one allowed overlap, and controls on different layers are not compared. Links and buttons inside a sentence are exempt from the size rule, as WCAG 2.5.8 exempts them, and a checkbox is measured through its label.

P4-19, the page header. A long board title pushed the "Add Task" button, and at 390 pixels the account menu, past the right edge of the viewport where the board page's `overflow-hidden` frame cut them off. `PageHeader` now wraps: the title block asks for 14 rem, and when that plus the actions does not fit the actions drop to their own right aligned line. A wrap that is not needed is invisible to every other assertion, because a header that crushes its title to a column of single letters has no overlap and nothing off screen, so the script also asserts a title keeps 120 pixels. Removing `flex-wrap` leaves the title 0 to 16 pixels wide at 320 and fails 16 assertions.

P4-20, the checklist row. The completion checkbox and the drag handle had no accessible name, so a row was announced as "checkbox" and "button" with nothing else, and the controls were 13 and 22 pixels square. The task drawer's axe scan had never contained an item, which is why it reported nothing. Each control is named now, sits in a box of 44 pixels on a phone and 28 from the medium breakpoint, and the gate scans the drawer with an item added.

P4-21, hover as the only way to find a control. The board card's options button was `opacity-0` until the card was hovered, and a phone has no hover, so it was invisible there and still pressable. It is visible by default and hidden until hover only where `(hover: hover)` holds. It is 44 pixels square below the medium breakpoint. The check that found it opens the dashboard on an emulated touch screen and asserts nothing is transparent.

P4-22, small targets and text with no way to read it. The footer's three icon links were 20 pixels square, "Forgot password?", "Add Item" and the legal modal's "Download" were 20 pixels tall, the terms checkbox's row was 20, and the account menu's email was clipped with an ellipsis and no title. Each is at least 24 now: 36 for the footer links, "Forgot password?" and the terms row, 44 on a phone for "Add Item" and "Download", and the clipped text carries a title.

P4-23, a modal footer that could not wrap. The footer was a single non wrapping row of `justify-between`, so at 320 pixels the add members dialog's "Add 2 Members" button was cut off by the dialog's own edge. The footer wraps, the header and body use 16 pixels of padding on a phone and 24 from the medium breakpoint, the panel is capped in `dvh`, and the add members dialog stopped doubling its padding inside the modal's.

Mutating a fix away was checked for the sheet, the body scroll, the header wrap, the footer link size, the hover reveal and the name row. Each was caught except the header wrap on the first attempt, which is why the title width assertion exists. The first complete run, before any fix, reported 85 failing assertions, most of them the target size rule repeated across widths and surfaces.

**Board soft delete, restore and purge.** Undo for a deleted board is a server-side soft delete rather than a delayed request from the client. A delayed request is lost when the tab closes and fires at an unexpected moment when it does not, and every other tab would keep showing a board its owner has already deleted. `DELETE /boards/:id` now sets `deletedAt` and leaves the tasks alone, so a restore is exact: same board, same columns, same task ids and order. `POST /boards/:id/restore` clears the mark, owner only, and answers with the board; restoring a board that is not deleted answers the same way, so a double click on Undo is not an error, and a purged board is a 404.

A marked board is missing for everybody. `requireBoardRole` answers 404 for it unless the route opts in with `includeDeleted`, which only restore does, and it still resolves the role first so a stranger gets the same 403 as for a live board. `requireTaskBoardRole` does the same through the task's board, which covers every task read and write. `visibleBoardFilter` gained a `deletedAt: null` clause, and the dashboard totals and the board list both run through it. `{ deletedAt: null }` matches boards saved before the field existed, so no migration was needed. The list query still plans as `IXSCAN` on `workspaceId`, checked with `explain()` on the running database.

The purge removes a board once `deletedAt` is older than `BOARD_RETENTION_MS`, seven days by default, running at start and every `BOARD_PURGE_INTERVAL_MS`, one hour by default, from a timer in the server process. Seven days because the interface offers undo for a few seconds only, so the window is for an owner who asks afterwards or notices over a weekend, and it is short because the board holds data its owner asked to be rid of. A timer rather than a MongoDB TTL index because a TTL index would delete the board document and leave its tasks behind; the cascade needs the transaction from P2-2, which each board gets on its own, so one failing board is logged and the rest of the backlog still goes. The removal is guarded on `deletedAt` inside the transaction, so a restore that lands between the scan and the delete wins the race. The restore refuses a board past the window itself, with the exact complement of the purge's comparison (`deletedAt > cutoff` restores, `deletedAt <= cutoff` is purged), so the seven days are exact and not stretched by up to one purge interval. Several server processes running the job at once is safe for the same reason. The scan uses a partial index on `deletedAt`, and its query carries `$type: 'date'` because a bare `$lte` does not imply the index's condition: without it the plan was a `COLLSCAN`.

Tests are in `back/test/boardRestore.test.js`. Mutating each of these away is caught: the list filter, the role middleware check, the task middleware check, the owner requirement on restore, the guard in the purge, the cascade, the clearing of the mark on restore and the filter that stops a second delete moving the date. The last one survived at first, because the middleware turns away a second delete before the service sees it, so it is now asserted on the service directly. The old test for a failing cascade moved with the cascade: it now lives in the purge tests.

**Board editing from the board page.** The page header has an options menu, built on `shared/ui/Menu`, with Edit board. It renders only when the board read says `viewerRole` is `owner`. That field is the one addition to the API: `requireBoardRole` already resolved the caller's role to decide the request, and now `getBoard` returns it, so the interface never re-derives the rule. The alternative was comparing `createdBy` to the signed in user in the browser, which is wrong for a workspace admin, whom the server treats as an owner of every board in the workspace. The dashboard's per card menu still shows Add Member and Delete to every member and the server refuses them, which is P4-24.

The edit dialog is not a mode of the create dialog. What makes the create dialog heavy is all about creating: the template, the draft that survives a reload, and the defaults applied as two lists arrive. What the two share is three fields and one schema, so those moved out: `boardFieldsSchema` and `BoardFormFields`, which reads the form from context because the create form's type is wider than the edit form's and a prop typed for the narrow one rejects the wide one. The template is not editable: it only seeds columns at creation, and the server's update schema already refuses it. The existing create dialog tests ran unchanged against the refactor.

A failed save keeps the dialog open with the typed text and an alert, which only works because `onSave` rejects and nothing between the form and the request catches it (the P4-9 lesson, applied from the start). Opening the dialog again starts from the board as it is now, not from abandoned text.

The cache write is a merge, not a replacement. The server answers a PUT with the members populated and no `viewerRole`, a different shape from the read the board page holds, so storing the response would drop the role and swap the members. Only title, description and colour changed, so only those are merged into the board page entry and into the dashboard list entry, and the stats are left alone because none of the three feeds a total. `useBoard` and the `['board', id]` key moved from `features/tasks` into `features/boards`, since the boards feature now writes that entry and a feature should own what it writes. Mutations caught: the detail merge, the list merge, the merge applying to every list entry, the colour field of the merge, the owner gate, the catch in the dialog, closing after a save, resetting on open and sending the colour.

`viewerRole` is asserted by two backend tests and the two ways of losing it, not setting it in the middleware and not returning it from the controller, are both caught. The responsive script gained the edit dialog (516 to 551 assertions, none failing), and the axe gate scans it open: it reports nothing, because the modal makes the page behind it inert, so it carries no budget.

**Board deletion with confirmation and undo.** `window.confirm` is gone from the dashboard. Both places that delete a board open `DeleteBoardDialog`, which names the board, says its tasks go with it and that Undo exists, and puts focus on Cancel so a reflex Enter is the safe answer. After the delete, a toast reads `Deleted "name"` with an Undo button, and Undo calls the restore route. The delete hook is shared, so there is one behaviour: from the board page the dialog stays open while the request runs and shows a failure inside itself, then the page goes to the dashboard; from the dashboard the card keeps saying "Deleting..." as before (P4-8) and a failure uses the existing page message.

Where Undo lands the person: where they already are, which is the dashboard in both cases. Returning them to the board page would move them again after a navigation they may have already moved on from, and activating a control that changes the page without being asked is the kind of surprise WCAG 3.2.2 is about. The restored board reappears in the grid and a second toast says `Restored "name"`. The toast lasts ten seconds untouched. After that the board is only restorable through the API until the purge, and there is no screen for it, which is the decided behaviour, see "Phase 6 product decisions".

`ToastProvider` is the first live region the application mounts, so it is mounted empty before anything is shown, because few screen readers announce a region that appears together with its content. It pauses its clock while the pointer is on it or focus is inside it and resumes with the time left, which is how WCAG 2.2.1 is met without a separate control, and it dismisses on Escape and from a button. The viewport is first in the document, but that alone did not make Undo reachable: the end to end test found that after the board page unmounts, Chrome resumes Tab from where the removed button used to sit, nowhere near the toast. So a toast with an action focuses it when the last input was the keyboard and nothing at all has focus 250 ms later, once the page behind has settled. A pointer user is never given focus, because a focused toast does not expire. It also changed what a test can query: an always mounted `role="status"` makes a bare `queryByRole('status')` find it, so the one test that meant the loading indicator now names it.

The dashboard's menu had to learn that a dialog opened from it is not outside it. Its window level click and Escape handlers closed the menu on any click, including Cancel inside the dialog, which removed the item the dialog was about to return focus to. They now ignore anything inside a dialog, and the menu closes when the delete finishes: left open it would reopen over the card when the board was restored. Mutations caught: 29 across the toast clock, its pause rules, its live region and its position in the document, the dialog's focus and its working guard, the board name in the dialog, the failure branch and the navigation, the restore call and its retry, the cache removal and invalidations, and the menu's two dialog exceptions. Two survived at first, the focus leaving between the toast's own two buttons and the Escape exception, and each was a test that did not exercise the branch.

The axe gate scans the confirmation open, clean, and the dashboard with a toast showing, whose three numbers are the dashboard's own. The responsive script gained both surfaces (551 to 621 assertions) and treats a toast as a layer of its own, like a dialog or a menu: it floats over the page by design, so what it covers is not an overlap between controls. The end to end suite covers edit with the result on the dashboard, delete then undo with every task back, delete without undo gone after a reload and not reachable by address, cancel, the dashboard path, and the keyboard path with the toast held past its ten seconds by focus.

**The not found page.** `NotFound` replaces the catch-all redirect to the dashboard. It sits outside `ProtectedRoute` on purpose: the router decides an address is unknown before anything decides who is asking, and an unknown address is answered the same way for everybody. A signed in visitor gets the app header with the account menu and a link back to their boards; a signed out visitor gets the same message, an h1 of its own and a link to sign in. Neither is redirected, so the address that was typed stays in the bar and nobody is bounced to login for a page that does not exist. While the session is still resolving it shows the loading state rather than guessing which of the two to render. Every state has one h1 and a main landmark.

The board page uses the same component for a board it cannot show. `useBoardData` now reports `notFound`, true when the board read or the task read answers 404, 403 or 400, and `isAddressUnreachable` is the one place that says so. 404 covers a missing board and a soft deleted one. 403 is a board the caller may not read. 400 is an address that is not shaped like an id, which `idParamSchema` rejects before the server looks. All three are answers about the address and repeat on every attempt, so the page offers a way out instead of "Try again", and folding 403 into the same copy as 404 keeps the page from confirming that somebody else's id exists. A network failure has no status and a 5xx is the server's fault, so those keep the alert with its retry. The test that proved a deleted board was unreachable by address used to assert that alert; it asserts the not found page now, with no retry button.

`useDocumentTitle` names the tab, `Page not found | BreezyBoard` or `Board not found | BreezyBoard`, and puts the previous title back on unmount. Nothing else in the application sets a title yet, so the browser tab reads `Boards` on every other page, which is a separate gap and is left for Phase 6b.

Mutations caught: the board page's not found branch, each of the three statuses in `isAddressUnreachable` (dropping 400, dropping 403, and widening it to any status), the catch-all route going back to a redirect, the link chosen by sign in state, the title being set, the title being restored and the main landmark. The axe gate scans the signed out page, the signed in page and the missing board, all with no violations and no budget. The responsive script gained the same three surfaces.

**The dashboard card menu by role (P4-24, closed).** The card's menu offered Add Member and Delete to every member of a board and the server refused both with a 403, so a member was shown two controls that could only fail. Nothing on the dashboard knew the viewer's role, because only the single board read carried `viewerRole`. Now every entry of `GET /boards` does, and `BoardCard` renders the menu only when it is `owner`. The menu holds two actions and both are owner only, so for a member there is nothing to offer and the trigger is not rendered; a board that arrives with no role gets no menu either, which is the safe reading of an answer the interface cannot interpret. The server stays the authority: the routes still refuse a member whatever the interface shows.

The list does not re-derive the rule. `workspaceRolesOf` reads the caller's workspace roles once and both the listing filter and each board's role come from that map, so the filter and the role cannot disagree about which workspaces count, and the role is computed by `resolveBoardRole` itself, which is what makes a workspace admin an owner here as in the read. One detail would have been easy to get wrong: the list populates `createdBy` into an object, and the resolver compares it to the caller's id as a string, so a populated object never matches and a creator who is only a workspace member would have been reported as a plain member. The id is handed to the resolver in its place, and a test with exactly that person (a workspace member who created the board) is what notices.

Backend tests assert that the list and the read agree for an owner and for a member, that a workspace admin who was never added to a board is an owner of it in the list, that a workspace member added to a board is a member, and that a creator who is not an admin is an owner. Mutations caught: dropping the field, reading the role from the wrong workspace (a constant `member` and a constant `admin`) and passing the populated creator. The first run of that last one survived, because in a personal workspace the creator is the admin and so an owner whatever `createdBy` says; the case that tells them apart is a shared workspace. Frontend mutations caught: rendering the menu for everyone, and inverting the check in two ways. An end to end test has a member and an owner look at the same dashboard.

**Colour ids are checked before a board is written.** `createBoard` and `updateBoard` took a colour id on trust: the schema checked that it was shaped like an id and nothing checked that it named anything. Posting `ffffffffffffffffffffffff` created a board whose colour read back as null, and every consumer then had to invent a fallback. `assertColorExists` looks the id up first and answers 400 with `VALIDATION_ERROR` from the error code enum, and `updateBoard` runs it only when the request carries a colour, so a rename on its own is untouched. A 400 rather than a 404, because the board is fine and the value sent for one of its fields is not. The check sits before anything is written, so a refused update also leaves the title alone, which a test asserts. Mutations caught: removing either call, making the lookup always succeed, running the update check unconditionally, and the code and the status of the error.

The id must also name a colour of type `board`. The palette holds `board`, `task` and `column` entries, and a task colour used to be accepted as a board colour and painted the board with the neutral fallback. `assertBoardColorExists` filters the lookup on the type, so a task or column colour answers the same 400 `VALIDATION_ERROR` as an id that names nothing. The seeded boards and both board dialogs use board colours only, so nothing existing changes. Mutation caught: dropping the type from the filter fails the create and the update tests.

**P4-25, closed: member ids were checked for shape and not for existence.** P1-9 lists "member ids added without checking the users exist" and the plan recorded the item as done. It was not enforced: `PATCH /boards/:id/members` with a well formed id that belongs to nobody answered 200, the id stayed in `Board.members`, and `ensureWorkspaceMembership` added it to the workspace as a member. The population on the response dropped it silently, which is why nothing looked wrong. What existed was `objectIdSchema`, a 24 character hex check. Found by trying it against the running stack while looking for the member id validation the colour check was meant to copy.

`assertUsersExist` in `board.service.js` counts the distinct ids in `User` and refuses with 400 `VALIDATION_ERROR` when the count is short. It runs before anything is written in `addBoardMembers`, ahead of the workspace grant, and in `createBoard` when `members` is supplied, so a refused request leaves neither the board nor its workspace changed. It is all or nothing: one real id beside a ghost adds nobody. Distinct ids are counted so a repeat in one request is accepted, as `$addToSet` already treats it. A 400 and not a 404, for the reason the colour check gives. The check does not say which id was wrong; the caller can already search users, so nothing more would be learned, and a list of ids in an error is something to avoid by default. Mutations caught: either call site's check removed, the deduplication removed, the count comparison weakened to any match, and the wrong code. P1-9 is now fully done: the plan's earlier statement that it was done was wrong for this item.

**The mail transport.** Password recovery needs the API to send mail, and nothing in it could. `mail.service.js` wraps nodemailer behind two functions, `sendMail` and `setMailTransport`. The transport is built on first use, so loading the application never opens a connection, and a test installs its own object with a `sendMail` method to capture what would have been sent. With no transport installed the test environment uses nodemailer's JSON transport, which serialises the message and touches no network.

Production refuses to start without `FRONTEND_URL`, `SMTP_HOST` and `MAIL_FROM`, which is the same rule as for `JWT_SECRET`, and the alternative that was considered is a disabled mode that logs the message. It was rejected because a reset email contains a working account takeover link: a deployment that forgot its relay would write live tokens into its logs, readable by anyone with log access, while the people who asked for a reset received nothing. A loud refusal at boot costs one failed deploy. `SMTP_USER` and `SMTP_PASSWORD` must be set together or not at all, since a relay that authenticates needs both and a catcher needs neither.

`FRONTEND_URL` is configuration and the only source of the origin in an emailed link. The request's `Host` header is chosen by whoever sends the request, so a link built from it would let an attacker have a victim's token delivered to a host the attacker controls. Only the origin is kept, so a trailing path or slash in the setting cannot corrupt the link.

Development gets `axllent/mailpit` in `docker-compose.yml`: SMTP on 1025 inside the network, web interface and HTTP API on host port 8025 (`MAILPIT_UI_PORT`). The end to end suite reads the reset email through that API. `docker-compose.prod.yml` has no counterpart and passes the six settings through, three of them required.

**Password recovery, the backend.** `passwordReset.service.js` holds both halves. The two decisions that are not obvious from the contract are where the neutral answer comes from and why the limiter is not the one the login route uses.

The answer is neutral because the work is shaped to be, not because the response is. Both paths look the address up, both generate and hash a token, and both issue one `updateOne`, which for an unknown address is aimed at a freshly generated id and matches nothing. Only the send differs, and the send is not awaited, so a slow relay is invisible to the caller. Measured against the running stack, a known and an unknown address both answered in about 100 milliseconds. A test cannot assert timing without flaking, so what is asserted is the status, the body and that a send happens for one and not the other; the equal database work is a property of the code that no test observes, and that is stated here rather than implied by the tests.

`authLimiter` skips successful requests, so reusing it would have protected nothing: a reset request always succeeds. `passwordRecoveryLimiter` counts everything, 10 per fifteen minutes per client IP address by default and 500 in development, and the same counter covers using a link. It bounds how many emails one client can make the system send to somebody else, which is the abuse this route has. The key is the IP address, not the email address asked about, so clients sharing one address share the budget. The limiter is skipped under test like the others; `rateLimitTesting` is the switch the one test that needs it turns on, because without a way to switch it on nothing could prove a route is behind its limiter.

The token is 256 bits, hex, and only its SHA-256 is stored, in `passwordResets` on the user, a list of hash and expiry pairs, `select: false` and stripped by `toJSON`. A fast hash is right here and a slow one would not be: the input is already 256 bits of randomness, so there is nothing to slow an attacker down over, and bcrypt would only make every lookup expensive. Issuing a new token adds to the list and does not invalidate the earlier ones, see P4-37. Thirty minutes is long enough for a message to cross a slow relay and be read, and short enough that a link left in a mailbox or a backup is worth nothing by the time anyone finds it.

Consuming is one `findOneAndUpdate` that matches the hash and an expiry in the future, then sets the password, unsets the pair and increments `tokenVersion`. One operation is what makes the token single use under concurrency: two simultaneous requests carrying the same token cannot both match, and a test sends them together. The new password is hashed before the lookup, so a refused token costs the same as an accepted one. An unknown, expired and used token fail with one status, one message and one code, `INVALID_RESET_TOKEN`, so a caller learns nothing about which part was wrong. A password that breaks the rule is a different answer, 400 `VALIDATION_ERROR`, and does not consume the token. The rule is now `passwordSchema`, shared by registration, a password change and a reset, so one cannot accept what another refuses.

A password change now clears every pending reset, a case the contract did not name: without it, whoever holds an old link could overwrite the password the person had just chosen.

Mutations caught: expiry removed from the match, the unset removed, the `tokenVersion` increment removed, an unknown address answering 404, a mail sent for an unknown address, the raw token stored, the raw token used for the lookup, the limiter taken off each route, the limiter skipping successes, a new request that does not overwrite, the change password cleanup removed, a weak password accepted, `toJSON` leaking the hash, `select: false` removed and the link built from another origin. One survived at first, `select: false` removed, because the test that read the hash asked for it explicitly; an ordinary read is asserted now.

**Password recovery, the frontend.** The sign in page's dialog is now a form, `ForgotPasswordModal`, which takes its submit function as a prop like `LoginForm` does, so the page decides what a request is and the dialog only knows how to ask. The confirmation says "If an account exists for the address, we have sent a link", a conditional on purpose: the server answers identically either way, so the dialog has nothing it could say about whether an account exists and must not imply it does. The form and the confirmation replace one another inside the same modal, which removes the focused field from the page, so focus moves to the confirmation's Done button at that moment instead of being dropped on the document. The button is named Done and not Close because the modal's own close control already has that name, and two buttons with one name in one dialog is ambiguous to a screen reader and to a test.

`/reset-password` sits outside `ProtectedRoute`: the person arriving from the link has no session, and one who does is not sent anywhere. `ResetPassword` reads the token once into state from the URL fragment, `#token=...`, and then removes it from the address bar with `history.replaceState`. State survives the replace so the form keeps working, and a reload lands on the same page a link with no token gets, "This link cannot be used", with a link that goes to sign in and opens the dialog. `Referrer-Policy` was `strict-origin-when-cross-origin`, which sends the full address with any same origin request, so the page's own asset and API requests would have carried the token in their Referer and into the access log. It is `no-referrer` in nginx and in a meta tag in `index.html`, so the development server holds the same line. Nothing in the application reads a Referer.

On success the page calls `clearSession`, a new member of the auth context that drops the stored session and the in memory state without telling the server. `logout` was not usable: the reset has just bumped `tokenVersion`, so the request would come back 401 and the interceptor would hard redirect to sign in, losing the confirmation. The person is sent to sign in through the router with a notice in location state, which the sign in page shows as a status message. A refused token is recognised by the API's `INVALID_RESET_TOKEN` code through `apiErrorCodeOf`, not by status or message.

Mutations caught: the token not being read, the address bar left alone, the session not cleared, the notice state dropped, the refused token branch removed, the request not sent, the confirmation shown after a failure, the 429 wording, the focus move, the reset on close (two), the email schema loosened, the confirmation match dropped, the uppercase, digit and length rules, the dirty callback, a changed password sent, the autocomplete hints, the sign in notice, the new link intent from the reset page and into the dialog, the dialog wiring, the route being protected and the error code reader. Two survived at first and the tests were the weak part: the intent carried by the "Request a new link" link was only asserted as an href, and the length rule was only tested with a five character password that fails at six as well. Both are asserted through behaviour now.

**The token travels in the URL fragment.** The reset link is `/reset-password#token=...` and not a query string. A query string is part of the request line, so it lands in the access log of the server and of any proxy in front of it; a fragment is kept by the browser and never sent. The page reads `location.hash` into state and clears it with `history.replaceState`, and a token in the query string is not read at all. Mutations caught: reading the query instead, the clear removed, and the mail builder going back to `?token=`.

**Reset email cooldown.** At most one reset email goes to an address per `PASSWORD_RESET_COOLDOWN_MS`, one minute by default, so the route cannot be used to fill a mailbox. The decision is where to key it without leaking existence. It is read from the stored expiries on the user: a token was issued at its expiry minus `PASSWORD_RESET_TTL_MS`, so the cooldown needs no new field, survives a restart and holds across instances, where an in-memory map would not. The condition is in the filter of the `updateOne` that saves the token, so concurrent requests cannot both pass it. Every request, in or out of the cooldown, for a known address or not, runs the same `findOne`, generates a token and issues one `updateOne`, and answers 202 with the same body. A request inside the cooldown, like one for an unknown address, matches no document, so it sends nothing and adds nothing: the links already in the mailbox keep working. What differs between a known and an unknown address is the write and the unobserved mail, not the response or the statements issued. Docker Compose sets the cooldown to one second for development and the test setup to one millisecond. Mutations caught: the filter removed (two tests), the link back in the query string.

**Phase 6 product decisions.** Nine questions were put to the product owner and decided as follows.

1. There is no trash screen for now. A soft deleted board is restorable only through the API after the ten second Undo, until the seven day purge.
2. Retention stays at seven days.
3. Undo keeps the person on the dashboard.
4. Workspace admins act as board owners, consistent with Phase 4b.
5. Board colours must come from the board palette. Implemented: `assertBoardColorExists` requires the `board` type.
6. One not found message serves a missing board, a board the caller may not see and a malformed id, so the page does not confirm that somebody else's board exists.
7. The reset email carries no first name.
8. The reset token travels in the URL fragment. Implemented.
9. A per-address cooldown of one email per minute. Implemented.

**P4-26, closed, low: the auth pages carried two h1 elements.** `AuthIllustration` rendered the branding column's title as an `h1` and each auth page rendered its own `h1` beside it, so the sign in, sign up and reset pages had two at every width where the column was on screen. The column is hidden below the large breakpoint with `hidden`, which also removes it from the accessibility tree, so a phone had one. The headline of the brand panel is now a paragraph and the form column's title is the page's only `h1`. The unit test counts `h1` elements in the rendered frame and asserts that none sits inside the `aside`; jsdom loads no stylesheet, so the column is rendered as it is at a desktop width, and the rendered gate counts one visible `h1` at 1440 and at 390.

**P4-27, closed, high: every rate limiter could be bypassed with a header.** The API set `trust proxy` to `true` and the frontend's nginx forwarded `$proxy_add_x_forwarded_for`, which appends to whatever the client sent. With `true`, Express takes the leftmost `X-Forwarded-For` entry as `req.ip`, so the entry the caller wrote became the key of `authLimiter`, `registrationLimiter` and `passwordRecoveryLimiter`. Twelve requests with a different `X-Forwarded-For` each got no 429. Two changes close it. `trust proxy` is now a hop count, `TRUST_PROXY_HOPS`, which makes Express read the address from the right of the header, where each proxy appends what it observed: 1 by default in production, where the frontend's nginx is the only proxy, and 0 in development, where the browser talks to the API directly and the header is ignored. And nginx sets `X-Forwarded-For` to `$remote_addr` instead of appending, since it is the edge and anything the client sent there is a claim rather than a hop. Either change alone closes it for the topology it describes; both together mean a mistake in one is caught by the other. The limiters are keyed on the client IP address, not on the email address a request names, so the earlier wording "per address" was wrong and is corrected where it appeared, including that clients sharing one address share a budget. 9 tests, 2 caught when `trust proxy` is set back to `true`.

**P4-28, closed, medium: session tokens were written to the request log.** `pino-http` serialises request and response headers in full by default, so every authenticated request logged `Authorization: Bearer <jwt>` and every renewal logged the new token from the `X-Auth-Token` response header. A log is read by more people and kept longer than a session, so anyone with log access could replay a live token. The logger now redacts `authorization`, `proxy-authorization`, `cookie`, `set-cookie` and `x-auth-token` on both the request and the response, and the headers stay in the line as `[Redacted]` so it is still clear that one was sent. The redaction lives on the logger itself, built by `createLogger`, so a test that gives it a destination exercises exactly what production runs. 2 tests, 4 mutations caught: the whole option removed, and each of `x-auth-token`, `cookie` and `set-cookie` dropped from the list.

**P4-29, closed, medium: the SMTP connection could be downgraded to plain text.** nodemailer upgrades to TLS only when the server offers STARTTLS, so a party on the path that strips the offer from the server's greeting leaves the session unencrypted, with the relay credentials and the reset link in it, and neither end notices. Unless the connection is encrypted from the first byte (`SMTP_SECURE`), the transport now sets `requireTLS`, so a stripped offer fails the send instead. Plain text has one explicit opt-out, `SMTP_ALLOW_PLAINTEXT`, set only in `docker-compose.yml` for the Mailpit container, which speaks no TLS. The production configuration throws at start if it is set, and `docker-compose.prod.yml` does not mention it. 8 tests, 4 mutations caught: `requireTLS` forced off, the opt-out ignored, the production guard disabled, and the transport built without the options.

**P4-30, closed, low: a board could be restored after its retention window.** The purge job runs once an hour, so a board deleted more than seven days ago stayed restorable until the next run: the documented window was seven days plus up to one interval, and a restore could succeed on a board the next tick was about to delete. `restoreBoard` now takes the retention window and answers 404, the same as for a purged board, when `deletedAt` is at or before the cutoff. It is the exact complement of the purge's guard, so no instant is both restorable and purgeable. 3 tests, 3 mutations caught: the window check removed, the boundary made inclusive, the undeleted branch dropped. The purge race test now simulates its restore with a direct write, because the route refuses the expired board it used to restore.

**P4-31, closed, low: a write could reach a board deleted after the authorization read.** `requireBoardRole` reads the board and the service writes afterwards, and a delete can land between the two. `updateBoard` and `addBoardMembers` wrote by `_id` alone, so they edited a board that is meant to be invisible, and `addBoardMembers` also granted the workspace membership before its write. Task creation and the column check behind a task's status read the board by `_id` too. Each now carries `deletedAt: null` in its own filter and answers 404 when it matches nothing. For board writes the filter is on the write itself, so it is atomic. A task is a different collection and cannot be filtered on its board's state in one statement, so a task write is guarded by the board read that precedes it, and a delete in the gap between that read and the insert is not excluded: the task is restored or purged with the board and is never seen on its own. Task edits that name no column (title, checklist, delete) are not guarded, for the same reason and because they leave nothing visible. 6 tests, 5 mutations caught, one equivalent: the owner check in `createTask` reads the board a second time before the same 404 from the column check, so removing its filter changes nothing observable.

**P4-32, closed, low: the purge job's real wiring had no test.** Every test of the job injected its own `purge` and `intervalMs`, so nothing proved the defaults reach `env.BOARD_RETENTION_MS` and `env.BOARD_PURGE_INTERVAL_MS`, and `server.js` started and stopped the job at import with no way to run it in a test. The startup sequence moved to `startServer` in `src/startServer.js`, with the application, port, database connection, job, shutdown and `process` as parameters whose defaults are the real ones, and `server.js` is now one call to it. The tests run the default job against the database with one board past the window and one inside it, check the schedule is set from the configured interval, and run the start and the SIGINT and SIGTERM shutdown against fakes: connect before listen, the job started once, and on a signal the job stopped, the server drained, the database closed and the process exited, including when closing the database throws. 7 tests, 6 mutations caught: the retention default replaced, the interval default replaced, the job not started, not stopped on shutdown, the exit dropped and the SIGTERM handler dropped.

**P4-33, closed, low: the Undo toast could outlive its session and offer a retry that cannot work.** A restore that failed with 404 (the board is past retention and gone) or 403 (the person may no longer restore it) offered "Try again", and both answers repeat on every attempt. They now say the board can no longer be restored and offer nothing; a network failure or a 5xx still offers the retry, because a second attempt can succeed. Toasts also survived a sign out, and so did their Undo actions, which act as the person who raised them. `ToastProvider` takes a `resetKey` and discards every toast when it changes, and `AuthToastProvider` hands it the signed in user's id, so a sign out or a different person signing in clears the screen. `ToastProvider` stays in `shared` and knows nothing of authentication. Several deletes in a row each keep their own Undo, and an Undo still works after the page that raised it has unmounted: both were already true and are now held by tests. 11 tests, 3 mutations caught: the 404 and 403 branch, the key reset, and the wiring of the user id.

**P4-34, closed, low: pressing a toast action dropped focus on the document.** The action removes the button that holds focus, and the browser answers by leaving focus on `body`, so the next Tab started from the top of the page and a screen reader said nothing. When focus is inside the toast being closed it now moves to the page's first heading, made focusable with `tabindex=-1` when it is not already. The heading is the one target every page has and the thing the action changed, a restored board, may not be on screen yet. Focus that was already elsewhere is left alone. 4 tests, 2 mutations caught: the call removed and the guard on where focus was removed.

**P4-35, not reproduced: deleting a board does not flash "Board not found".** The suspicion was that `useDeleteBoard` removes the board's query from the cache while the page still observes it, so a re-render before the navigation would create a new query, fetch it and meet a 404. Between the removal and the navigation nothing re-renders the board page: the mutation's state lives in `BoardActions`, the toast is added to a provider whose `children` element has not changed, and no list or totals query is active on that page. A test watches every change to the document across the whole delete and navigation, and counts reads of the board: one read, no not found text. It stays as a guard. If a later change makes the page re-render in that gap, the fix is to navigate first and remove the entry after the page has unmounted.

**P4-36, closed, low: a repeated failure was announced once.** The move announcer held a bare string, so the same failed move twice in a row set state to what it already was and wrote nothing to the document; a live region speaks what is added to it, so the second failure was silent. Reproduced through the real hook and `BoardColumns` with a `MutationObserver`. The hook now carries an id that changes with every announcement, and the region renders the message in an element keyed on it, so a repeat is a new node. The text the hook reports is unchanged. 2 tests, 2 mutations caught: the key removed and the id left unchanged.

**P4-37, closed, medium: asking for a reset link destroyed the link the owner already had.** The reset token was one hash and one expiry on the user, so every request replaced the pair. The route is anonymous, so anybody who knew an address could invalidate the link its owner had just been sent, as often as the cooldown allowed, and the owner would never get a working one. The user now carries `passwordResets`, a list of hash and expiry pairs. A request adds one and leaves the rest until their own expiry; the list is capped at `PASSWORD_RESET_MAX_OUTSTANDING`, five by default, dropping the oldest, so the number of live tokens there are to guess stays bounded. A successful reset consumes every outstanding link and bumps `tokenVersion` once, and a password change from the profile empties the list, so no link emailed earlier can overwrite a password chosen since. The link is matched with `$elemMatch`, so a hash is checked against its own expiry and not another link's. The per-address cooldown is unchanged and is now read from the newest expiry. Links issued before this change are not carried over, since the fields they lived in are gone from the schema. Registration still answers "Email already in use" for a taken address. That is a known account enumeration path, accepted for now and mitigated by the registration limiter, which is keyed on the client address since P4-27; the message is unchanged pending a product decision. 29 tests, 8 mutations caught: the cap direction, the cap removed, the consume-all unset, the per-link expiry, the same-element match, the password change clearing, the cooldown filter and the `tokenVersion` bump.

**P4-38, closed, docs: forgot-password was said to do the same database work for an unknown address.** It does not: for a known address the conditional `updateOne` stores a token, and for an unknown address, or one inside the cooldown, it matches nothing and writes nothing. What is the same is the response and the statements issued, in the same order. The plan and the service comment now say that, and no longer claim equal work.

**Phase 6b slice 1, tokens and fonts.** The text tertiary colour is `#5E6B7E`, picked by measuring rather than by rounding the reference's `#8391A4` upward. Contrast of `#8391A4` is 3.21:1 on white, 2.96:1 on the ground and 2.75 to 2.84:1 on the note tints. `#5E6B7E` is 5.41:1 on white, 4.99:1 on the ground (`#F3F6F9`), 4.76:1 on the sky note, 4.80 teal, 4.79 green, 4.73 sand, 4.63 coral and 4.67 lavender, where a note is `oklch(0.955 0.035 h)`. It is the lightest grey that clears every one of those, so it stays the clearly third step below the secondary `#4B586B`. It does not clear 4.5:1 on the chip tints (`oklch(0.93 0.045 h)`, 4.29:1 on coral), so tertiary text never sits on a chip: chips use their own deep step. The gate reads the token from the rendered page and measures it through a canvas.

The `@theme` block is declared `static`. Tailwind 4 only emits a theme variable once a class uses it, so without `static` the easing, shadow and hue tokens would not exist on `:root` until a component happened to reference each of them, and a gate reading `getComputedStyle(documentElement)` would see an empty string. The same rule explains why the mono token is asserted through `var(--font-mono)` and not through a `font-mono` class: no component draws in it yet, so no such utility is generated. Tailwind's own `--radius-*`, `--shadow-*` and `--color-*` scales are not redefined, because that would restyle every component using `rounded-lg` before it has been migrated, so the new radii and shadows have role names (`--radius-card`, `--shadow-column`) beside them.

There is exactly one Content-Security-Policy, in `front/nginx.conf`. `index.html` has no policy meta tag, and the `helmet()` default in the API only governs JSON responses. With the fonts bundled into `/assets/`, `style-src` and `font-src` name no third party host, and `csp.mjs` fails if the policy mentions one, if any request leaves the application origin, or if a font file is not served from it with status 200. Both variable families are split by `unicode-range`, so a Latin page downloads 30 kB of Instrument Sans and 77 kB of Bricolage Grotesque, and DM Mono is fetched only when something draws in it. The built stylesheet grew from 37.58 kB to 44.71 kB, the script bundle is unchanged at 1,496.91 kB because fonts are separate assets. Fontsource also emits `woff` fallbacks that no current browser requests, which add build output and no download.

The page ground and the ink colour are now set on `html` and `body`, and every heading is the display face by an element rule in `@layer base`, so a heading added without `font-heading` cannot fall back. The axe gate stayed at 27 clean surfaces and the layout, board and token gates stayed green with the ground changed from white to `#F3F6F9`.

**P4-39, closed, low: the template icon helper shipped the whole icon set.** `resolveIcon` indexed `import * as Icons from 'lucide-react'` by a name read from the database, and a namespace import cannot be tree shaken, so every glyph the library has was in the main script. Replacing the library alone would have repeated it with Tabler, whose set is larger. The helper is now an explicit table of the nine names the seeded templates store, which is both the contract with the seed data and the reason only those nine are bundled, and an unknown name still falls back to the folder. Measured on the production build, the script went from 1,496.91 kB to 666.38 kB, 363.32 kB to 210.03 kB gzipped, with the stylesheet unchanged at 44.7 kB.

Phase 6b slice 1, icons. Every glyph found a close Tabler counterpart and none was missing. The mapping that is not an identical name: `Trash2` is `IconTrash`, `MoreHorizontal` is `IconDots`, `Save` is `IconDeviceFloppy`, `SearchX` is `IconSearchOff`, `ArrowRightLeft` is `IconArrowsLeftRight`, `ShieldAlert` is `IconShieldExclamation`, `CheckSquare` is `IconSquareCheck`, `MessageSquare` is `IconMessage`, `LogOut` is `IconLogout` and the two brand glyphs are `IconBrandGithub` and `IconBrandLinkedin`. The stored template names stay in the lucide spelling, since they are data in the database. lucide-react gave every icon `aria-hidden` for free and Tabler does not, which is why the decision lives in one primitive: 70 call sites each deciding it would drift, and an unhidden empty graphic is announced by some screen readers. The axe gate, which scans the surfaces with every icon on them, stayed at 27 clean.

Phase 6b slice 1, motion. The `motion` package depends on `framer-motion` and `motion/react` re-exports it, so the two names were one library imported through two doors. Dropping the direct dependency does not remove `framer-motion` from `node_modules`, it removes the second way of importing it, which is what stops a new file from picking the wrong one. The suite-wide animation stub in `src/test/setup.ts` mocked only the old name, so `Modal` and `Drawer`, which already used the new one, ran against the real library while everything else was stubbed. The stub now targets `motion/react` and adds a pass-through `MotionConfig`, and `Drawer.test.tsx` opts back into the real library with `vi.unmock`, because it asserts the entrance axis, which is one of the props the stub strips.

The reduced-motion policy has two halves because the library and the stylesheet do not know about each other. `reducedMotion="user"` makes motion components skip transform and layout animation and keep the opacity fade, so an exit still completes and `AnimatePresence` still unmounts the element. The CSS rule covers everything that is not a motion component. Its duration is 0.01 ms rather than zero so `animationend` and `transitionend` still fire for code that waits on them. No component in the application listens for either event today, and the dialog unmount is asserted in a real browser under the preference rather than assumed. The ambient animation setting of the Phase 6b table is separate and arrives with the wind layer in slice 2: the system preference forces it to Still and this rule is the fallback beneath it.

**P4-40, closed, medium: the field boundary measured 1.47:1.** The shared `Input`, `Textarea` and `PasswordInput` drew their border in `gray-300`, which is 1.47:1 on white, and a field is found by its boundary, so WCAG 1.4.11 asks for 3:1. The reference design's own value is worse, a 0.12 alpha navy at 1.28:1. The frame is now one token, `--color-line-control`, a 0.5 alpha navy that measures 3.34:1 on white and 3.26:1 on the ground, shared by the three fields through `fieldStyles.ts` so they cannot drift apart. The same token is the boundary of the switch track and the segmented frame in the next units. A border declared at 1.5 pixels is drawn at 1 pixel on a 1x display, because Chrome snaps border widths down to whole device pixels. The contrast is a property of the colour and holds at both.

Phase 6b slice 2, keyframes, buttons and fields. The thirteen keyframe sets of section 5 of the specification are in `index.css` under their reference names (`bbUp`, `bbFade`, `bbIn`, `bbLand`, `bbAway`, `bbFlow`, `bbDrift`, `bbSway`, `bbPop`, `bbGap`, `bbSpin`, `bbShake`, `bbToast`, plus `bbView` and `bbFloat` for the shell and the auth screen). The reference's duplicated `bbShakeA` and `bbShakeB`, and `bbToastA` and `bbToastB`, were an animation restart hack of the design tool and are one keyframe set each here, restarted by a React `key`. Each timing lives once as an `--animate-bb-*` theme token, so a component names `animate-bb-up` and never writes a duration. `design-tokens.mjs` asserts that every keyframe exists and that every one of the eleven animation tokens names a keyframe set and collapses to under a millisecond and one iteration under `prefers-reduced-motion`.

The focus ring is a Tailwind `@utility`, `focus-ring`, with an inset and a white-on-ink variant. It is an outline offset 2 pixels from the control in the focus token, 4.6:1 on white and 4.25:1 on the ground, so it never depends on a control's own border or fill. The first version of `Button` used `transition-all`, which includes `outline-offset` and `outline-width`, and a ring measured straight after a Tab read as the browser's own white 3 pixel default because it was still fading in over 200 milliseconds. A keyboard user needs the ring to be there on the frame they press Tab. `Button` now names its transitioned properties, and the gate reads the outline with no wait.

`Button` takes six variants (primary, secondary, glass, ghost, danger, danger-ghost) at 40, 44 and 52 pixels, a spinner from `IconLoader2` driven by `bbSpin`, and a press scale. Every hover lift and press is gated with `enabled:` so a disabled button does not respond to a pointer, and a disabled button is dimmed while a loading one is not, since the spinner is its state. `Input`, `Textarea`, `PasswordInput` and `Field` follow the field decisions above: 48 pixel field, radius 14, 15 pixel text, a 13 pixel semibold label in secondary text, danger-strong error text (8.89:1 on white) and tertiary hint text (5.41:1). Focus swaps the border for the focus token and adds the 4 pixel halo. The halo alone is 1.2:1 and is decoration, the border change is the indicator.

Phase 6b slice 2, the new primitives. `Chip`, `SegmentedControl`, `Switch`, `ProgressBar` and `Cover` are in `shared/ui`, with `hue.ts` holding the six hues, their whole-literal class maps, `hueFromSeed` and `coverGradient`. The class maps are written out in full because Tailwind reads the source for complete class names and `bg-${hue}-tint` would render unstyled while every assertion passed, which is P4-6 again. `hueFromSeed` is FNV-1a reduced to an index and is pinned by a test on five seeds: changing the hash recolours every avatar in every session, so it has to be a decision and not a refactor.

Four of the reference design's values failed WCAG 1.4.11 and were darkened, each by measurement. The unchecked switch track (16 percent navy, 1.4:1) is now the control border colour, 3.34:1 on white, and the white knob on it is 3.34:1. The segmented frame uses the same token at 3.34:1, and the selected segment, which the reference draws as white on a 5 percent navy at 1.2:1, gains a 1 pixel ink ring at 17.28:1; the unselected text on the track is 6.51:1. The progress fill is the new `edge` step of its hue and not the `mid`: the mid is 2.35 to 2.59:1 on white and about 2:1 on the track, the edge (lightness 0.6) is 3.26 to 3.57:1 on the track over white and 3.46 to 3.79:1 over the ground for all six hues. The on switch track is the reference's value, 3.54:1 on white, and its knob is 3.54:1. Chip text on its tint measures 6.30 to 7.16:1 across the six hues and 6.44:1 neutral. A chip never takes the tertiary text colour, which is 4.29:1 on the coral tint.

`SegmentedControl` is a radio group of real radio inputs inside labels, the same construction as `SwatchPicker`, so the arrow keys, the wrap from the last segment to the first, the single tab stop and the group name come from the browser instead of from key handling written here. `Switch` is a button with `role="switch"`, a 44 by 26 track and a knob that travels 18 pixels on the spring easing, all CSS. `ProgressBar` clamps a value past either end, draws an empty bar for NaN or a zero maximum (a board with no cards), and takes a `valueText` so a bar can say "3 of 8 landed". `Cover` draws the hue gradient, shows the image over it, falls back to the gradient when the image fails and tries again when the source changes; it is decorative unless given `alt`.

Nothing in the application renders these yet, and a Tailwind class that is not in the generated stylesheet is a silent no-op, so jsdom proves nothing about them. `design-tokens.mjs` borrows the page the dev server serves: it reads the transformed entry module for the React and ReactDOM URLs, imports them and `/src/shared/ui/index.ts`, and mounts the real primitives into the real page with the real stylesheet. It then measures what the browser painted: every chip hue against its token, the switch dimensions and travel, the segment ring, the rendered arrow key behaviour and the keyboard focus ring on the switch and on the segment, and the progress fill widths and contrast. The gate went from 93 to 160 assertions. The repository gains no harness file for it.

Phase 6b slice 2, the surfaces. `Modal` rises in on `bbUp`: 16 pixels up and a 3 percent scale, 350 milliseconds on the standard easing, with a 200 millisecond fade for the scrim. It leaves with a 200 millisecond fade on the exit easing and without the rise, because something a person has just dismissed should not make them wait. `motion` drives these from JavaScript and cannot read a CSS custom property, so the two easings are repeated as bezier arrays in `motionTokens.ts`, and `motionTokens.test.ts` reads `index.css` and fails if either copy differs from `--ease-standard` or `--ease-exit`. Under `prefers-reduced-motion` the panel keeps its fade and loses its travel, which the gate samples three animation frames after opening: the transform is the identity and the opacity is still below 1. With motion on, the transform is not the identity at the same frame.

`Menu` has its enter and exit back, the item `UserMenu` lost when it moved onto the primitive in Phase 6. The popup rises 4 pixels and fades in over 180 milliseconds from the edge it is lined up with, and fades out over 120. Keeping a popup mounted for its exit has a cost the old conditional render did not: a closed menu stays in the document for the length of its fade. `usePresence` reports that, and the leaving popup is `inert` and `aria-hidden`, so it cannot be focused, clicked or announced while it fades. A test replaces `usePresence` to assert it, because the suite-wide stub reports everything as present, and the gate asserts in a real browser that a leaving menu is hidden and inert or already gone and that it is out of the document after 500 milliseconds. The suite-wide `motion/react` stub gained a `usePresence` that always answers present. The entrance scales the popup from 97 percent, so a bounding box read while it plays is smaller than the box the item has: the Playwright test that asserts the "Move to" items are 44 pixels tall read 43.3 and failed. It now reads `offsetHeight`, the layout height, which a transform does not change.

`Toast` is a dark ink pill 28 pixels above the bottom edge, with the wind icon in `--color-on-ink-accent` (10.32:1 on the ink), the message in white (17.3:1), a translucent pill for the action (white on it is 12.2:1 at 14 percent and higher at 26) and the dismiss glyph at 80 percent white (11.3:1). Every control on the ink takes the white focus ring. The entrance is one `bbToast` keyframe set, because each toast is a new element and plays it on mount, which the reference's `bbToastA` and `bbToastB` alternation only emulated. The live region, the focus recovery and the `resetKey` behaviour of Phase 6 are untouched and their tests pass unchanged. The gate measures the toast's radius, shadow, centring, offset, contrast pairs and the white keyboard ring in a signed in session that deletes a board.

`Drawer` takes the modal surface (radius 26 on the sheet's top corners and on the side panel's left, the modal shadow, the blurred scrim) and nothing else: it stays the bottom sheet below `md` with the same spring, and it is replaced by the task modal in slice 7. Its header padding is two pixels tighter on each side from `md` up, which made the task form fit a 1024 by 768 viewport, and `responsive.mjs` asserted that the form scrolls inside the panel there on the strength of the form being too tall. A form that fits has nothing to scroll and the assertion read it as a failure. The check now takes the viewport down to 420 pixels when nothing overflows and asks the body to scroll there, so it holds whatever the form's height is.

Observed and not investigated: reading the computed opacity of a dialog every animation frame while it fades in shows one frame at 0 near the end of the fade, between values above 0.99 and the final 1. It reproduces on the `Modal` as it was before this slice, so it is not introduced here. It may be a one frame flicker as `motion` hands a Web Animations opacity animation over to its inline style, or an artefact of reading the style inside a frame callback, and it was not told apart. Nothing here depends on it.

Phase 6b slice 2, the content primitives. The Avatar contrast item left open by Phase 5 is closed by measurement. The reference fills an avatar with the hue's mid step and draws the initials in ink, and the gate measures that pair in a real browser for each hue: sky 7.13:1, teal 7.35, green 7.34, sand 6.92, coral 6.66 and lavender 6.71, at 10 pixels bold, so every hue holds 4.5:1 with room. The earlier blue-on-light-blue replacement was never measured and no longer exists. `Avatar` takes a `seed`, the user id where there is one, because a name can change and the colour a person has been seen in should not; without a seed the trimmed lowercase name is the seed, so no existing caller changes shape and none passes the id yet. Passing it is a one prop change per call site and belongs to the slice that touches that screen.

The `SwatchPicker` outline is the hue's edge step because the mid step is 2.35 to 2.59:1 on white and a swatch is a shape that has to be seen on its own; the edge is 3.75 to 4.12:1 on white and 3.46 to 3.79:1 on the ground. A swatch with no hue, such as a template colour stored as a hex value, is outlined in the control border colour. The chosen swatch has the reference's white and ink double ring, which is ink on white and so does not depend on seeing the hue. Hover grows it by 15 percent and the keyboard ring is drawn on the label through `:has(:focus-visible)`, since the radio inside it is visually hidden. Swatches stay 32 pixels, not the reference's 22 and 24, because the responsive gate and touch use both ask for more.

`StatTile` takes a hue instead of the colour names it had (`blue`, `orange`, `purple`), which was a rename at one call site in `BoardStats` and left that file's icon colours alone for the dashboard slice. `EmptyState` and `StatTile` no longer import `motion`: neither is ever unmounted with an exit, so their entrance is the `bbUp` keyframe, staggered through the animation delay and held invisible until it starts by the animation's own fill mode, and the reduced motion rule collapses it.

`LoadingScreen` has no generic spinner. The mark is the wind glyph swaying on `bbSway` over a gradient tile. The reference's logo gradient ends at lightness 0.74, where a white glyph is 2.2:1, so the loading mark has its own token, `--gradient-mark`, with the same two hues and a lightest stop of 0.6: white on it is 5.98:1 at the start and 3.65:1 at the end, measured from the stops read out of the token so the check follows them if they move. `Button` and `SwatchPicker` use a Tabler `IconLoader2` on `bbSpin` for the inline wait, as the reference does, and nothing else in the interface spins.

Phase 6b slice 2, the wind layer. The formulas are the specification's, as functions of the index only: no random number is drawn, so two renders of one level are the same markup and a test can pin a streak or a particle by its index. `windMath.test.ts` pins the path, dash, stroke, width and animation of the streaks and the position, shape, fill and animation of the particles from values worked out by hand from the formulas rather than copied from the output, and mutating any constant in them is caught. Nothing in the layer is a timer, an animation frame or state. Each element carries one `animation` and the browser runs them, and the gate observes the box with a `MutationObserver` for 1.2 seconds while it plays and asserts zero records, which is the real meaning of "no work per frame".

`still` renders nothing, not a paused layer. WCAG 2.2.2 asks for a way to stop motion that runs for more than five seconds, and an element that is absent cannot be started again by an animation that failed to pause. A reduced motion preference renders nothing for a second reason that is specific to this layer: the global rule collapses every animation to 0.01 milliseconds played once, which for a streak means one jump to the last frame, so the streaks would sit frozen across the page instead of being gone. The component reads the preference through `useMediaQuery` and does not rely on the stylesheet. The gate asserts both halves in a real browser: under `prefers-reduced-motion: reduce` the layer is not in the page and nothing in the box is animated, and with motion on a breezy layer has 15 running animations, one per streak and particle.

It is placed, not positioned: the layer is `absolute inset-0` and the caller makes the box `relative`, which the gate's probe does. A control under it stays clickable because the layer takes no pointer events, asserted with `elementFromPoint` on the control. The Breeze setting that chooses the level, and the preference stored on the user, belong to slice 3 and the profile.

What slice 2 leaves for the screens. Inside `shared/ui` no raw palette class remains outside the tests: the 80 raw palette uses there became 0, and the white that is left is deliberate, on an ink surface (primary button, toast) or the translucent white of the glass button. Outside `shared/ui` there are 343 raw palette class uses in 47 files, 194 of them grey, and 36 uses of plain `white` or `black`. The screens replace them in slices 3 to 9. A raw palette class that is still there does not fail a gate: the gates measure contrast and layout, not which class produced them.

Phase 6b slice 3, the breeze field. The level lives on the user because the plan says the choice follows a person across devices, and a browser-only setting cannot do that. The enum is declared once in the model and the request schema imports it, so a fifth level is one edit. Two layers refuse a value outside the four, the Zod schema before anything is written and the model's enum validator under `findByIdAndUpdate` with `runValidators`, so an HTTP status alone cannot tell which one answered. The test therefore parses the schema directly as well, and mutating the schema to a plain string is caught there while the route test still passes. The default does the work for existing accounts: Mongoose applies a schema default to a document hydrated without the path, which a test proves by unsetting the field in the collection and reading `/auth/me`. No migration or seed change is needed.

Phase 6b slice 3, the shell. It is a layout route: `SignedInLayout` renders `AppShell` around the protected routes and the unknown address for a visitor with a session, and nothing around the same addresses for one without, so a signed out visitor is never redirected from a page that does not exist and the login, registration and reset pages never get a sidebar of boards they cannot read yet. Two things the shell hosts are shared by every view. The create board dialog lives in the shell because the sidebar's plus button and the home page's New board both open it, and its write moved out of `useBoardDashboard` with it: a failed create is a toast and the dialog stays open holding the draft, where it used to replace the whole page with an error screen. The view's main action is drawn in the header through a portal, `ShellAction`, so the handler stays in the view that owns the state and the button sits where a person looks for it. With no shell around it the action renders in place, which is how every page test still renders it. The page's own title block is still the h1, now a header inside `main` and no longer a banner landmark: the shell's header is the banner, and a second one is a violation.

Phase 6b slice 3, what the footer held. The legal links did not live in the footer. The footer held the author's name and year and three links to the author, LinkedIn, GitHub and email, and the privacy policy and the terms were reachable only from the registration form. The sidebar foot now carries all of it: the account button, the privacy policy and the terms as buttons that open the existing dialogs, the three links with their names and `target` and `rel` kept, and the name and year. None of it is a `footer` element, because the board-layout gate asserts a board has none and the sidebar is chrome around a page. The footer's emoji went with it. The preservation table's row for the legal links still holds: the registration form keeps them and the sidebar foot adds them where a signed in person is.

Phase 6b slice 3, the logo. The tile uses the reference gradient, `oklch(0.55 0.14 248)` to `oklch(0.74 0.12 192)`, and its shadow. White on the light stop measures 2.2:1. The product owner decided to keep it: a logo is exempt from 1.4.3 and 1.4.11, and the link's name is the wordmark's own text, so nothing depends on the glyph being read. The gate asserts the ratio is between 2.0 and 2.5, so the exemption is a measurement and a change to either stop is noticed. The loading mark keeps its own darker gradient, which was built to clear 3:1 because a wait is not a logo.

Phase 6b slice 3, the navigation panel. Below 1024 pixels the sidebar is fixed, off screen and `invisible` and `inert` while closed, so none of its links is seen, tabbed to or read, and the transition on `visibility` makes it vanish only once it has slid out. Open, it is a `dialog` named Navigation with the focus trap, and the rest of the page is `inert` rather than the panel being `aria-modal`: the account menu and the dialogs opened from the panel are portalled to the body, and `aria-modal` would hide them from assistive technology. It closes on Escape, on the scrim, on its own close button, when the address changes and when a link is chosen even where the address does not change, which only the link can say. Growing the window past the breakpoint closes it, so shrinking it again does not bring back a panel nobody opened. A dialog opened from the panel answers Escape itself, and the panel's Escape listener skips the key while any modal dialog is open, or the panel would close underneath a dialog that had just closed. The scrim is `aria-hidden` and has no handler a keyboard needs: Escape and the close button are the keyboard's ways out. Closing on a change of address and closing on a link are both needed and neither covers the other: a link to the page that is already open changes nothing, and the account menu's Profile item is not a link.

Phase 6b slice 3, the gates. The sidebar is a complementary landmark, which took the axe gate's `region` count from 6 on the dashboard and 17 on the profile to 0, and `landmark-one-main` from 1 to 0 on every signed in surface, with the shell's `main` and `banner`. The gate scans one more surface, the navigation panel open at 390 pixels, which is clean. The responsive gate gained that panel as a surface at 320, 390 and 768 and opens it to reach the account menu below 1024, and its dashboard create-board surface uses the header's New board because the plus button is not on screen while the panel is closed. The board-layout gate measures the columns against the page's own title block and no longer against the shell's header, and it asserts at 1440 that the four default columns overflow, which they now do: the sidebar and the page margins leave 1140 pixels for 1376. A 1920 viewport takes over the fits case. The board still pins to the viewport with no footer, columns scrolling inside themselves. The design tokens gate measures the shell in a signed in session: the ground's three gradients, the sidebar at 240 by 876 from 12 pixels in, its blur and saturation, the 56 pixel header, the logo, the wordmark weights, the nav and board items and the eyebrow label, and it photographs the sidebar with its text made transparent to find the darkest pixel behind the small text on the glass. The four pairs measure 5.18 to 7.02:1.

Phase 6b slice 3, requests. The sidebar reads the board list through the same query the home page reads, so the home page makes one `GET /boards`, as before. The board page and the profile page make one more than they did, the sidebar's. The create board dialog is mounted on every page, and its palette query is now enabled only while it is open, so a board page does not ask for a palette it will not show.

Phase 6b slice 3, the Breeze setting in the client. Two values are kept apart because they have different owners. `stored` is the person's choice and follows them across devices, and `level` is what the interface plays, which is `stored` unless the system asks for reduced motion, in which case it is still. The preference never overwrites the choice: it is lifted the moment the preference is, the box keeps the stored segment selected and still accepts a new choice, because that choice applies on every other device, and a gate checks that a session opened with the preference on leaves the stored value untouched on the server. The first value comes with the signed in user, so nothing is fetched to learn it, and the query's own function, a read of the user, is used only to ask the server what is stored after a failed write. A choice is written to the cache at once and sent in the background. The rollback has two guards, each found by a mutation: it applies only if nothing newer was chosen since, so Gusty failing late does not undo Calm, and it is followed by a read of the server, because the value before a choice is not always the stored one after two failures in a row. A rollback alone is what a person offline sees, since the read fails too, and a test holds that case. TanStack Query calls the per-call error callback only for the latest call, so the toast for an older failure that was overtaken is not shown, which is right: the later choice saved and the control shows it. The key is `['breeze', userId]` and not under the user's detail key, which every profile save invalidates, so saving a profile does not refetch the setting. With no provider a component reads a still sky that cannot be changed, so it renders on its own and animates nothing. Measured in the browser: the wind layer is the 6 streaks and 9 particles of the specification at the default, 11 and 20 at Gusty, none at Still, all 15 running, takes no pointer events and sits under the sidebar; the four segments fit the sidebar's box as wide as their labels, each 28 pixels tall; a reload keeps the choice; under emulated reduced motion there is no layer and no animation that repeats.

**P4-41, closed, low: a key sent in the same instant as the pick up is lost, and two keyboard tests sent one.** `KeyboardSensor` starts listening for the arrows one task after the key that picks a card up, so an arrow sent in the same instant is dropped. Two tests pressed Space and an arrow back to back and had passed because the page was fast enough to run that task in between. With the shell on the page, they failed 10 times in 12 on their own with retries off. The wait is for the pick up announcement, which is what a person does, and both then passed 16 times in 16. The same hazard holds between two arrows: the sensor measures a key from where the previous one left the card, so an arrow sent before the previous one was announced is measured from a stale position. With the wind animating, the arrows test failed twice in a full run, and each arrow now waits for its announcement, after which both tests passed 20 times in 20. This is not P2-6a, which is a pointer drag, and the pointer sensor was not touched. The first theory, that the row scrolled because four columns no longer fit at 1440 and the sensor's smooth scroll swallowed the key, was tested and was wrong: the announcements lagged the same way at 1920, where nothing scrolls, and an instant scroll did not fix the tests.

**P4-42, closed as accepted behaviour, medium: at 1440 the default four column board scrolls sideways.** The sidebar takes 252 pixels and the page margins 40, which leaves 1140 for the 1376 that four columns need. The reference design's 292 pixel columns with 14 pixel gaps need 1210, so they overflow at 1440 too. It is a consequence of the layout the product owner chose, not a defect in the code, and it is recorded for slice 6, which sets the column width. The board-layout gate asserts the overflow at 1440 and the fit at 1920.

**P4-43, open, low: the signed out screen can only be stilled by the system.** The brand panel's wind layer and the two floating cards run for as long as the page is open, which is the WCAG 2.2.2 case, and the stop control the design provides is the Breeze setting, which is stored on the user and so does not exist before sign in. Today the screen plays the default level, `breezy`, and a `prefers-reduced-motion` preference removes the wind and rests the cards, which is the only way to stop it. The streaks are translucent white and cross the text now and then; the contrast figures in the 6b.4 row are measured against the gradient with the wind absent. Closing it takes a decision that is the product owner's: remember the last stored level in the browser and apply it on this screen, or end the ambient animation after a few seconds. Not decided here.

**P4-44, open, low: the consent line names the documents but does not link them.** The plan says `RegisterForm` drops its own copy of the legal dialogs for the shell's `LegalLinks`, and `LegalLinks` is two buttons, not a sentence, so the checkbox reads "I agree to the Terms of Service and the Privacy Policy" as plain text and the two buttons sit under the form on both modes. The earlier inline links are gone. Closing it means either letting `LegalLinks` render inside a sentence or accepting the placement.

The product owner decided it: the reference's 292 pixel column width stays and the row scrolls horizontally at 1440, as a kanban board normally does. Nothing is changed to make four columns fit, and the gate keeps asserting the overflow.

**Product decision: a board's hue is the colour its owner chose, not a hash of its id.** The board palette becomes the six hues of the design system (sky, teal, green, sand, coral, lavender), the colour picker in the create board dialog offers those six, and the sidebar dot and the Home tile cover are drawn from the board's own colour. `SidebarBoards` still takes the dot's hue from `hueFromSeed(board._id)`, which was a stand-in; replacing it is part of slice 5 and a note sits at the line. `hueFromSeed` stays for avatars, which have no chosen colour.

**P2-6a, closed: the pointer drag test was pressing before the page had settled, and the drawer's scrim was catching the press.** The mechanism and the measurements are in section 5.3. Two changes: `Drawer` is inert to the pointer from the moment it is closed, with a component test that fails without it, and the spec waits for the dialog to be gone and for the card's own transform to be cleared instead of comparing two bounding boxes. The spec then passed 24 of 24 in isolation with retries off, 16 of 16 with only the spec change, and the full suite passed 20 of 20. The reading of the earlier entries that this was contention or state carried between tests was close but not it: contention is what made the card's spring start late.

**Playwright specs: fixed waits replaced by observable state, and a type check.** Sonar flagged the fixed waits and the weak random in `e2e/tests`. The 600 ms wait before the keyboard drag specs focus a handle is now `waitUntilSettled` in `fixtures.ts`, the card's own opacity and transform, shared with the pointer drag spec. The 300 ms wait before the mouse is released now waits for dnd-kit's announcement to name the target column, since the column renders no over-state of its own. The 100 ms and 25 ms pauses stay, marked `NOSONAR typescript:S2925`: they pace the input, because dnd-kit coalesces a burst of moves, and nothing observable says when to send the next one. The 11 second wait that proved a focused toast outlives its 10 second timer is `page.clock.runFor(11_000)`; the toast's timers are `setTimeout` and `Date`, so the fake clock drives them, and with focus no longer pausing the toast the spec fails. The 1.5 second wait before reading Mailpit for an unknown address is a control: a reset for a real account is requested after it and awaited, and mail leaves in request order, so the control arriving makes the absence meaningful. The unique email stamp uses `randomUUID`, and `columnCount` escapes the title before it builds its pattern. `e2e/tsconfig.json` and `@types/node` are new, with `npm run typecheck`; it reported one real error under strict mode, `NodeListOf` iteration needing the `DOM.Iterable` lib. Measured with retries off: 20 of 20 full suite, 45 of 45 for the board flow spec and 55 of 55 for the edit, delete and password reset specs, each run five times.

**Drag and drop, native HTML5 against dnd-kit, evaluated at the product owner's request. Recommendation: keep dnd-kit.** The prototype uses native drag and drop. The evidence for staying:

| Question | Native HTML5 | dnd-kit, as built |
|---|---|---|
| Pickup reliability | A throwaway page with the same choreography (press, wait 100 ms, move 12 px) fired `dragstart` 30 of 30 on a draggable card and 30 of 30 on a draggable button | Picked up every time the press landed on the handle: 24 of 24, 16 of 16 and the full suite. The failure was upstream of both |
| Keyboard | None. The reference states there is no keyboard alternative | Full model on the keyboard sensor: pick up, move across columns and positions, drop, cancel, with announcements and focus returned (P4-17, P4-18), plus the Move to menu for WCAG 2.5.7 |
| Screen reader | No announcements, and a drag has no accessible name or state | Live region with the board's own wording, tested by four Playwright specs |
| Row auto-scroll | The browser scrolls near an edge by its own rules, which cannot be tuned or tested here | Configurable, and the phone spec asserts the row follows the card across four columns |
| Drag preview | A static snapshot taken at `dragstart`, which is why the reference hides the card one tick later | `DragOverlay` is a live element that can be scaled, tilted and shadowed |
| Touch | Not measured here. Native drag on mobile browsers is a long press with a system drag image and competes with scrolling the column row | A pointer sensor on the handle, with `touch-action` set on it. Not measured on a device either |
| Playwright | Works with the real mouse, as the spike shows | Works with the real mouse |

A hybrid buys nothing: the only thing native offers that dnd-kit lacks is the browser's own drag image, and it costs the keyboard model and the announcements, which are the reason the interaction passes the accessibility gate. The three visual parts of the reference are all reachable with dnd-kit, for slice 6. The 58 pixel dashed gap is a placeholder rendered by `Column` at an index held in the drag hook's state, computed on `onDragOver` from the card under the pointer and which half of it the dragged card's centre is in, with the dragged card hidden in its list and the keyboard path placing the gap from the same snapshot it already uses. The column highlight is `isOver` from the `useDroppable` the column already has, extended to also be true while the card under the pointer belongs to that column. The landing animation is two parts: `dropAnimation` on `DragOverlay` for the overlay settling, and the `bbLand` class on the moved card for the settle, keyed on a `landedId` the mover sets on drop and cleared when the animation ends, under the global reduced-motion policy.

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
