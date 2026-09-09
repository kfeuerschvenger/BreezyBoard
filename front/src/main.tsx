import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './app/ErrorBoundary';

const root = createRoot(document.getElementById('root') as HTMLElement);

const useStrictMode = import.meta.env.VITE_USE_STRICT_MODE === 'true';

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

root.render(useStrictMode ? <StrictMode>{app}</StrictMode> : app);
