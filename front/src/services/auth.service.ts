import api from './api.service';
import { clearAuth } from '../utils/auth.helper';
import type { AuthResponse, LoginCredentials, RegisterCredentials, User } from '@/models';

export const AuthService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials);
    return response.data.data;
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    // Light validation on client: confirm passwords match
    if (credentials.password !== credentials.confirmPassword) {
      throw new Error('Passwords do not match');
    }

    // confirmPassword is a client-side check only and must never be sent.
    const { confirmPassword, ...data } = credentials;
    void confirmPassword;
    const response = await api.post('/auth/register', data);
    return response.data.data;
  },

  // Always resolves the same way for an address with an account and one
  // without, so there is nothing here to branch on and a caller must not
  // pretend there is: the confirmation it shows has to be neutral too.
  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/forgot-password', { email });
  },

  // The token is the one from the emailed link. A refused token rejects with
  // the API's INVALID_RESET_TOKEN code whether it was unknown, expired or
  // already used.
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset-password', { token, newPassword });
  },

  // For somebody who is signed in. A wrong current password rejects with the
  // API's WRONG_CURRENT_PASSWORD code (a 400, so the client does not read it
  // as an ended session). A success revokes every session of the account,
  // this browser's included: the caller has to drop the stored one.
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },

  // Replaces validateToken(). The backend wraps every response body as
  // { success, data }, /auth/me included, so this unwraps via
  // response.data.data like every other endpoint here.
  async me(): Promise<User> {
    const response = await api.get('/auth/me');
    return response.data.data;
  },

  // 204 No Content: a pure renewal side effect carried entirely by the
  // X-Auth-Token response header, already handled by the api.service.ts
  // response interceptor. There is no body to unwrap.
  async ping(): Promise<void> {
    await api.get('/auth/ping');
  },

  // Calls the server-side revocation (bumps tokenVersion) before clearing
  // local state, so a token that leaked elsewhere stops working immediately
  // instead of only going stale on this device. Never throws: signing out is
  // a local action that must always succeed even if the network call to
  // revoke the session fails (e.g. the user is offline).
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.warn('Server-side logout failed; clearing the local session anyway', error);
    } finally {
      clearAuth();
    }
  },

  getCurrentUser(): User | null {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch {
      clearAuth();
      return null;
    }
  },

  isAuthenticated(): boolean {
    try {
      return Boolean(localStorage.getItem('token'));
    } catch {
      return false;
    }
  },
};
