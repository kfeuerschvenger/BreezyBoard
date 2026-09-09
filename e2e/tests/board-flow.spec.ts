import { test, expect, logInThroughTheUi, columnCount } from './fixtures';

/**
 * The product's core loop. This single spec covers the two defects that were
 * confirmed by driving the running application: the task form that could never
 * be submitted, and the drag handle that overrode the drag-and-drop activators.
 * If it passes, the product does the thing it exists to do.
 */
test.describe('board core loop', () => {
  test('a user can create a board, add a task, and move it between columns', async ({ page, authedUser }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));

    await logInThroughTheUi(page, authedUser);

    await test.step('create a board', async () => {
      const boardName = `E2E Board ${Date.now()}`;
      await page.getByRole('button', { name: /create board/i }).first().click();
      await page.getByLabel(/board name/i).or(page.locator('input').first()).fill(boardName);
      await page.getByRole('button', { name: /^create board$/i }).last().click();

      await expect(page.getByText(boardName)).toBeVisible();
      await page.getByText(boardName).first().click();
      await expect(page).toHaveURL(/\/board\/[a-f0-9]{24}$/);
    });

    await test.step('the board renders its template columns', async () => {
      for (const column of ['Backlog', 'Up Next', 'In Progress', 'Done']) {
        await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
      }
      expect(await columnCount(page, 'Backlog')).toBe(0);
    });

    await test.step('create a task through the drawer', async () => {
      await page.getByRole('button', { name: /add task/i }).first().click();

      const save = page.getByRole('button', { name: /save changes/i });
      await expect(save, 'the drawer opens with an incomplete form').toBeDisabled();

      await page.getByPlaceholder('Enter task title').fill('Core loop task');
      await page.getByPlaceholder('Enter task description').fill('Created by the end to end suite');
      await page.locator('button[aria-label="Coral"]').click();
      await page.getByPlaceholder('Search team members...').fill(authedUser.firstName);
      await page.getByText(authedUser.email).last().click();

      // Regression guard for the defect where clearing an error left an
      // undefined value under an existing key and locked the form forever.
      await expect(save, 'submit must enable once every required field is filled').toBeEnabled();
      await save.click();

      await expect(page.getByText('Core loop task')).toBeVisible();
      expect(await columnCount(page, 'Backlog')).toBe(1);
    });

    await test.step('drag the task into another column', async () => {
      const handle = page.locator('[role="article"]').first().locator('[aria-label="Drag handle"]');
      await expect(handle).toBeVisible();
      // The card animates in (opacity and y), so a box measured immediately after
      // creation is stale and the press lands off target, which reads as a text
      // selection instead of a drag.
      await expect
        .poll(async () => {
          const first = await handle.boundingBox();
          await page.waitForTimeout(120);
          const second = await handle.boundingBox();
          return first && second && first.x === second.x && first.y === second.y;
        })
        .toBe(true);

      const from = await handle.boundingBox();
      const to = await page.getByText('In Progress', { exact: true }).first().boundingBox();
      expect(from, 'the drag handle must be rendered').not.toBeNull();
      expect(to, 'the target column must be rendered').not.toBeNull();

      // dnd-kit needs the pointer events spread over time: a synchronous burst of
      // moves is coalesced and the sensor never sees the drag start. The small
      // deliberate nudge after the press is what actually activates the sensor.
      const cx = from!.x + from!.width / 2;
      const cy = from!.y + from!.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.move(cx + 12, cy + 12);

      // Wait for the sensor to actually pick the item up rather than assuming it
      // did. dnd-kit announces the pickup in its live region, and the drag overlay
      // means a second card is rendered while the drag is in flight.
      await expect
        .poll(async () => (await page.locator('[role="status"]').allInnerTexts()).join(' ').toLowerCase(), {
          timeout: 5_000,
        })
        .toContain('draggable');
      expect(await page.locator('[role="article"]').count(), 'the drag overlay renders a second card').toBe(2);

      for (let step = 1; step <= 25; step++) {
        await page.mouse.move(
          from!.x + (to!.x + 80 - from!.x) * (step / 25),
          from!.y + (to!.y + 220 - from!.y) * (step / 25),
          { steps: 2 }
        );
        await page.waitForTimeout(25);
      }
      await page.waitForTimeout(300);
      await page.mouse.up();

      await expect.poll(() => columnCount(page, 'In Progress')).toBe(1);
      expect(await columnCount(page, 'Backlog')).toBe(0);
    });

    await test.step('the move survives a reload', async () => {
      await page.reload();
      await expect(page.getByText('Core loop task')).toBeVisible();
      await expect.poll(() => columnCount(page, 'In Progress')).toBe(1);
    });

    await test.step('the card opens for editing', async () => {
      await page.locator('[role="article"]').first().click();
      await expect(page.getByText('Edit Task')).toBeVisible();
    });

    expect(pageErrors, 'no uncaught exception may reach the window').toEqual([]);
  });

  test('the drag handle is reachable and operable by keyboard', async ({ page, authedUser }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));

    await logInThroughTheUi(page, authedUser);
    const boardName = `E2E Keyboard ${Date.now()}`;
    await page.getByRole('button', { name: /create board/i }).first().click();
    await page.locator('input').first().fill(boardName);
    await page.getByRole('button', { name: /^create board$/i }).last().click();
    await page.getByText(boardName).first().click();

    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder('Enter task title').fill('Keyboard task');
    await page.getByPlaceholder('Enter task description').fill('Reachable without a mouse');
    await page.locator('button[aria-label="Coral"]').click();
    await page.getByPlaceholder('Search team members...').fill(authedUser.firstName);
    await page.getByText(authedUser.email).last().click();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Keyboard task')).toBeVisible();

    const handle = page.locator('[role="article"]').first().locator('[aria-label="Drag handle"]');
    await handle.focus();
    await expect(handle).toBeFocused();

    // Regression guard for the handler that faked a pointer event and threw
    // "Cannot read properties of undefined (reading 'dndKit')".
    await page.keyboard.press('Space');
    await expect
      .poll(async () => (await page.locator('[role="status"]').allInnerTexts()).join(' ').toLowerCase())
      .toContain('draggable');
    await page.keyboard.press('Escape');

    expect(pageErrors, 'activating the keyboard sensor must not throw').toEqual([]);
  });
});
