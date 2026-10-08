import type { Page } from '@playwright/test';
import { test, expect, logInThroughTheUi, seedBoard } from './fixtures';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

const boardUrl = (id: string) => `/board/${id}`;

/** Opens the board page's options menu and chooses one item. */
const chooseFromBoardMenu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: /^options for /i }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test.describe('editing and deleting a board from its page', () => {
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

  test('a board deleted from its page can be undone, with its tasks', async ({ page, authedUser }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['First task', 'Second task'], ['Third task']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect(page.getByText('First task')).toBeVisible();
    const title = await page.getByRole('heading', { level: 1 }).innerText();

    await chooseFromBoardMenu(page, 'Delete board');
    const confirm = page.getByRole('dialog', { name: 'Delete this board?' });
    await expect(confirm).toContainText(title);
    // Focus starts on the safe answer.
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Delete board' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('My Boards')).toBeVisible();
    const toast = page.getByTestId('toast');
    await expect(toast).toContainText(`Deleted "${title}"`);
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);

    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toContainText(`Restored "${title}"`);

    // Undo keeps the person on the dashboard, where the board is back.
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(boardUrl(boardId));
    for (const task of ['First task', 'Second task', 'Third task']) {
      await expect(page.getByText(task)).toBeVisible();
    }
  });

  test('a board deleted and not undone is gone after a reload', async ({ page, authedUser }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['Doomed task']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    const title = await page.getByRole('heading', { level: 1 }).innerText();

    await chooseFromBoardMenu(page, 'Delete board');
    await page.getByRole('dialog', { name: 'Delete this board?' }).getByRole('button', { name: 'Delete board' }).click();
    await expect(page.getByTestId('toast')).toContainText(`Deleted "${title}"`);

    await page.reload();
    await expect(page.getByText('My Boards')).toBeVisible();
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);

    // Typing the address of a deleted board does not bring it back.
    await page.goto(boardUrl(boardId));
    await expect(page.getByRole('heading', { level: 1, name: 'Board not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to my boards' })).toBeVisible();
    await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0);
  });

  test('after a keyboard delete, Undo has focus and the toast stays while it does', async ({ page, authedUser }) => {
    test.setTimeout(90_000);
    const boardId = await seedBoard(page, authedUser.token!, [['Keyboard task']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect(page.getByText('Keyboard task')).toBeVisible();

    await chooseFromBoardMenu(page, 'Delete board');
    await page.getByRole('dialog', { name: 'Delete this board?' }).waitFor();
    // Confirmed from the keyboard: Cancel has focus, Tab reaches the confirm button.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const toast = page.getByTestId('toast');
    await expect(toast).toBeVisible();

    // The board page is gone and the focus with it. A keyboard user who just
    // confirmed gets the toast's action focused, rather than a Tab that
    // resumes from wherever the deleted button used to sit in the page.
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeFocused();

    // Ten seconds is how long it lasts untouched. Focus holds it past that,
    // which is how a keyboard user gets more time (WCAG 2.2.1).
    await page.waitForTimeout(11_000);
    await expect(toast).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Restored');
  });

  test('cancelling the confirmation deletes nothing', async ({ page, authedUser }) => {
    const boardId = await seedBoard(page, authedUser.token!, [['Safe task']]);
    await logInThroughTheUi(page, authedUser);
    await page.goto(boardUrl(boardId));
    await expect(page.getByText('Safe task')).toBeVisible();

    await chooseFromBoardMenu(page, 'Delete board');
    await page.getByRole('dialog', { name: 'Delete this board?' }).getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(boardUrl(boardId));
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('the dashboard delete asks, then offers the same undo', async ({ page, authedUser }) => {
    await seedBoard(page, authedUser.token!, [['Dashboard task']]);
    await logInThroughTheUi(page, authedUser);
    const title = (await page.getByRole('link', { name: /E2E Seeded/ }).innerText()).trim();

    await page.getByRole('button', { name: `Options for ${title}` }).click();
    await page.getByRole('button', { name: /^Delete$/ }).click();
    await page.getByRole('dialog', { name: 'Delete this board?' }).getByRole('button', { name: 'Delete board' }).click();

    await expect(page.getByTestId('toast')).toContainText(`Deleted "${title}"`);
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);

    await page.getByTestId('toast').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('status')).toContainText(`Restored "${title}"`);
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  });
});
