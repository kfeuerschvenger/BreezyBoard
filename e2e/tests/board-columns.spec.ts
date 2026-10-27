import type { Page } from '@playwright/test';
import { test, expect, logInThroughTheUi, makeUser, seedBoard } from './fixtures';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

const boardUrl = (id: string) => `/board/${id}`;

/** The columns of the board page, left to right, by the name in each header. */
const columnNames = (page: Page) =>
  page.locator('[data-column] h2 input').evaluateAll(fields => fields.map(field => (field as HTMLInputElement).value));

/** The first template's columns, in order, as the seed writes them. */
const TEMPLATE_COLUMNS = ['Backlog', 'Up Next', 'In Progress', 'Done'];

const readBoard = async (page: Page, token: string, boardId: string) => {
  const response = await page.request.get(`${API_URL}/boards/${boardId}`, { headers: { Authorization: `Bearer ${token}` } });
  return (await response.json()).data as {
    title: string;
    columnsVersion: number;
    columns: { _id: string; title: string; order: number; color: { _id: string } }[];
  };
};

/** Adds a column the way a second session would: straight to the API, with the version it just read. */
const addColumnElsewhere = async (page: Page, token: string, boardId: string, title: string) => {
  const stored = await readBoard(page, token, boardId);
  const response = await page.request.put(`${API_URL}/boards/${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      columns: [
        ...stored.columns.map(column => ({ _id: column._id, title: column.title, color: column.color._id })),
        { title, color: stored.columns[0].color._id },
      ],
      columnsVersion: stored.columnsVersion,
    },
  });
  expect(response.status()).toBe(200);
};

test.describe('managing a board\'s columns', () => {
  test('the owner adds, reorders and recolours columns in the edit dialog, and Save applies them in one go', async ({
    page,
    authedUser,
  }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['A card']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);

    await page.getByRole('button', { name: 'Add column' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit board' });
    const newName = dialog.getByRole('textbox', { name: 'New column name' });
    await expect(newName).toBeFocused();

    await newName.fill('In review');
    await dialog.getByRole('combobox', { name: 'Position' }).selectOption({ label: 'Between In Progress and Done' });
    // The radio itself is sr-only, so what a person clicks is its label.
    await dialog.getByRole('group', { name: 'Colour' }).locator('label:has(input[type="radio"])').nth(4).click();
    await dialog.getByRole('button', { name: 'Add column', exact: true }).click();
    await dialog.getByRole('button', { name: 'Move Backlog down' }).click();

    // Nothing is saved until Save: the page behind the dialog is as it was.
    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    const expected = ['Up Next', 'Backlog', 'In Progress', 'In review', 'Done'];
    await expect.poll(() => columnNames(page)).toEqual(expected);
    await page.reload();
    await expect.poll(() => columnNames(page)).toEqual(expected);

    // The last column keeps its landed meaning through the arrival icon.
    const lastColumn = page.locator('[data-column]').last();
    await expect(lastColumn.getByRole('heading', { level: 2, name: 'Done' })).toBeVisible();
    await expect(lastColumn.locator('svg.tabler-icon-plane-arrival')).toBeVisible();
  });

  test('Cancel throws every change away', async ({ page, authedUser }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['A card']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);

    await page.getByRole('button', { name: 'Add column' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit board' });
    await dialog.getByRole('textbox', { name: 'New column name' }).fill('Never saved');
    await dialog.getByRole('button', { name: 'Add column', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove Up Next' }).click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);
    expect((await readBoard(page, authedUser.token!, boardId)).columns).toHaveLength(4);
  });

  test('a column with cards cannot be removed, an empty one can, and the server refuses the first all the same', async ({
    page,
    authedUser,
  }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['A card']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);

    await page.getByRole('button', { name: /^options for /i }).click();
    await page.getByRole('menuitem', { name: 'Edit board' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit board' });

    const blocked = dialog.getByRole('button', { name: 'Remove Backlog' });
    await expect(blocked).toBeDisabled();
    await expect(blocked).toHaveAccessibleDescription(/Backlog has 1 card\. Move it to another column/);

    await dialog.getByRole('button', { name: 'Remove Up Next' }).click();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => columnNames(page)).toEqual(['Backlog', 'In Progress', 'Done']);

    // The same removal sent straight to the API: a 409 that names the column.
    const stored = await readBoard(page, authedUser.token!, boardId);
    const withoutBacklog = stored.columns.filter(column => column.title !== 'Backlog');
    const refused = await page.request.put(`${API_URL}/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authedUser.token}` },
      data: {
        columns: withoutBacklog.map(column => ({ _id: column._id, title: column.title, color: column.color._id })),
        columnsVersion: stored.columnsVersion,
      },
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).message).toContain('"Backlog"');
    expect((await readBoard(page, authedUser.token!, boardId)).columns).toHaveLength(3);
  });

  test('a dialog opened before another session changed the columns is refused, then reloaded and saved', async ({
    page,
    authedUser,
  }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['A card']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);

    await page.getByRole('button', { name: 'Add column' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit board' });
    await dialog.getByRole('button', { name: 'Remove Up Next' }).click();

    await addColumnElsewhere(page, authedUser.token!, boardId, 'Added elsewhere');

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('changed by someone else while you were editing. Nothing was saved.');
    expect((await readBoard(page, authedUser.token!, boardId)).columns).toHaveLength(5);

    await alert.getByRole('button', { name: 'Reload columns' }).click();
    await expect(dialog.getByRole('textbox', { name: /^Name of column \d$/ })).toHaveCount(5);
    await expect(alert).toBeHidden();

    await dialog.getByRole('button', { name: 'Remove Up Next' }).click();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => columnNames(page)).toEqual(['Backlog', 'In Progress', 'Done', 'Added elsewhere']);
  });

  test('renaming a column in place from an out of date page keeps a column another session added', async ({
    page,
    authedUser,
  }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['A card']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect.poll(() => columnNames(page)).toEqual(TEMPLATE_COLUMNS);

    await addColumnElsewhere(page, authedUser.token!, boardId, 'Added elsewhere');

    const column = page.getByRole('textbox', { name: 'Name of column Backlog' });
    await column.fill('Inbox');
    await column.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Name of column Inbox' })).toHaveValue('Inbox');

    const stored = await readBoard(page, authedUser.token!, boardId);
    expect(stored.columns.map(item => item.title)).toEqual(['Inbox', 'Up Next', 'In Progress', 'Done', 'Added elsewhere']);
  });

  test('the owner renames a column and the board in place, and a member can do neither', async ({
    page,
    authedUser,
    browser,
    baseURL,
  }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['A card']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));

    const column = page.getByRole('textbox', { name: 'Name of column Backlog' });
    await column.fill('Inbox');
    await column.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Name of column Inbox' })).toHaveValue('Inbox');

    // Escape puts the saved name back and sends nothing.
    const inbox = page.getByRole('textbox', { name: 'Name of column Inbox' });
    await inbox.fill('Discarded');
    await inbox.press('Escape');
    await expect(inbox).toHaveValue('Inbox');

    // A name another column has is refused and the field goes back.
    await inbox.fill('done');
    await inbox.press('Enter');
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Another column already has that name')).toBeVisible();
    await expect(inbox).toHaveValue('Inbox');
    await expect(inbox).toHaveAccessibleDescription('Another column already has that name');
    // Focus is not pulled back to the field: Enter left it, and it stays left.
    await expect(inbox).not.toBeFocused();

    const title = page.getByRole('textbox', { name: 'Board name' });
    await title.fill('Renamed in place');
    await title.blur();
    await expect(page.getByRole('heading', { level: 1, name: 'Renamed in place' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Renamed in place' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name of column Inbox' })).toBeVisible();

    const member = makeUser();
    const registered = await page.request.post(`${API_URL}/auth/register`, { data: member });
    expect(registered.ok()).toBe(true);
    const memberId = (await registered.json()).data.user._id as string;
    const added = await page.request.patch(`${API_URL}/boards/${boardId}/members`, {
      headers: { Authorization: `Bearer ${authedUser.token}` },
      data: { members: [memberId] },
    });
    expect(added.ok()).toBe(true);

    const context = await browser.newContext({ baseURL });
    try {
      const memberPage = await context.newPage();
      await logInThroughTheUi(memberPage, member);
      await memberPage.goto(boardUrl(boardId));

      await expect(memberPage.getByRole('heading', { level: 1, name: 'Renamed in place' })).toBeVisible();
      await expect(memberPage.getByRole('heading', { level: 2, name: 'Inbox' })).toBeVisible();
      await expect(memberPage.getByRole('textbox')).toHaveCount(0);
      await expect(memberPage.getByRole('button', { name: 'Add column' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
