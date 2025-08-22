import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const root = createRoot(document.getElementById('root') as HTMLElement);

const useStrictMode = import.meta.env.VITE_USE_STRICT_MODE === 'true';

const app = <App />;

root.render(useStrictMode ? <StrictMode>{app}</StrictMode> : app);
