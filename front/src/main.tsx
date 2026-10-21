import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './app/ErrorBoundary';
import { frontendEnv } from './config/env';

const root = createRoot(document.getElementById('root') as HTMLElement);

const useStrictMode = frontendEnv.strictMode;

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

root.render(useStrictMode ? <StrictMode>{app}</StrictMode> : app);
