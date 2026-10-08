import type { Page } from '@playwright/test';
import { test, expect, logInThroughTheUi, seedBoard } from './fixtures';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

const boardUrl = (id: string) => `/board/${id}`;

/** Opens the board page's options menu and chooses one item. */
const chooseFromBoardMenu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: /^options for /i }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test.describe('editing a board from its page', () => {
  test('an edit made on the board page is on the dashboard, with no reload', async ({ page, authedUser }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['Keep me']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await page.getByRole('heading', { level: 1 }).waitFor();

    const before = await page.request.get(`${API_URL}/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authedUser.token}` },
    });
    const originalColor = (await before.json()).data.color._id;

    await chooseFromBoardMenu(page, 'Edit board');
    const dialog = page.getByRole('dialog', { name: 'Edit Board' });
    await expect(dialog.getByRole('textbox', { name: /board name/i })).toHaveValue(/E2E Seeded/);

    await dialog.getByRole('textbox', { name: /board name/i }).fill('Renamed on the board page');
    await dialog.getByRole('textbox', { name: /description/i }).fill('A new description');
    // The radio itself is sr-only, so what a person clicks is its label.
    await dialog.locator('label:has(input[type="radio"])').nth(1).click();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Renamed on the board page' })).toBeVisible();

    // The back button is a client side navigation, so what the dashboard shows
    // here is what the cache holds, not what a fresh load would fetch.
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page.getByText('Renamed on the board page')).toBeVisible();
    await expect(page.getByText('A new description')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Renamed on the board page')).toBeVisible();

    const stored = await page.request.get(`${API_URL}/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${authedUser.token}` },
    });
    const { color } = (await stored.json()).data;
    expect(color._id, 'the colour change was saved, not only shown').not.toBe(originalColor);
  });
});
