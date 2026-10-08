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
 * Resolves the same way, and does the same amount of database work, whether
 * or not the address belongs to anybody. That is the whole contract: the
 * route must not become a way to ask whether an address has an account. So
 * both paths look the address up, both generate and hash a token, and both
 * issue one `updateOne`, which for an unknown address is aimed at an id
 * nothing has and matches no document. Only the sending differs, and the
 * sending is not awaited, so it cannot show in the response time.
 *
 * Saving the token overwrites the previous pair on the user, which is what
 * makes a new request invalidate the old link.
 *
 * @param {string} email - already trimmed and lowercased by the validation layer
 * @returns {Promise<void>}
 */
export const requestPasswordReset = async email => {
  const user = await User.findOne({ email }).select('_id email');

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const target = user ? user._id : new mongoose.Types.ObjectId();

  await User.updateOne(
    { _id: target },
    {
      $set: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MS),
      },
    }
  );

  if (!user) {
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
 * match requires an unexpired token, and the update clears it, replaces the
 * password and bumps `tokenVersion`, which fails every session token issued
 * before now on its next request.
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
    { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: { $gt: new Date() } },
    {
      $set: { password },
      $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' },
      $inc: { tokenVersion: 1 },
    }
  );

  if (!user) {
    throw new ApiError(400, 'This password reset link is invalid or has expired', [], ErrorCode.INVALID_RESET_TOKEN);
  }
};
