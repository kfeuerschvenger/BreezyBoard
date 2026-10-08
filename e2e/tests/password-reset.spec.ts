import type { Page } from '@playwright/test';
import { test, expect, logInThroughTheUi } from './fixtures';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';
const FRONT_URL = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
// Mailpit, the development mail catcher. Its HTTP API is how the suite reads
// the email a person would have opened.
const MAIL_URL = process.env.E2E_MAIL_URL ?? 'http://localhost:8025';

const NEW_PASSWORD = 'BrandNewPass9';

/** The text of the newest message sent to an address, waiting for it to arrive. */
async function waitForMailTo(page: Page, address: string): Promise<string> {
  let id = '';

  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${MAIL_URL}/api/v1/search`, { params: { query: `to:${address}` } });
        const body = await response.json();
        id = body.messages?.[0]?.ID ?? '';
        return id;
      },
      { message: `No email for ${address} reached Mailpit at ${MAIL_URL}. Run: docker compose up -d`, timeout: 15_000 }
    )
    .not.toBe('');

  const message = await (await page.request.get(`${MAIL_URL}/api/v1/message/${id}`)).json();
  return message.Text as string;
}

/** The reset link inside an email body. */
function linkIn(text: string): string {
  const match = /https?:\/\/\S+\/reset-password\?token=[a-f0-9]+/.exec(text);
  expect(match, `No reset link in the email:\n${text}`).not.toBeNull();
  return match![0];
}

/** Asks for a reset link through the real dialog on the sign in page. */
async function requestResetThroughTheUi(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Forgot password' });
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByRole('button', { name: 'Send reset link' }).click();
  await expect(dialog.getByRole('status')).toContainText(`If an account exists for ${email}`);
}

test.describe('password recovery', () => {
  test('a reset link sets a new password and signs out every earlier session', async ({ page, browser, authedUser }) => {
    // A session that exists before the reset, in its own browser context.
    await logInThroughTheUi(page, authedUser);

    const stranger = await browser.newContext({ baseURL: FRONT_URL });
    const recovery = await stranger.newPage();

    await requestResetThroughTheUi(recovery, authedUser.email);
    const link = linkIn(await waitForMailTo(recovery, authedUser.email));
    expect(link.startsWith(FRONT_URL), 'the link points at the frontend origin from configuration').toBe(true);

    await recovery.goto(link);
    await expect(recovery.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    // The token is a credential: it must not stay in the address bar or the history.
    await expect(recovery).toHaveURL(/\/reset-password$/);
    expect(recovery.url()).not.toContain('token');

    await recovery.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await recovery.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
    await recovery.getByRole('button', { name: 'Set new password' }).click();

    await expect(recovery).toHaveURL(/\/login$/);
    await expect(recovery.getByText('Your password has been changed. Sign in with your new password.')).toBeVisible();

    // The session that predates the reset is dead on its next request.
    const revoked = await page.request.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${authedUser.token}` } });
    expect(revoked.status()).toBe(401);
    expect((await revoked.json()).code).toBe('TOKEN_REVOKED');

    await page.reload();
    await expect(page).toHaveURL(/\/login$/);

    // The old password no longer works, the new one does.
    const old = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: authedUser.email, password: authedUser.password },
    });
    expect(old.status()).toBe(401);

    await logInThroughTheUi(recovery, { ...authedUser, password: NEW_PASSWORD });

    await stranger.close();
  });

  test('a link works once', async ({ page, authedUser }) => {
    await requestResetThroughTheUi(page, authedUser.email);
    const link = linkIn(await waitForMailTo(page, authedUser.email));

    await page.goto(link);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto(link);
    await page.getByLabel('New password', { exact: true }).fill('AnotherPass7x');
    await page.getByLabel('Confirm new password', { exact: true }).fill('AnotherPass7x');
    await page.getByRole('button', { name: 'Set new password' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
    await page.getByRole('link', { name: 'Request a new link' }).click();
    await expect(page.getByRole('dialog', { name: 'Forgot password' })).toBeVisible();
  });

  test('an address with no account gets the same confirmation and no email', async ({ page }) => {
    const unknown = `nobody-${Date.now()}@example.test`;

    await requestResetThroughTheUi(page, unknown);

    // Same wording as for a real account, checked by requestResetThroughTheUi.
    // Whether a message went out is read from the catcher, after a pause long
    // enough for a mistaken send to have arrived.
    await page.waitForTimeout(1500);
    const response = await page.request.get(`${MAIL_URL}/api/v1/search`, { params: { query: `to:${unknown}` } });
    expect((await response.json()).messages ?? []).toHaveLength(0);
  });

  test('a reset address with no token explains itself instead of showing a form', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { level: 1, name: 'This link cannot be used' })).toBeVisible();
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  });
});
