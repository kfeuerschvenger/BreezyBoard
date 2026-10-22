// Controls that land where they belong, measured on a rendered page.
//
// This script exists because of finding P4-13, and because of the shape of
// defect it belongs to rather than the one instance. A control positioned
// with `absolute` inside a parent that was never made `relative` is correct
// markup, correct classes and correct behaviour: it reads fine in review, it
// passes every component test, and it is in the wrong place on screen. The
// test environment computes no layout, so nothing below the browser can see
// it.
//
// The register page had two password toggles landing eighteen pixels above
// the first field and on top of each other, so the one a person could see
// and press belonged to the other field.
//
// What is asserted is containment rather than coordinates: a toggle has to
// sit inside the box of the field it toggles. That survives a redesign,
// which a pixel assertion would not.

import { chromium } from 'playwright';

const FRONT = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';

const log = (...a) => console.log(...a);
const results = [];

const check = (label, ok, detail = '') => {
  results.push(ok);
  log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

/**
 * The box of the first match, or null when there is none.
 *
 * A short timeout and a catch, deliberately: a control that does not exist is
 * a result this script has to report, not a reason to stop. Unnamed buttons
 * are exactly what it is looking for, and the default thirty second wait
 * would turn each one into a hang.
 */
const box = async selector => {
  try {
    return await page.locator(selector).first().boundingBox({ timeout: 2000 });
  } catch {
    return null;
  }
};

/**
 * Whether the control sits within the field it belongs to.
 *
 * Two pixels of slack, because a control stretched over its field with
 * `inset-y-0` lands on fractional coordinates and rounds out by one. The
 * defect this is looking for was eighteen pixels out and overlapping another
 * control, so the tolerance has room to spare before it stops catching it.
 */
const SLACK = 2;

const containedBy = (inner, outer) =>
  Boolean(inner && outer) &&
  inner.x >= outer.x - SLACK &&
  inner.x + inner.width <= outer.x + outer.width + SLACK &&
  inner.y >= outer.y - SLACK &&
  inner.y + inner.height <= outer.y + outer.height + SLACK;

const describe = (inner, outer) =>
  inner && outer
    ? `control at y=${Math.round(inner.y)}, field spans y=${Math.round(outer.y)} to ${Math.round(outer.y + outer.height)}`
    : 'one of the two did not render';

log('--- the register page password toggles sit on their own fields ---');

await page.goto(`${FRONT}/register`);
await page.waitForSelector('form');

const passwordField = await box('input[name="password"]');
const passwordToggle = await box('button[aria-label="Show password"]');
check(
  'the password toggle is inside the password field',
  containedBy(passwordToggle, passwordField),
  describe(passwordToggle, passwordField)
);

const confirmField = await box('input[name="confirmPassword"]');
const confirmToggle = await box('button[aria-label="Show confirm password"]');
check(
  'the confirm toggle is inside the confirm field',
  containedBy(confirmToggle, confirmField),
  describe(confirmToggle, confirmField)
);

// Two controls occupying the same point is the symptom that made P4-13
// visible: whichever is painted last takes every click, so the one a person
// presses is not the one they think they are pressing.
check(
  'the two toggles are not stacked on each other',
  Boolean(passwordToggle && confirmToggle) && Math.abs(passwordToggle.y - confirmToggle.y) > 4,
  passwordToggle && confirmToggle
    ? `y=${Math.round(passwordToggle.y)} and y=${Math.round(confirmToggle.y)}`
    : 'one of the two did not render'
);

log('\n--- the login page password toggle sits on its own field ---');

await page.goto(`${FRONT}/login`);
await page.waitForSelector('form');

const loginField = await box('input[name="password"]');
const loginToggle = await box('form button[aria-label="Show password"]');
check(
  'the login toggle is inside the password field',
  containedBy(loginToggle, loginField),
  describe(loginToggle, loginField)
);

log('\n--- the reset page password toggles sit on their own fields ---');

await page.goto(`${FRONT}/reset-password#token=${'a'.repeat(64)}`);
await page.waitForSelector('form');

const resetField = await box('input[name="newPassword"]');
const resetToggle = await box('button[aria-label="Show new password"]');
check(
  'the new password toggle is inside the new password field',
  containedBy(resetToggle, resetField),
  describe(resetToggle, resetField)
);

const resetConfirmField = await box('input[name="confirmPassword"]');
const resetConfirmToggle = await box('button[aria-label="Show confirm new password"]');
check(
  'the confirm new password toggle is inside the confirm field',
  containedBy(resetConfirmToggle, resetConfirmField),
  describe(resetConfirmToggle, resetConfirmField)
);

check(
  'the two reset toggles are not stacked on each other',
  Boolean(resetToggle && resetConfirmToggle) && Math.abs(resetToggle.y - resetConfirmToggle.y) > 4,
  resetToggle && resetConfirmToggle
    ? `y=${Math.round(resetToggle.y)} and y=${Math.round(resetConfirmToggle.y)}`
    : 'one of the two did not render'
);

await browser.close();

const failed = results.filter(r => !r).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
