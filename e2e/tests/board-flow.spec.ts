import type { Page } from '@playwright/test';
import { test, expect, logInThroughTheUi, columnCount, seedBoard } from './fixtures';

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

      // The sidebar lists the board too, so the tile is found inside the page.
      await expect(page.getByRole('main').getByText(boardName)).toBeVisible();
      await page.getByRole('main').getByText(boardName).click();
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
      // The card rises into place on a spring (opacity and y), and the drawer
      // that created it is still leaving. A press while either is in flight lands
      // off the handle, which reads as a text selection instead of a drag.
      //
      // Two readings of the handle's box a moment apart cannot tell when the card
      // has stopped: the animation starts late when the renderer stalls on the
      // card's first frame, so both readings see the starting position and agree.
      // The card's own state can: the spring ends with its transform cleared.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const card = page.locator('[role="article"]').first();
      await expect
        .poll(() => card.evaluate(element => getComputedStyle(element).opacity === '1' && getComputedStyle(element).transform === 'none'))
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
        .toContain('picked up');
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
      .toContain('picked up');
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
      // `offsetHeight` is the layout height. The popup scales in from 97 percent,
      // and a bounding box read while it does is smaller than the item is.
      for (const item of await page.getByRole('menuitem').all()) {
        const height = await item.evaluate(element => (element as HTMLElement).offsetHeight);
        expect(height, 'menu item height').toBeGreaterThanOrEqual(44);
      }
    });

    expect(pageErrors, 'using the menu must not throw').toEqual([]);
  });

  /**
   * Dragging with the keyboard on a row of columns. The sensor steps through
   * positions on the board rather than through screen geometry, so the
   * assertions are about where a card ends up and what is announced, and the
   * reload is what proves the drop went through the real move path.
   */
  test.describe('moving a card with the keyboard sensor', () => {
    const columnsOf = (page: Page) =>
      page.evaluate(() => {
        const row = document.querySelector('[role="region"][aria-label="Board columns"]')!;
        return [...row.querySelectorAll('h2')].map(heading => {
          const column = heading.closest('div[class*="shrink-0"]')!.parentElement!;
          return `${heading.textContent}: ${[...column.querySelectorAll('h3')].map(card => card.textContent).join(', ')}`;
        });
      });

    const handleOf = (page: Page, title: string) =>
      page.locator('[role="article"]', { hasText: title }).locator('[aria-label="Drag handle"]');

    // The drag handle that has focus, by the title of its card. The overlay is a
    // second copy of the card for a moment after a drop, so a locator by title
    // can match two handles and says nothing about which one holds focus.
    const focusedHandleOf = (page: Page) =>
      page.evaluate(() => {
        const focused = document.activeElement;
        return focused?.getAttribute('aria-label') === 'Drag handle'
          ? (focused.closest('[role="article"]')?.querySelector('h3')?.textContent ?? null)
          : null;
      });

    const dndAnnouncement = (page: Page) => page.locator('[id^="DndLiveRegion"]');

    const startOn = async (page: Page, boardId: string, title: string) => {
      await page.goto(`/board/${boardId}`);
      await expect(page.getByRole('heading', { name: title, level: 3 })).toBeVisible();
      // The cards fade in, and a handle focused mid animation is a stale box.
      await page.waitForTimeout(600);
    };

    test('Enter picks up, arrows move across columns, Enter drops, focus returns and the order persists', async ({
      page,
      authedUser,
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(String(error)));
      const boardId = await seedBoard(page, authedUser.token!, [
        ['A1', 'A2', 'A3'],
        ['B1', 'B2'],
      ]);
      await logInThroughTheUi(page, authedUser);
      await startOn(page, boardId, 'A1');

      await handleOf(page, 'A1').focus();
      await page.keyboard.press('Enter');
      await expect(dndAnnouncement(page)).toHaveText('Picked up A1. Backlog, position 1 of 3.');

      await page.keyboard.press('ArrowRight');
      await expect(dndAnnouncement(page)).toHaveText('Up Next, position 1 of 3.');
      await page.keyboard.press('ArrowDown');
      await expect(dndAnnouncement(page)).toHaveText('Up Next, position 2 of 3.');

      // Nothing has moved until the drop.
      expect((await columnsOf(page))[0]).toBe('Backlog: A1, A2, A3');

      await page.keyboard.press('Enter');
      await expect(dndAnnouncement(page)).toHaveText('Dropped A1 in Up Next, position 2 of 3.');
      expect(await columnsOf(page)).toEqual(['Backlog: A2, A3', 'Up Next: B1, A1, B2', 'In Progress: ', 'Done: ']);

      // The card is a new element in another column, so focus has to be put
      // back on its handle deliberately.
      await expect.poll(() => focusedHandleOf(page)).toBe('A1');

      await page.reload();
      await expect(page.getByRole('heading', { name: 'A1', level: 3 })).toBeVisible();
      expect(await columnsOf(page), 'the drop persisted in the same order').toEqual([
        'Backlog: A2, A3',
        'Up Next: B1, A1, B2',
        'In Progress: ',
        'Done: ',
      ]);

      expect(pageErrors).toEqual([]);
    });

    test('the arrows reach the end of another column and stop there', async ({ page, authedUser }) => {
      const boardId = await seedBoard(page, authedUser.token!, [['A1', 'A2'], ['B1']]);
      await logInThroughTheUi(page, authedUser);
      await startOn(page, boardId, 'A1');

      await handleOf(page, 'A1').focus();
      await page.keyboard.press('Space');
      // The sensor starts listening for the arrows one task after the key that
      // picks the card up, so an arrow sent in the same instant is lost. A
      // person cannot press that fast, and waiting for the announcement is what
      // they would do.
      await expect(dndAnnouncement(page)).toHaveText('Picked up A1. Backlog, position 1 of 2.');
      // Each arrow is measured from where the previous one left the card, which
      // is known once it has been announced.
      await page.keyboard.press('ArrowRight');
      await expect(dndAnnouncement(page)).toHaveText('Up Next, position 1 of 2.');
      await page.keyboard.press('ArrowDown');
      await expect(dndAnnouncement(page)).toHaveText('Up Next, position 2 of 2.');
      await page.keyboard.press('ArrowDown');
      await expect(dndAnnouncement(page), 'nothing below the end of the column').toHaveText(
        'Up Next, position 2 of 2.'
      );
      await page.keyboard.press('Space');

      await expect.poll(async () => (await columnsOf(page))[1]).toBe('Up Next: B1, A1');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'A1', level: 3 })).toBeVisible();
      expect((await columnsOf(page))[1]).toBe('Up Next: B1, A1');
    });

    test('Escape puts the card back and sends no request', async ({ page, authedUser }) => {
      const boardId = await seedBoard(page, authedUser.token!, [['A1', 'A2', 'A3'], ['B1']]);
      const moves: string[] = [];
      page.on('request', request => {
        if (request.url().endsWith('/move')) moves.push(request.url());
      });
      await logInThroughTheUi(page, authedUser);
      await startOn(page, boardId, 'A2');
      const before = await columnsOf(page);

      await handleOf(page, 'A2').focus();
      await page.keyboard.press('Space');
      // See the test above: the arrows are heard from one task after the pick up.
      await expect(dndAnnouncement(page)).toHaveText('Picked up A2. Backlog, position 2 of 3.');
      await page.keyboard.press('ArrowRight');
      await expect(dndAnnouncement(page)).toHaveText(/^Up Next, position \d of 2\.$/);
      await page.keyboard.press('ArrowRight');
      await expect(dndAnnouncement(page)).toHaveText('In Progress, position 1 of 1.');
      await page.keyboard.press('Escape');

      await expect(dndAnnouncement(page)).toHaveText('Move cancelled. A2 is back in Backlog, position 2 of 3.');
      await expect.poll(() => focusedHandleOf(page)).toBe('A2');
      expect(await columnsOf(page)).toEqual(before);

      await page.reload();
      await expect(page.getByRole('heading', { name: 'A2', level: 3 })).toBeVisible();
      expect(await columnsOf(page)).toEqual(before);
      expect(moves, 'a cancelled drag must not reach the server').toEqual([]);
    });

    test('on a phone the target column scrolls into view as the card is carried across', async ({
      page,
      authedUser,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const boardId = await seedBoard(page, authedUser.token!, [['A1', 'A2'], ['B1']]);
      await logInThroughTheUi(page, authedUser);
      await startOn(page, boardId, 'A1');

      const row = page.getByRole('region', { name: 'Board columns' });
      await handleOf(page, 'A1').focus();
      await page.keyboard.press('Space');

      let previous = await row.evaluate(element => element.scrollLeft);
      for (const title of ['Up Next', 'In Progress', 'Done']) {
        await page.keyboard.press('ArrowRight');
        await expect(dndAnnouncement(page)).toContainText(`${title}, position`);

        // The row scrolls on its own, smoothly, so it is polled rather than read.
        await expect
          .poll(
            async () => {
              const heading = (await page.getByRole('heading', { name: title, level: 2 }).boundingBox())!;
              return heading.x >= 0 && heading.x + heading.width <= 390;
            },
            { message: `${title} must be on screen` }
          )
          .toBe(true);

        const now = await row.evaluate(element => element.scrollLeft);
        expect(now, 'the row scrolled toward the target').toBeGreaterThan(previous);
        previous = now;

        // The carried card is in view too, not left behind in the first column.
        const overlay = (await page.locator('[role="article"]').last().boundingBox())!;
        expect(overlay.x).toBeGreaterThanOrEqual(0);
        expect(overlay.x + overlay.width).toBeLessThanOrEqual(390);
      }

      await page.keyboard.press('Space');
      await expect(dndAnnouncement(page)).toHaveText('Dropped A1 in Done, position 1 of 1.');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'A1', level: 3 })).toBeVisible();
      expect((await columnsOf(page))[3]).toBe('Done: A1');
    });
  });

  /**
   * The account menu is the shared Menu primitive, which draws its popup in a
   * portal at fixed coordinates. Where that lands is a layout fact no layer
   * below a real browser computes, so it is measured here: above the button,
   * because the button is at the foot of the sidebar and there is no room
   * below it, lined up with its left edge, and inside the screen at both
   * widths. Below the large breakpoint the button is in the navigation panel,
   * which is opened first.
   */
  test('the account menu opens above its button, on screen, and works from the keyboard', async ({
    page,
    authedUser,
  }) => {
    await logInThroughTheUi(page, authedUser);
    const trigger = page.getByRole('button', { name: /^Account menu for/ });

    for (const width of [1440, 390]) {
      await test.step(`at ${width} pixels`, async () => {
        await page.setViewportSize({ width, height: 844 });
        const openNavigation = page.getByRole('button', { name: 'Open navigation' });
        if (await openNavigation.isVisible()) await openNavigation.click();
        await trigger.click();

        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        const button = (await trigger.boundingBox())!;
        const popup = (await menu.boundingBox())!;

        expect(popup.y + popup.height, 'opens above the button').toBeLessThanOrEqual(button.y);
        expect(popup.y, 'inside at the top').toBeGreaterThanOrEqual(0);
        expect(popup.x, 'inside on the left').toBeGreaterThanOrEqual(0);
        expect(popup.x + popup.width, 'inside on the right').toBeLessThanOrEqual(width);
        expect(Math.abs(popup.x - button.x), 'lined up with the button').toBeLessThan(2);

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
    await expect(page.getByRole('main').getByText(boardName)).toBeVisible();

    await test.step('the options button stays above the stretched link', async () => {
      await page.getByRole('button', { name: `Options for ${boardName}` }).click();

      // Landing on the link instead would have navigated away.
      await expect(page).not.toHaveURL(/\/board\/[a-f0-9]{24}$/);
      await expect(page.getByRole('button', { name: /add member/i })).toBeVisible();

      await page.keyboard.press('Escape');
      await page.mouse.click(5, 5);
    });

    await test.step('the title opens the board from the keyboard alone', async () => {
      const title = page.getByRole('main').getByRole('link', { name: boardName });
      await title.focus();
      await expect(title).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/board\/[a-f0-9]{24}$/);
    });
  });
});
