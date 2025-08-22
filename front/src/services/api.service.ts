import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { clearAuth, redirectToLogin } from '../utils/auth.helper';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30_000, // timeout in ms
});

// Interceptor to add token to requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
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
});

// Interceptor to handle responses and errors
api.interceptors.response.use(
  response => response,
  (error: AxiosError & { config?: AxiosRequestConfig & { _retry?: boolean } }) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      clearAuth();
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);

export default api;
