import * as authService from '../services/auth.service.js';
import * as passwordResetService from '../services/passwordReset.service.js';
import * as userService from '../services/user.service.js';
import responseHandler from '../utils/responseHandler.js';

export const register = async (req, res, next) => {
  try {
    const { token, user } = await authService.registerUser(req.body);
    responseHandler(res, 201, { token, user });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await authService.loginUser(email, password);
    responseHandler(res, 200, { token, user });
  } catch (error) {
    next(error);
  }
};

// Always 202 with the same body, whether or not the address has an account.
// The work behind it is shaped to match, see passwordReset.service.js.
export const forgotPassword = async (req, res, next) => {
  try {
    await passwordResetService.requestPasswordReset(req.body.email);
    responseHandler(res, 202, { accepted: true });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    await passwordResetService.resetPassword(req.body.token, req.body.newPassword);
    responseHandler(res, 200, { reset: true });
  } catch (error) {
    next(error);
  }
};

// Kept working for the currently deployed frontend, which still calls this
// on session restore. Retire once the frontend migrates to the sliding
// session and reads X-Auth-Token instead.
export const validateToken = async (_req, res, next) => {
  try {
    // If we reach here, the authentication middleware has already verified the token
    responseHandler(res, 200, { valid: true });
  } catch (error) {
    next(error);
  }
};

// Ends the session immediately rather than waiting out the inactivity
// window: bumps tokenVersion so the token just used to call this, and any
// other token issued before it, fails the middleware's version check on
// its very next use.
export const logout = async (req, res, next) => {
  try {
    await authService.invalidateSessions(req.user.id);
    responseHandler(res, 200, { loggedOut: true });
  } catch (error) {
    next(error);
  }
};

// Pure side effect: the renewal already happened in the authenticate
// middleware before this handler ran. A client calls this when the user is
// active but generating no other traffic. Cache-Control: no-store keeps an
// intermediary from ever serving a stale 204 instead of actually renewing.
export const ping = async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(204).end();
};

export const me = async (req, res, next) => {
  try {
    responseHandler(res, 200, req.user);
  } catch (error) {
    next(error);
  }
};

// The password-change path referenced in user.service.js: verifies the
// current password there, and on success bumps tokenVersion so every token
// issued before the change is rejected on its next use.
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await userService.changePassword(req.user.id, currentPassword, newPassword);
    responseHandler(res, 200, { changed: true });
  } catch (error) {
    next(error);
  }
};
