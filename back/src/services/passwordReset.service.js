import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import env from '../config/env.js';
import { ErrorCode } from '../constants/errorCodes.js';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';
import { sendMail } from './mail.service.js';

// 32 random bytes is 256 bits, far past anything that can be guessed, and
// hex keeps the token safe to place in a URL without encoding. The link carries
// it in the fragment, which a browser never sends to a server, so it stays out
// of access logs and proxies.
const TOKEN_BYTES = 32;

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

/**
 * The message a person receives. Plain text first, since it is the part
 * every mail client shows; the HTML carries the same words and the same link.
 *
 * @param {string} link
 * @returns {{ subject: string, text: string, html: string }}
 */
const buildResetMessage = link => {
  const minutes = Math.round(env.PASSWORD_RESET_TTL_MS / 60000);
  const lifetime = minutes === 1 ? '1 minute' : `${minutes} minutes`;

  return {
    subject: 'Reset your BreezyBoard password',
    text: [
      'Someone asked to reset the password for your BreezyBoard account.',
      '',
      `Open this link to choose a new password. It works once and expires in ${lifetime}:`,
      link,
      '',
      'If you did not ask for this, ignore this message. Your password stays as it is.',
    ].join('\n'),
    html: [
      '<p>Someone asked to reset the password for your BreezyBoard account.</p>',
      `<p>Open this link to choose a new password. It works once and expires in ${lifetime}:</p>`,
      `<p><a href="${link}">Choose a new password</a></p>`,
      '<p>If you did not ask for this, ignore this message. Your password stays as it is.</p>',
    ].join('\n'),
  };
};

/**
 * Start a password reset for an email address.
 *
 * Resolves the same way, and issues the same statements, whether or not the
 * address belongs to anybody. That is the whole contract: the route must not
 * become a way to ask whether an address has an account. So both paths look
 * the address up, both generate and hash a token, and both issue one
 * `updateOne`. The writes themselves are not alike: for a known address the
 * `updateOne` stores the token, and for an unknown one it is aimed at an id
 * nothing has and matches no document, so it writes nothing. The response,
 * the statements and their order are what match. The sending is not awaited,
 * so it cannot show in the response time.
 *
 * The new token is added to the user's outstanding links and the earlier ones
 * stay valid until their own expiry. The request is anonymous, so replacing
 * them would let anybody who knew an address destroy the link its owner had
 * just been sent, as often as they liked. Only the `PASSWORD_RESET_MAX_OUTSTANDING`
 * most recent are kept, the oldest dropped, which bounds the list and the
 * number of live tokens there are to guess.
 *
 * At most one link is issued per address per `PASSWORD_RESET_COOLDOWN_MS`, so
 * the route cannot be used to fill someone's mailbox. The cooldown is read
 * from the stored expiries: a token's issue time is its expiry minus the
 * lifetime, which needs no extra field, survives a restart and holds across
 * instances. The check lives in the filter of the same `updateOne` that saves
 * the token, so two simultaneous requests cannot both pass it. A request
 * inside the cooldown matches nothing, adds nothing and sends nothing. Its
 * response and its database work are those of any other request, and an
 * unknown address matches nothing for the same reason, so no one can tell the
 * two apart from outside.
 *
 * @param {string} email - already trimmed and lowercased by the validation layer
 * @returns {Promise<void>}
 */
export const requestPasswordReset = async email => {
  const user = await User.findOne({ email }).select('_id email');

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const target = user ? user._id : new mongoose.Types.ObjectId();
  const now = Date.now();
  const issuedBefore = now + env.PASSWORD_RESET_TTL_MS - env.PASSWORD_RESET_COOLDOWN_MS;

  const { modifiedCount } = await User.updateOne(
    { _id: target, passwordResets: { $not: { $elemMatch: { expiresAt: { $gt: new Date(issuedBefore) } } } } },
    {
      // Appended in issue order, so a negative $slice keeps the newest.
      $push: {
        passwordResets: {
          $each: [{ tokenHash: hashToken(token), expiresAt: new Date(now + env.PASSWORD_RESET_TTL_MS) }],
          $slice: -env.PASSWORD_RESET_MAX_OUTSTANDING,
        },
      },
    }
  );

  if (!user || modifiedCount === 0) {
    return;
  }

  const link = `${env.FRONTEND_URL}/reset-password#token=${token}`;

  // Not awaited: a slow or failing relay must not change the response. The
  // failure is logged without the message, which carries the link.
  sendMail({ to: user.email, ...buildResetMessage(link) }).catch(error => {
    logger.error({ err: error }, 'Password reset email could not be sent');
  });
};

/**
 * Set a new password with a reset token.
 *
 * The token is looked up by its hash and consumed in the same operation, a
 * single `findOneAndUpdate`, so two requests carrying the same token cannot
 * both succeed: whichever the database applies second finds no match. The
 * match requires that link to be unexpired, each link having its own expiry,
 * and the update clears every outstanding link of the account, replaces the
 * password and bumps `tokenVersion`, which fails every session token issued
 * before now on its next request. Clearing all of them is what stops a link
 * emailed earlier from overwriting the password just chosen.
 *
 * An unknown, expired or already used token all fail with one error, so a
 * caller learns nothing about which of the three it was. The new password is
 * hashed before the lookup rather than after it, which keeps the cost of a
 * refused token the same as the cost of an accepted one.
 *
 * @param {string} token
 * @param {string} newPassword - already checked against the password rule
 * @returns {Promise<void>}
 */
export const resetPassword = async (token, newPassword) => {
  const salt = await bcrypt.genSalt(env.SALT);
  const password = await bcrypt.hash(newPassword, salt);

  const user = await User.findOneAndUpdate(
    { passwordResets: { $elemMatch: { tokenHash: hashToken(token), expiresAt: { $gt: new Date() } } } },
    {
      $set: { password },
      $unset: { passwordResets: '' },
      $inc: { tokenVersion: 1 },
    }
  );

  if (!user) {
    throw new ApiError(400, 'This password reset link is invalid or has expired', [], ErrorCode.INVALID_RESET_TOKEN);
  }
};
