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

    const { confirmPassword: _confirmPassword, ...data } = credentials;
    const response = await api.post('/auth/register', data);
    return response.data.data;
  },

  async validateToken(): Promise<{ valid: boolean }> {
    try {
      const response = await api.get('/auth/validate-token');
      return response.data.data;
    } catch {
      return { valid: false };
    }
  },

  logout() {
    clearAuth();
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
