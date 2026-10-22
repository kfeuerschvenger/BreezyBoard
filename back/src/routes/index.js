import authRoutes from './auth.routes.js';
import boardRoutes from './board.routes.js';
import colorRoutes from './color.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import taskRoutes from './task.routes.js';
import templateRoutes from './template.routes.js';
import userRoutes from './user.routes.js';
import workspaceRoutes from './workspace.routes.js';

/**
 * Every router the API mounts, keyed by its path below /api/v1. app.js mounts
 * exactly this table, and the OpenAPI coverage test walks it, so a router that
 * is not listed here is not served and a router that is listed is checked
 * against the specification.
 */
export const apiRouters = Object.freeze({
  '/auth': authRoutes,
  '/boards': boardRoutes,
  '/colors': colorRoutes,
  '/dashboard': dashboardRoutes,
  '/tasks': taskRoutes,
  '/templates': templateRoutes,
  '/users': userRoutes,
  '/workspaces': workspaceRoutes,
});
