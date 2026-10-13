// The board's layout, measured on a rendered page at a phone, a laptop and a
// wide desktop.
//
// Every property asserted here is a fact about computed layout, which no
// layer below a real browser produces: jsdom loads no stylesheet, so a
// component test can see that a class is present and never that it did
// anything. A board that wraps its columns, a page that scrolls sideways, a
// column whose header scrolls away with its cards, and an auto-scroll that
// never fires would each pass every unit test in the repository.
//
// What is asserted is behaviour rather than coordinates, so a redesign that
// changes the colours, the spacing or the column width does not break it.

import { chromium } from "playwright";

const FRONT = process.env.E2E_FRONT_URL ?? "http://localhost:5173";
const API = process.env.E2E_API_URL ?? "http://localhost:5000/api/v1";

const log = (...a) => console.log(...a);
const results = [];

const check = (label, ok, detail = "") => {
  results.push(ok);
  log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -> ${detail}` : ""}`);
};

const req = async (method, path, token, body) => {
  const response = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
};

const user = {
  firstName: "Layout",
  lastName: "Gate",
  email: `layout-${Date.now()}@example.test`,
  password: "LayoutGate1",
};

const registered = await req("POST", "/auth/register", null, user);
if (registered.status !== 201 && registered.status !== 200) {
  console.error(`registration failed with ${registered.status}.`);
  console.error(
    "Registration is rate limited to twenty an hour. Run: docker compose restart back",
  );
  process.exit(1);
}
const token = registered.body.data.token;

const templates = await req("GET", "/templates", token);
const boardColors = await req("GET", "/colors?type=board", token);
const taskColors = await req("GET", "/colors?type=task", token);

const board = await req("POST", "/boards", token, {
  title: "Layout board",
  description: "created to be measured",
  color: boardColors.body.data[0]._id,
  template: templates.body.data[0]._id,
});
const boardId = board.body.data._id;
const boardColumns = [...board.body.data.columns].sort(
  (a, b) => a.order - b.order,
);
const [firstColumn, , , lastColumn] = boardColumns;

// Enough cards in the first column to overflow it at any of the viewports
// below, and nothing in the others, so the empty state is on screen too.
const TASKS = 14;
for (let i = 1; i <= TASKS; i += 1) {
  await req("POST", `/tasks/board/${boardId}`, token, {
    title: `Layout task ${i}`,
    status: firstColumn._id,
    color: taskColors.body.data[0]._id,
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

await page.goto(`${FRONT}/login`);
const form = page.locator("form").first();
await form.getByLabel("Email address", { exact: true }).fill(user.email);
await form.getByLabel("Password", { exact: true }).fill(user.password);
await form.getByRole("button", { name: /sign in/i }).click();
await page.getByText("Your boards").waitFor();

const settle = async () => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
};

/** Everything the layout assertions need, read in one round trip. */
const measure = () =>
  page.evaluate(() => {
    const row = document.querySelector(
      '[role="region"][aria-label="Board columns"]',
    );
    const headings = [...row.querySelectorAll("h2")];
    const columns = headings.map(
      (heading) => heading.closest('div[class*="shrink-0"]').parentElement,
    );
    const body = columns[0].querySelector(".overflow-y-auto");
    const empty = columns[1].querySelector(".overflow-y-auto");
    const doc = document.documentElement;
    return {
      pageWide: doc.scrollWidth - doc.clientWidth,
      pageTall: doc.scrollHeight - doc.clientHeight,
      row: {
        scrollWidth: row.scrollWidth,
        clientWidth: row.clientWidth,
        overflowX: getComputedStyle(row).overflowX,
        tabIndex: row.tabIndex,
        top: row.getBoundingClientRect().top,
        bottom: row.getBoundingClientRect().bottom,
      },
      columnTops: columns.map((c) => Math.round(c.getBoundingClientRect().top)),
      columnWidths: columns.map((c) =>
        Math.round(c.getBoundingClientRect().width),
      ),
      columnBottoms: columns.map((c) =>
        Math.round(c.getBoundingClientRect().bottom),
      ),
      body: {
        scrollHeight: body.scrollHeight,
        clientHeight: body.clientHeight,
      },
      emptyBody: {
        height: empty.getBoundingClientRect().height,
        hint: empty.textContent.trim(),
      },
      footers: document.querySelectorAll("footer").length,
      // The page's own title block, not the shell's banner above it: the
      // columns sit directly under the former.
      headerBottom: document.querySelector("main header").getBoundingClientRect()
        .bottom,
      viewportHeight: window.innerHeight,
    };
  });

const VIEWPORTS = [
  // Narrower than four columns at any width, so the row must overflow.
  { name: "phone 390", width: 390, height: 844, overflows: true },
  { name: "laptop 1024", width: 1024, height: 768, overflows: true },
  // The sidebar takes 252 pixels and the page margins 40 more, so the four
  // columns of the default template, 1376 pixels with their gaps, do not fit
  // beside it at 1440.
  { name: "desktop 1440", width: 1440, height: 900, overflows: true },
  // Wide enough for the four columns of the default template beside the
  // sidebar, so only the page-level assertions apply: nothing may scroll
  // sideways at all.
  { name: "wide desktop 1920", width: 1920, height: 1080, overflows: false },
];

for (const viewport of VIEWPORTS) {
  log(`\n--- ${viewport.name} ---`);
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(`${FRONT}/board/${boardId}`);
  await page.getByRole("region", { name: "Board columns" }).waitFor();
  await page.getByText("Layout task 1", { exact: true }).waitFor();
  await settle();

  const m = await measure();

  check(
    "the page does not scroll sideways",
    m.pageWide <= 0,
    `document overflows by ${m.pageWide}px`,
  );
  check(
    "the page does not scroll vertically",
    m.pageTall <= 0,
    `document overflows by ${m.pageTall}px`,
  );
  check(
    "every column sits on one row, none wrapped",
    new Set(m.columnTops).size === 1,
    `tops ${m.columnTops.join(", ")}`,
  );
  check(
    "every column has the same fixed width",
    new Set(m.columnWidths).size === 1,
    `widths ${m.columnWidths.join(", ")}`,
  );
  check(
    "the column row owns the horizontal scroll",
    m.row.overflowX === "auto" || m.row.overflowX === "scroll",
    `overflow-x is ${m.row.overflowX}`,
  );
  check(
    viewport.overflows
      ? "the column row is wider than its box"
      : "the column row fits its box",
    viewport.overflows
      ? m.row.scrollWidth > m.row.clientWidth
      : m.row.scrollWidth <= m.row.clientWidth,
    `scrollWidth ${m.row.scrollWidth}, clientWidth ${m.row.clientWidth}`,
  );
  check("the column row can take keyboard focus", m.row.tabIndex === 0);
  check(
    "the board page has no footer",
    m.footers === 0,
    `${m.footers} footer elements`,
  );
  check(
    "the columns fill the height from under the header to the bottom of the screen",
    m.row.top >= m.headerBottom &&
      m.row.top - m.headerBottom < 40 &&
      m.columnBottoms.every(
        (b) => b <= m.viewportHeight && b > m.viewportHeight - 40,
      ),
    `header ends at ${Math.round(m.headerBottom)}, columns end at ${m.columnBottoms[0]} in a ${m.viewportHeight}px viewport`,
  );
  check(
    "a long column scrolls inside itself",
    m.body.scrollHeight > m.body.clientHeight,
    `scrollHeight ${m.body.scrollHeight}, clientHeight ${m.body.clientHeight}`,
  );

  const heading = page.getByRole("heading", {
    level: 2,
    name: boardColumns[0].title,
  });
  const before = await heading.boundingBox();
  await page.evaluate(() => {
    const row = document.querySelector(
      '[role="region"][aria-label="Board columns"]',
    );
    const body = row
      .querySelector("h2")
      .closest('div[class*="shrink-0"]')
      .parentElement.querySelector(".overflow-y-auto");
    body.scrollTop = body.scrollHeight;
  });
  const after = await heading.boundingBox();
  check(
    "the column header stays in view while its body scrolls",
    Boolean(before && after) &&
      before.y === after.y &&
      after.y >= 0 &&
      after.y < m.viewportHeight,
    `header y ${before?.y} before, ${after?.y} after`,
  );
  check(
    "the last card is reachable by scrolling the column",
    await page.getByText(`Layout task ${TASKS}`, { exact: true }).isVisible(),
  );

  check(
    "an empty column says so",
    /no tasks here yet/i.test(m.emptyBody.hint),
    `reads "${m.emptyBody.hint.slice(0, 40)}"`,
  );
  check(
    "an empty column body fills its column, so the whole of it is a drop target",
    m.emptyBody.height > 200,
    `body is ${Math.round(m.emptyBody.height)}px tall`,
  );
}

log("\n--- a board with no tasks at all ---");

const emptyBoard = await req("POST", "/boards", token, {
  title: "Empty layout board",
  description: "no tasks",
  color: boardColors.body.data[0]._id,
  template: templates.body.data[0]._id,
});
const emptyId = emptyBoard.body.data._id;

for (const viewport of VIEWPORTS) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(`${FRONT}/board/${emptyId}`);
  await page.getByRole("region", { name: "Board columns" }).waitFor();
  await settle();

  const banner = page.getByRole("heading", { level: 2, name: /no tasks yet/i });
  const add = page.getByRole("button", { name: "Add task", exact: true });
  const addBox = await add.boundingBox();
  const state = await page.evaluate(() => {
    const doc = document.documentElement;
    const row = document.querySelector(
      '[role="region"][aria-label="Board columns"]',
    );
    const column = row
      .querySelector("h2")
      .closest('div[class*="shrink-0"]')
      .parentElement.getBoundingClientRect();
    return {
      wide: doc.scrollWidth - doc.clientWidth,
      tall: doc.scrollHeight - doc.clientHeight,
      columnBottom: Math.round(column.bottom),
      columnHeight: Math.round(column.height),
      viewportHeight: window.innerHeight,
    };
  });

  check(
    `${viewport.name}: the empty board banner and its button are on screen`,
    (await banner.isVisible()) &&
      Boolean(addBox) &&
      addBox.y + addBox.height <= viewport.height &&
      addBox.x + addBox.width <= viewport.width,
  );
  check(
    `${viewport.name}: the banner does not make the page scroll`,
    state.wide <= 0 && state.tall <= 0,
    `wide ${state.wide}, tall ${state.tall}`,
  );
  check(
    `${viewport.name}: the columns are still there and still reach the bottom`,
    state.columnHeight > 150 && state.columnBottom > state.viewportHeight - 40,
    `column is ${state.columnHeight}px tall, ends at ${state.columnBottom}`,
  );
}

await page.goto(`${FRONT}/board/${boardId}`);
await page.getByRole("region", { name: "Board columns" }).waitFor();
await page.getByText("Layout task 1", { exact: true }).waitFor();
check(
  "a board that has tasks shows no empty board banner",
  (await page.getByRole("heading", { name: /no tasks yet/i }).count()) === 0,
);

log("\n--- dragging toward a column that is off screen ---");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${FRONT}/board/${boardId}`);
await page.getByRole("region", { name: "Board columns" }).waitFor();
await page.getByText("Layout task 1", { exact: true }).waitFor();
await settle();

const scrollLeft = () =>
  page.evaluate(
    () =>
      document.querySelector('[role="region"][aria-label="Board columns"]')
        .scrollLeft,
  );

const handle = page
  .locator('[role="article"]')
  .first()
  .locator('[aria-label="Drag handle"]');
const from = await handle.boundingBox();
check("the first card renders a drag handle", Boolean(from));

const startX = from.x + from.width / 2;
const startY = from.y + from.height / 2;
await page.mouse.move(startX, startY);
await page.mouse.down();
// dnd-kit needs the pointer events spread over time: a synchronous burst of
// moves is coalesced and the sensor never sees the drag start.
for (let step = 1; step <= 8; step += 1) {
  await page.mouse.move(startX + step * 4, startY, { steps: 2 });
  await page.waitForTimeout(40);
}
// Hold at the right edge of the screen so the container scrolls under the
// pointer.
await page.mouse.move(386, startY, { steps: 10 });
await page.waitForTimeout(1500);
const scrolled = await scrollLeft();
check(
  "holding a card at the right edge scrolls the column row",
  scrolled > 0,
  `scrollLeft is ${scrolled}`,
);

// Drop wherever the pointer is. The last column is the one the scroll brings
// into reach, so the card must have moved somewhere other than where it began.
await page.mouse.up();
await page.waitForTimeout(800);

const after = await req("GET", `/tasks/board/${boardId}`, token);
const moved = after.body.data.find((task) => task.title === "Layout task 1");
check(
  "the drop landed the card in another column",
  Boolean(moved) && moved.status !== firstColumn._id,
  `status ${moved?.status}, started in ${firstColumn._id}, last column is ${lastColumn._id}`,
);

await browser.close();

const failed = results.filter((r) => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
