import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import env from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import boardRoutes from './routes/board.routes.js';
import colorRoutes from './routes/color.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import taskRoutes from './routes/task.routes.js';
import templateRoutes from './routes/template.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();

app.set('trust proxy', true);

// Middlewares
app.use(helmet());

// An unconfigured cors() allows every origin on the internet. The allowlist
// comes from CORS_ORIGINS and is required in production; an empty list in
// development reflects the request origin so a local frontend on any port
// still works. X-Auth-Token is exposed because the sliding session renewal
// travels in that response header, and a browser hides unexposed headers
// from JavaScript entirely.
app.use(
  cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    credentials: true,
    exposedHeaders: ['X-Auth-Token'],
  })
);

// Bounded so a single request cannot exhaust memory with an oversized body.
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/colors', colorRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/users', userRoutes);

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Error handling
app.use(errorHandler);

export default app;
