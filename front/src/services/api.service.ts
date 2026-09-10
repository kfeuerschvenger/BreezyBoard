import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { clearAuth, redirectToLogin } from '../utils/auth.helper';
import { markSessionRenewed } from '../features/session/sessionActivity';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000, // timeout in ms
});

// Interceptor to add token to requests. Exported so it can be exercised
// directly in tests without going through axios' internal interceptor chain.
export const attachAuthToken = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  try {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {
    console.warn('Could not access localStorage in request interceptor', e);
  }

  return config;
};

api.interceptors.request.use(attachAuthToken);

/**
 * Every request that passed the server's auth checks - success or error
 * alike - carries a renewed JWT in the X-Auth-Token response header. Axios
 * lowercases header names in the browser, so it is read as x-auth-token.
 * Storing it and marking the renewal here keeps the client's token, and its
 * "last renewed" clock, in sync with the server on every authenticated
 * request, not only on explicit calls to ping()/me().
 */
const captureRenewedToken = (headers: unknown): void => {
  try {
    const newToken = (headers as Record<string, string> | undefined)?.['x-auth-token'];
    if (newToken) {
      localStorage.setItem('token', newToken);
      markSessionRenewed();
    }
  } catch (e) {
    console.warn('Could not persist the renewed token', e);
  }
};

export const handleResponseSuccess = (response: AxiosResponse): AxiosResponse => {
  captureRenewedToken(response.headers);
  return response;
};

export const handleResponseError = (
  error: AxiosError & { config?: AxiosRequestConfig & { _retry?: boolean } }
): Promise<never> => {
  captureRenewedToken(error.response?.headers);

  const originalRequest = error.config;

  if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
    originalRequest._retry = true;

    clearAuth();
    redirectToLogin();
  }

  return Promise.reject(error);
};

// Interceptor to handle responses and errors
api.interceptors.response.use(handleResponseSuccess, handleResponseError);

export default api;
