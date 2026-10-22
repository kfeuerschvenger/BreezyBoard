import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import env from '../config/env.js';
import ApiError from '../utils/apiError.js';

/**
 * Mint a sliding-session token. `sessionStartedAt` must be passed in
 * verbatim on every renewal rather than recomputed, because it is the
 * absolute-cap clock and must never move. `exp` (derived from
 * JWT_INACTIVITY_TTL_MS) and `iat` are the inactivity clock and are
 * rewritten by jsonwebtoken on every call, which is the whole point: the
 * two clocks must stay independent.
 *
 * `jti` is a fresh random id on every mint, including renewals. Without it
 * two tokens signed within the same second would carry byte-for-byte
 * identical claims (id, sessionStartedAt, tokenVersion, iat and exp all
 * unchanged), and jsonwebtoken's exp/iat are whole seconds, so a renewal
 * that happens faster than a clock tick would otherwise mint a token
 * identical to the one it was meant to replace.
 *
 * @param {object} claims
 * @param {string} claims.id
 * @param {number} claims.sessionStartedAt - epoch ms, stamped once at login
 * @param {number} claims.tokenVersion - must match the user's stored value
 * @returns {string}
 */
export const signSessionToken = ({ id, sessionStartedAt, tokenVersion }) =>
  jwt.sign({ id, sessionStartedAt, tokenVersion, jti: crypto.randomUUID() }, env.JWT_SECRET, {
    algorithm: env.JWT_ALGORITHM,
    expiresIn: Math.floor(env.JWT_INACTIVITY_TTL_MS / 1000),
  });

/**
 * Renew a token as a side effect of an authenticated request. Carries
 * `sessionStartedAt` and `tokenVersion` over unchanged from the decoded
 * token that was just verified; only `iat` and `exp` move forward.
 *
 * @param {{ id: string, sessionStartedAt: number, tokenVersion: number }} decoded
 * @returns {string}
 */
export const renewSessionToken = decoded =>
  signSessionToken({
    id: decoded.id,
    sessionStartedAt: decoded.sessionStartedAt,
    tokenVersion: decoded.tokenVersion,
  });

/**
 * The absolute cap. Anchored on `sessionStartedAt`, which is stamped once
 * at login and never refreshed, rather than on `iat`, which is rewritten on
 * every renewal. Anchoring on `iat` would silently turn the hard ceiling
 * into a second inactivity window.
 *
 * @param {number} sessionStartedAt - epoch ms
 * @returns {boolean}
 */
export const isAbsoluteSessionExpired = sessionStartedAt =>
  typeof sessionStartedAt !== 'number' || Date.now() - sessionStartedAt > env.JWT_ABSOLUTE_TTL_MS;

/**
 * Bump the user's tokenVersion so every token minted before the bump fails
 * the middleware's tokenVersion check on its very next request, regardless
 * of how much of its exp window remains. Used by logout and, from
 * user.service.js, by password change.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export const invalidateSessions = async userId => {
  await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
};

export const registerUser = async userData => {
  const { firstName, lastName, email, password } = userData;

  // Verify if the user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, 'Email already in use');
  }

  // Hash the password
  const salt = await bcrypt.genSalt(env.SALT);
  const hashedPassword = await bcrypt.hash(password, salt);

  // The account and its personal workspace are created together or not at
  // all. Every board belongs to a workspace, so a user who exists without
  // one can log in and then cannot do anything: the failure would look like
  // a bug in board creation rather than a half-finished registration. The
  // replica set, which the board delete cascade also needs, is what makes
  // this possible.
  const session = await mongoose.startSession();
  let user = null;

  try {
    await session.withTransaction(async () => {
      const [created] = await User.create(
        [
          {
            firstName,
            lastName,
            email,
            password: hashedPassword,
          },
        ],
        { session }
      );

      user = created;

      await Workspace.create(
        [
          {
            name: 'Personal',
            createdBy: user._id,
            members: [{ user: user._id, role: 'admin' }],
            isPersonal: true,
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  // A brand new session: sessionStartedAt is stamped now and never moves
  // again for the life of this session.
  const token = signSessionToken({
    id: user._id,
    sessionStartedAt: Date.now(),
    tokenVersion: user.tokenVersion,
  });

  return { token, user };
};

export const loginUser = async (email, password) => {
  // Verify if the user exists
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // A brand new session: sessionStartedAt is stamped now and never moves
  // again for the life of this session.
  const token = signSessionToken({
    id: user._id,
    sessionStartedAt: Date.now(),
    tokenVersion: user.tokenVersion,
  });

  return { token, user };
};
