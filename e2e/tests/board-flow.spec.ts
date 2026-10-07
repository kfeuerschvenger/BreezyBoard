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
      await page.getByLabel(/board name/i).fill(boardName);
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
      // The radio itself is sr-only, so what a person clicks is the label
      // wrapping it, which is the visible swatch. Targeting the input
      // directly asks Playwright to click a one pixel clipped element and it
      // correctly refuses.
      await page.locator('label', { has: page.getByRole('radio', { name: 'Coral' }) }).click();
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
    await page.getByLabel(/board name/i).fill(boardName);
    await page.getByRole('button', { name: /^create board$/i }).last().click();
    await page.getByText(boardName).first().click();

    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder('Enter task title').fill('Keyboard task');
    await page.getByPlaceholder('Enter task description').fill('Reachable without a mouse');
    await page.locator('label', { has: page.getByRole('radio', { name: 'Coral' }) }).click();
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

  /**
   * WCAG 2.5.7: the drag has a single-pointer alternative, and it is the same
   * move. Everything here is keyboard only, because that is the claim: a
   * person who cannot drag and cannot use a pointer at all can still move a
   * card, hear what happened, and find their place again afterwards.
   *
   * The reload at the end is what makes it a test of the move and not of the
   * optimistic render. A menu that only repainted the card would pass every
   * step before it.
   */
  test('a task can be moved to another column from the keyboard alone, and it persists', async ({
    page,
    authedUser,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));

    await logInThroughTheUi(page, authedUser);
    const boardName = `E2E Move ${Date.now()}`;
    await page
      .getByRole('button', { name: /create board/i })
      .first()
      .click();
    await page.getByLabel(/board name/i).fill(boardName);
    await page
      .getByRole('button', { name: /^create board$/i })
      .last()
      .click();
    await page.getByText(boardName).first().click();

    await page
      .getByRole('button', { name: /add task/i })
      .first()
      .click();
    await page.getByPlaceholder('Enter task title').fill('Menu task');
    await page.getByPlaceholder('Enter task description').fill('Moved without a pointer');
    await page.locator('label', { has: page.getByRole('radio', { name: 'Coral' }) }).click();
    await page.getByPlaceholder('Search team members...').fill(authedUser.firstName);
    await page.getByText(authedUser.email).last().click();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Menu task')).toBeVisible();

    const trigger = page.getByRole('button', {
      name: 'Move Menu task to another column',
    });
    const announcer = page.locator('[data-move-announcer]');

    await test.step('Escape closes the menu and gives focus back to its button', async () => {
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu', { name: 'Move Menu task to' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    await test.step('the current column is listed and cannot be chosen', async () => {
      await page.keyboard.press('Enter');
      const current = page.getByRole('menuitem', { name: /Backlog/ });
      await expect(current).toHaveAttribute('aria-disabled', 'true');
      // Focus opens on the first column that can be chosen, not on the one the card is in.
      await expect(page.getByRole('menuitem', { name: 'Up Next' })).toBeFocused();
    });

    await test.step('arrow keys and Enter move the card, and the move is announced', async () => {
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name: 'In Progress' })).toBeFocused();
      await page.keyboard.press('Enter');

      await expect.poll(() => columnCount(page, 'In Progress')).toBe(1);
      expect(await columnCount(page, 'Backlog')).toBe(0);
      await expect(announcer).toHaveText('Moved Menu task to In Progress.');
    });

    await test.step('focus lands on the same card, which is now in its new column', async () => {
      await expect(trigger).toBeFocused();
    });

    await test.step('the move survives a reload', async () => {
      await page.reload();
      await expect(page.getByText('Menu task')).toBeVisible();
      await expect.poll(() => columnCount(page, 'In Progress')).toBe(1);
      expect(await columnCount(page, 'Backlog')).toBe(0);
    });

    await test.step('on a phone the button is a 44 pixel target and the menu stays on screen', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(trigger).toBeVisible();

      // Layout size, not the painted box: the card scales while it is hovered
      // or pressed, and a target is measured at rest.
      const size = await trigger.evaluate(element => ({
        width: (element as HTMLElement).offsetWidth,
        height: (element as HTMLElement).offsetHeight,
      }));
      expect(size.width, 'target width').toBeGreaterThanOrEqual(44);
      expect(size.height, 'target height').toBeGreaterThanOrEqual(44);

      await trigger.click();
      const menuBox = (await page.getByRole('menu').boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(844);
      for (const item of await page.getByRole('menuitem').all()) {
        expect((await item.boundingBox())!.height, 'menu item height').toBeGreaterThanOrEqual(44);
      }
    });

    expect(pageErrors, 'using the menu must not throw').toEqual([]);
  });

  /**
   * The account menu is the shared Menu primitive, which draws its popup in a
   * portal at fixed coordinates. Where that lands is a layout fact no layer
   * below a real browser computes, so it is measured here: under the button,
   * lined up with its right edge, and inside the screen at both widths.
   */
  test('the account menu opens under its button, on screen, and works from the keyboard', async ({
    page,
    authedUser,
  }) => {
    await logInThroughTheUi(page, authedUser);
    const trigger = page.getByRole('button', { name: /^Account menu for/ });

    for (const width of [1440, 390]) {
      await test.step(`at ${width} pixels`, async () => {
        await page.setViewportSize({ width, height: 844 });
        await trigger.click();

        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        const button = (await trigger.boundingBox())!;
        const popup = (await menu.boundingBox())!;

        expect(popup.y, 'opens below the button').toBeGreaterThanOrEqual(button.y + button.height);
        expect(popup.x, 'inside on the left').toBeGreaterThanOrEqual(0);
        expect(popup.x + popup.width, 'inside on the right').toBeLessThanOrEqual(width);
        expect(Math.abs(popup.x + popup.width - (button.x + button.width)), 'lined up with the button').toBeLessThan(
          width === 1440 ? 2 : 9
        );

        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    }

    await test.step('Profile is reachable and chosen with the keyboard alone', async () => {
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/profile$/);
    });
  });

  /**
   * The board card used to be role="button" with a click handler, wrapping
   * the options button and its menu, which is interactive content nested
   * inside an interactive element. It is a plain container now, with the
   * board title as a real link whose hit area is stretched over the whole
   * card by a pseudo element.
   *
   * That stretch is the risk this test exists for. An overlay covering the
   * card is exactly what would swallow the click meant for the options
   * button, and nothing in the component suite can see it: jsdom has no
   * layout, so it has no opinion about which element a pointer lands on.
   */
  test('the board card is operable by mouse and by keyboard, and the two do not fight', async ({
    page,
    authedUser,
  }) => {
    await logInThroughTheUi(page, authedUser);

    const boardName = `Card E2E ${Date.now()}`;
    await page.getByRole('button', { name: /create board/i }).first().click();
    await page.getByLabel(/board name/i).fill(boardName);
    await page.getByRole('button', { name: /^create board$/i }).last().click();
    await expect(page.getByText(boardName)).toBeVisible();

    await test.step('the options button stays above the stretched link', async () => {
      await page.getByRole('button', { name: `Options for ${boardName}` }).click();

      // Landing on the link instead would have navigated away.
      await expect(page).not.toHaveURL(/\/board\/[a-f0-9]{24}$/);
      await expect(page.getByRole('button', { name: /add member/i })).toBeVisible();

      await page.keyboard.press('Escape');
      await page.mouse.click(5, 5);
    });

    await test.step('the title opens the board from the keyboard alone', async () => {
      const title = page.getByRole('link', { name: boardName });
      await title.focus();
      await expect(title).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/board\/[a-f0-9]{24}$/);
    });
  });
});
