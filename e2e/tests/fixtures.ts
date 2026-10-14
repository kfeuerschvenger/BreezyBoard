import { randomUUID } from 'node:crypto';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

export interface TestUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Set by the `authedUser` fixture, so a test can seed data without logging in again. */
  token?: string;
}

/** Every run registers its own account, so the suite never depends on seeded users. */
export function makeUser(): TestUser {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  return {
    firstName: 'E2E',
    lastName: 'Runner',
    email: `e2e-${stamp}@example.test`,
    password: 'E2eRunner1',
  };
}

/**
 * Fails with an actionable message when the stack is not ready, rather than
 * letting every test time out on a blank page.
 */
export async function assertStackIsReady(page: Page): Promise<void> {
  const health = await page.request.get(`${API_URL}/health`).catch(() => null);
  expect(health, `The API is not reachable at ${API_URL}. Run: docker compose up -d`).not.toBeNull();
  expect(health!.ok(), `The API answered ${health!.status()} at ${API_URL}/health`).toBe(true);
}

/** Board creation needs the seeded colors and templates to exist. */
export async function assertSeedDataExists(page: Page, token: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  const templates = await page.request.get(`${API_URL}/templates`, { headers });
  const body = await templates.json();
  expect(
    Array.isArray(body?.data) && body.data.length > 0,
    'No board templates found. Run: docker compose exec back npm run seed:all'
  ).toBe(true);
}

export async function registerViaApi(page: Page, user: TestUser): Promise<string> {
  const response = await page.request.post(`${API_URL}/auth/register`, { data: user });
  expect(response.ok(), `Registration failed with ${response.status()}`).toBe(true);
  const body = await response.json();
  return body.data.token as string;
}

export async function logInThroughTheUi(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  // Scoped to the form: a bare /email/i also matches the mailto link in the footer.
  const form = page.locator('form').first();
  await form.getByLabel('Email address', { exact: true }).fill(user.email);
  await form.getByLabel('Password', { exact: true }).fill(user.password);
  await form.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText('Your boards')).toBeVisible();
}

/**
 * Creates a board from the first template and fills its columns through the
 * API, one list of task titles per column in board order. Setting a board up
 * through the form would put the setup, not the behaviour, under test.
 */
export async function seedBoard(page: Page, token: string, columns: string[][]): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };
  const read = async (path: string) => (await (await page.request.get(`${API_URL}${path}`, { headers })).json()).data;

  const [templates, boardColors, taskColors] = await Promise.all([
    read('/templates'),
    read('/colors?type=board'),
    read('/colors?type=task'),
  ]);
  const created = await page.request.post(`${API_URL}/boards`, {
    headers,
    data: { title: `E2E Seeded ${Date.now()}`, description: 'seeded', color: boardColors[0]._id, template: templates[0]._id },
  });
  expect(created.ok(), `Board creation failed with ${created.status()}`).toBe(true);
  const board = (await created.json()).data;
  const boardColumns = [...board.columns].sort((a: { order: number }, b: { order: number }) => a.order - b.order);

  for (const [index, titles] of columns.entries()) {
    for (const title of titles) {
      // Sequential on purpose: the server mints each task's position at the end
      // of its column, so creating them in parallel would shuffle the order.
      const task = await page.request.post(`${API_URL}/tasks/board/${board._id}`, {
        headers,
        data: { title, status: boardColumns[index]._id, color: taskColors[0]._id },
      });
      expect(task.ok(), `Task creation failed with ${task.status()}`).toBe(true);
    }
  }
  return board._id as string;
}

/**
 * Adds a card the way a person does: open the column's composer, type the
 * title, press Enter. Returns once the card is on the board.
 */
export async function addCard(page: Page, columnTitle: string, title: string): Promise<void> {
  await page.getByRole('button', { name: `Add a card to ${columnTitle}` }).click();
  const field = page.getByRole('textbox', { name: new RegExp(`new card in ${columnTitle}`, 'i') });
  await field.fill(title);
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: title, level: 3 })).toBeVisible();
}

/**
 * Reads the count badge rendered next to a column title, or -1 when the board
 * has no such column.
 *
 * It reads the column's own header, never the page's text: a dialog that is
 * still leaving can hold the same words (the create board dialog lists the
 * template columns), and since a leaving dialog no longer catches the pointer
 * it can still be on screen when the next step runs.
 */
export async function columnCount(page: Page, columnTitle: string): Promise<number> {
  const heading = page.getByRole('heading', { level: 2, name: columnTitle, exact: true });
  if ((await heading.count()) === 0) return -1;

  const text = await heading.first().locator('..').innerText();
  // Trimmed first: a trailing `\s*` after a greedy `\d+` backtracks in
  // quadratic time on a long run of digits and spaces.
  const match = /\d+$/.exec(text.trimEnd());
  return match ? Number(match[0]) : -1;
}

/**
 * Waits until every element the locator matches has finished its entrance
 * animation: fully opaque with its transform cleared, which is what a spring
 * leaves behind when it ends. A box read or a press before that lands on a
 * position the element is about to leave. Fails when nothing matches, so an
 * empty page cannot pass as settled.
 */
export async function waitUntilSettled(target: Locator): Promise<void> {
  await expect
    .poll(() =>
      target.evaluateAll(elements => {
        if (elements.length === 0) return false;
        return elements.every(element => {
          const style = getComputedStyle(element);
          return style.opacity === '1' && style.transform === 'none';
        });
      })
    )
    .toBe(true);
}

export const test = base.extend<{ authedUser: TestUser }>({
  authedUser: async ({ page }, use) => {
    await assertStackIsReady(page);
    const user = makeUser();
    const token = await registerViaApi(page, user);
    await assertSeedDataExists(page, token);
    user.token = token;
    await use(user);
  },
});

export { expect };
