import * as authService from '../services/auth.service.js';
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

export const validateToken = async (_req, res, next) => {
  try {
    // If we reach here, the authentication middleware has already verified the token
    responseHandler(res, 200, { valid: true });
  } catch (error) {
    next(error);
  }
};
