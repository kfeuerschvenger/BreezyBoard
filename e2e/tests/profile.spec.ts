import { test, expect, logInThroughTheUi } from './fixtures';

// A 1 by 1 PNG, the smallest picture the upload endpoint accepts as an image.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('profile', () => {
  test('a change made on the profile reaches the sidebar and the greeting without a reload', async ({
    page,
    authedUser,
  }) => {
    await logInThroughTheUi(page, authedUser);
    await page.getByRole('button', { name: /Account menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Profile' }).click();

    const heading = page.getByRole('heading', { level: 1 });
    // Names are presented capitalized whatever case they were typed in.
    await expect(heading).toHaveText('E2e Runner');

    await page.getByLabel('First name').fill('Augusta');
    await page.getByLabel('Location').fill('Bariloche');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Profile saved.')).toBeVisible();
    await expect(heading).toContainText('Augusta');
    await expect(heading.locator('xpath=ancestor::header')).toContainText('Bariloche');
    await expect(page.getByRole('button', { name: /^Account menu for Augusta/ })).toBeVisible();

    await test.step('a picture uploaded here replaces the initials in the sidebar', async () => {
      const account = page.getByRole('button', { name: /^Account menu for/ });
      await expect(account.locator('img')).toHaveCount(0);

      await page.getByLabel('Change avatar').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PIXEL_PNG });

      await expect(account.locator('img')).toHaveAttribute('src', /\/uploads\/avatars\//);
    });

    await test.step('the greeting on Home names the new first name', async () => {
      await page.getByRole('link', { name: 'Home' }).first().click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Augusta');
    });
  });

  test('the Breeze level chosen on the profile is the sidebar\'s, and it is kept', async ({ page, authedUser }) => {
    await logInThroughTheUi(page, authedUser);
    await page.goto('/profile');

    const profile = page.getByRole('radiogroup', { name: 'Breeze level' });
    const sidebar = page.getByRole('radiogroup', { name: 'Breeze', exact: true });
    await expect(profile.getByRole('radio', { name: 'Breezy' })).toBeChecked();

    await profile.getByText('Gusty').click();

    await expect(sidebar.getByRole('radio', { name: 'Gusty' })).toBeChecked();
    // The write is the person's own record, so a fresh page load reads it back.
    await expect
      .poll(async () => {
        const me = await page.request.get(`${process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1'}/auth/me`, {
          headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}` },
        });
        return (await me.json()).data.breeze;
      })
      .toBe('gusty');
    await page.reload();
    await expect(page.getByRole('radiogroup', { name: 'Breeze level' }).getByRole('radio', { name: 'Gusty' })).toBeChecked();
  });

  test('the two preferences that are not built are visible, off and disabled', async ({ page, authedUser }) => {
    await logInThroughTheUi(page, authedUser);
    await page.goto('/profile');

    for (const name of ['Due-date nudges', 'Weekly digest']) {
      const toggle = page.getByRole('switch', { name });
      await expect(toggle).toBeDisabled();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    await expect(page.getByRole('switch', { name: /sway/i })).toHaveCount(0);
  });

  test('changing the password: a wrong current one keeps the session, the right one ends it', async ({
    page,
    authedUser,
  }) => {
    const NEXT = 'FreshPassw0rd';
    await logInThroughTheUi(page, authedUser);
    await page.goto('/profile');

    const panel = page.getByRole('region', { name: 'Password' });
    await panel.getByLabel('Current password', { exact: true }).fill('NotMyPassw0rd');
    await panel.getByLabel('New password', { exact: true }).fill(NEXT);
    await panel.getByLabel('Confirm new password', { exact: true }).fill(NEXT);
    await panel.getByRole('button', { name: 'Change password' }).click();

    // A 401 would have signed the person out; this is a field to fix.
    await expect(panel.getByText('That is not your current password')).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    expect(await page.evaluate(() => localStorage.getItem('token'))).not.toBeNull();

    await panel.getByLabel('Current password', { exact: true }).fill(authedUser.password);
    await panel.getByRole('button', { name: 'Change password' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Your password has been changed. Sign in with your new password.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();

    await test.step('the old password is refused and the new one works', async () => {
      const form = page.locator('form').first();
      await form.getByLabel('Email address', { exact: true }).fill(authedUser.email);
      await form.getByLabel('Password', { exact: true }).fill(authedUser.password);
      await form.getByRole('button', { name: /sign in/i }).click();
      await expect(page.getByRole('alert')).toBeVisible();

      await form.getByLabel('Password', { exact: true }).fill(NEXT);
      await form.getByRole('button', { name: /sign in/i }).click();
      await expect(page.getByText('Your boards')).toBeVisible();
    });
  });

  test('Sign out in the header and in the card both end the session', async ({ page, authedUser }) => {
    await logInThroughTheUi(page, authedUser);

    for (const where of ['header', 'card'] as const) {
      await page.goto('/profile');
      const button =
        where === 'header'
          ? page.getByRole('banner').getByRole('button', { name: 'Sign out' })
          : page.getByRole('region', { name: 'Sign out' }).getByRole('button', { name: 'Sign out' });
      await button.click();

      await expect(page).toHaveURL(/\/login$/);
      expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();

      if (where === 'header') await logInThroughTheUi(page, authedUser);
    }
  });
});
