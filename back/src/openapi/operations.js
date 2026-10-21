import { z } from 'zod';
import { paginationQuerySchema } from '../validation/common.validation.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validation/auth.validation.js';
import {
  addBoardMembersSchema,
  createBoardSchema,
  idParamSchema as boardIdParam,
  updateBoardSchema,
} from '../validation/board.validation.js';
import { getColorsQuerySchema, idParamSchema as colorIdParam } from '../validation/color.validation.js';
import {
  boardIdParamSchema,
  checklistParamsSchema,
  createTaskSchema,
  idParamSchema as taskIdParam,
  moveTaskSchema,
  updateChecklistItemSchema,
  updateTaskSchema,
} from '../validation/task.validation.js';
import {
  boardMembersQuerySchema,
  idParamSchema as userIdParam,
  searchUsersQuerySchema,
  updateUserSchema,
} from '../validation/user.validation.js';
import {
  addWorkspaceMembersSchema,
  createWorkspaceSchema,
  idParamSchema as workspaceIdParam,
} from '../validation/workspace.validation.js';
import {
  BoardSchema,
  ColorSchema,
  DashboardStatsSchema,
  TaskSchema,
  TemplateSchema,
  UserSchema,
  WorkspaceSchema,
  envelope,
} from './schemas.js';

/**
 * Request bodies, by the name they take in `components.schemas`. These are the
 * very objects the routes validate with, so a field added to a route schema
 * shows up in the document on the next `npm run openapi` and the drift check
 * fails until it does.
 */
export const requestModels = {
  RegisterRequest: registerSchema,
  LoginRequest: loginSchema,
  ForgotPasswordRequest: forgotPasswordSchema,
  ResetPasswordRequest: resetPasswordSchema,
  ChangePasswordRequest: changePasswordSchema,
  CreateBoardRequest: createBoardSchema,
  UpdateBoardRequest: updateBoardSchema,
  AddBoardMembersRequest: addBoardMembersSchema,
  CreateTaskRequest: createTaskSchema,
  UpdateTaskRequest: updateTaskSchema,
  MoveTaskRequest: moveTaskSchema,
  UpdateChecklistItemRequest: updateChecklistItemSchema,
  UpdateUserRequest: updateUserSchema,
  CreateWorkspaceRequest: createWorkspaceSchema,
  AddWorkspaceMembersRequest: addWorkspaceMembersSchema,
};

const flag = key => z.looseObject({ success: z.literal(true), data: z.looseObject({ [key]: z.literal(true) }) });

/**
 * Response bodies, by name. `envelope` is the `{ success, data }` wrapper every
 * success goes through (utils/responseHandler.js).
 */
export const responseModels = {
  AuthResponse: envelope(
    z.looseObject({
      token: z.string().describe('A signed JWT. Send it as `Authorization: Bearer <token>`.'),
      user: UserSchema,
    })
  ),
  UserResponse: envelope(UserSchema),
  UserListResponse: envelope(z.array(UserSchema)),
  AvatarResponse: envelope(z.looseObject({ avatar: z.string().describe('The absolute URL of the stored picture.') })),
  AcceptedResponse: flag('accepted'),
  ResetResponse: flag('reset'),
  ValidResponse: flag('valid'),
  LoggedOutResponse: flag('loggedOut'),
  ChangedResponse: flag('changed'),
  BoardResponse: envelope(BoardSchema),
  BoardListResponse: envelope(z.array(BoardSchema), { paginated: true }),
  BoardDeletedResponse: envelope(
    z.looseObject({
      message: z.literal('Board deleted successfully'),
      deletedAt: z.iso.datetime(),
    })
  ),
  TaskResponse: envelope(TaskSchema),
  TaskListResponse: envelope(z.array(TaskSchema), { paginated: true }),
  TaskDeletedResponse: envelope(z.looseObject({ message: z.literal('Task deleted successfully') })),
  WorkspaceResponse: envelope(WorkspaceSchema),
  WorkspaceListResponse: envelope(z.array(WorkspaceSchema)),
  ColorResponse: envelope(ColorSchema),
  ColorListResponse: envelope(z.array(ColorSchema)),
  TemplateListResponse: envelope(z.array(TemplateSchema)),
  DashboardStatsResponse: envelope(DashboardStatsSchema),
  HealthResponse: z.looseObject({
    status: z.literal('ok'),
    message: z.literal('Server is running'),
  }),
};

/**
 * One entry per Express route. `access` is prose for the reader, `errors`
 * lists the failure statuses the route can answer beyond the 500 every route
 * has, and a 400 or 401 is added on its own when the route validates input or
 * needs a session. Paths are relative to the `/api/v1` server.
 *
 * @typedef {object} Operation
 * @property {'get'|'post'|'put'|'patch'|'delete'} method
 * @property {string} path OpenAPI path template, `{id}` style
 * @property {string} tag
 * @property {string} summary
 * @property {string} [description]
 * @property {string} [access] who may call it, in a sentence
 * @property {boolean} [public] true when no bearer token is needed
 * @property {boolean} [deprecated]
 * @property {{ params?: z.ZodType, query?: z.ZodType }} [request]
 * @property {string} [body] a key of requestModels
 * @property {'multipart'} [bodyKind]
 * @property {{ status: number, model?: string, description: string }} success
 * @property {number[]} [errors]
 */

/** @type {Operation[]} */
export const operations = [
  // Auth
  {
    method: 'post',
    path: '/auth/register',
    tag: 'Auth',
    summary: 'Create an account',
    description:
      'Creates the account and its personal workspace and signs the person in. Answers 400 when the email is already registered. Limited per client address, 20 an hour unless REGISTRATION_LIMIT_PER_HOUR says otherwise.',
    public: true,
    body: 'RegisterRequest',
    success: { status: 201, model: 'AuthResponse', description: 'The account, and its first session token.' },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Sign in',
    description:
      'A wrong password and an unknown email address answer the same 401, so the route cannot be used to find out which addresses have an account. Failures alone count towards the limit of 10 per 15 minutes per client address.',
    public: true,
    body: 'LoginRequest',
    success: { status: 200, model: 'AuthResponse', description: 'The person, and a session token.' },
    errors: [400, 401, 429],
  },
  {
    method: 'post',
    path: '/auth/forgot-password',
    tag: 'Auth',
    summary: 'Ask for a password reset link',
    description:
      'Always answers 202 with the same body, whether or not the address has an account, and mails a link only when it does. Every request counts towards the limit of 10 per 15 minutes per client address, successful ones included.',
    public: true,
    body: 'ForgotPasswordRequest',
    success: { status: 202, model: 'AcceptedResponse', description: 'The request was accepted. Nothing says whether an email was sent.' },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/auth/reset-password',
    tag: 'Auth',
    summary: 'Set a new password with a mailed token',
    description:
      'Consumes the token and revokes every session of the account. An unknown, expired or already used token answers one error, 400 with the code INVALID_RESET_TOKEN. Shares the recovery limit with the request for a link.',
    public: true,
    body: 'ResetPasswordRequest',
    success: { status: 200, model: 'ResetResponse', description: 'The password was changed and every session was revoked.' },
    errors: [400, 429],
  },
  {
    method: 'get',
    path: '/auth/validate-token',
    tag: 'Auth',
    summary: 'Check that the token is still good',
    description: 'Kept for clients that still call it on session restore. Prefer GET /auth/me.',
    deprecated: true,
    success: { status: 200, model: 'ValidResponse', description: 'The token is valid.' },
    errors: [],
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Auth',
    summary: 'End the session now',
    description: 'Revokes every token issued to the account before this call, so the one just used fails on its next use.',
    success: { status: 200, model: 'LoggedOutResponse', description: 'The session ended.' },
    errors: [],
  },
  {
    method: 'get',
    path: '/auth/ping',
    tag: 'Auth',
    summary: 'Renew the session with no other effect',
    description: 'The renewal happens in the authentication step, before the handler runs, and the new token is in the X-Auth-Token response header. Answers 204 with Cache-Control no-store.',
    success: { status: 204, description: 'The session was renewed. There is no body.' },
    errors: [],
  },
  {
    method: 'get',
    path: '/auth/me',
    tag: 'Auth',
    summary: 'The signed in person',
    success: { status: 200, model: 'UserResponse', description: 'The account the token belongs to.' },
    errors: [],
  },
  {
    method: 'post',
    path: '/auth/change-password',
    tag: 'Auth',
    summary: 'Change the password',
    description:
      'A wrong current password is a 400 with the code WRONG_CURRENT_PASSWORD, never a 401, because a client treats every 401 as an ended session. Success revokes every token issued before it. Failures count towards a limit of 10 per 15 minutes per account.',
    body: 'ChangePasswordRequest',
    success: { status: 200, model: 'ChangedResponse', description: 'The password changed. Sign in again with the new one.' },
    errors: [400, 429],
  },

  // Boards
  {
    method: 'get',
    path: '/boards',
    tag: 'Boards',
    summary: 'List the boards the caller can open',
    description: 'Boards in the workspaces the caller belongs to that the caller created or is a member of, newest activity first. Soft deleted boards are not listed. Each item carries taskCount, memberCount, progress and viewerRole.',
    request: { query: paginationQuerySchema },
    success: { status: 200, model: 'BoardListResponse', description: 'A page of boards, or all of them when limit is absent.' },
    errors: [],
  },
  {
    method: 'post',
    path: '/boards',
    tag: 'Boards',
    summary: 'Create a board',
    description: 'The columns are copied from the template onto the board. Without workspaceId the board goes into the caller\'s personal workspace.',
    body: 'CreateBoardRequest',
    success: { status: 201, model: 'BoardResponse', description: 'The new board.' },
    errors: [400, 403],
  },
  {
    method: 'get',
    path: '/boards/{id}',
    tag: 'Boards',
    summary: 'Read a board',
    access: 'Board member.',
    request: { params: boardIdParam },
    success: { status: 200, model: 'BoardResponse', description: 'The board, with viewerRole set to the role of the caller.' },
    errors: [403, 404],
  },
  {
    method: 'put',
    path: '/boards/{id}',
    tag: 'Boards',
    summary: 'Update a board',
    description: 'Only title, description and color are applied. Other fields are ignored.',
    access: 'Board owner.',
    request: { params: boardIdParam },
    body: 'UpdateBoardRequest',
    success: { status: 200, model: 'BoardResponse', description: 'The updated board.' },
    errors: [403, 404],
  },
  {
    method: 'delete',
    path: '/boards/{id}',
    tag: 'Boards',
    summary: 'Delete a board',
    description: 'A soft delete: the board and its tasks disappear from every read and can be brought back with the restore route until BOARD_RETENTION_MS has passed, after which a background job removes them for good.',
    access: 'Board owner.',
    request: { params: boardIdParam },
    success: { status: 200, model: 'BoardDeletedResponse', description: 'The board was marked deleted.' },
    errors: [403, 404],
  },
  {
    method: 'post',
    path: '/boards/{id}/restore',
    tag: 'Boards',
    summary: 'Restore a deleted board',
    description: 'Somebody with no role on the board gets the 404 an unknown id gets. A member who is not an owner gets a 403.',
    access: 'Board owner.',
    request: { params: boardIdParam },
    success: { status: 200, model: 'BoardResponse', description: 'The board, back as it was.' },
    errors: [403, 404],
  },
  {
    method: 'patch',
    path: '/boards/{id}/members',
    tag: 'Boards',
    summary: 'Add members to a board',
    description: 'Every id has to be an existing user, otherwise the answer is a 400. Somebody who is not yet in the workspace of the board is added to it as a member, since a board membership gives no access to anyone outside the workspace.',
    access: 'Board owner.',
    request: { params: boardIdParam },
    body: 'AddBoardMembersRequest',
    success: { status: 200, model: 'BoardResponse', description: 'The board with its members populated.' },
    errors: [403, 404],
  },

  // Tasks
  {
    method: 'get',
    path: '/tasks/board/{boardId}',
    tag: 'Tasks',
    summary: 'List the tasks of a board',
    description: 'Live tasks only, ascending by order key. Soft deleted tasks are not listed.',
    access: 'Board member.',
    request: { params: boardIdParamSchema, query: paginationQuerySchema },
    success: { status: 200, model: 'TaskListResponse', description: 'A page of tasks, or all of them when limit is absent.' },
    errors: [403, 404],
  },
  {
    method: 'post',
    path: '/tasks/board/{boardId}',
    tag: 'Tasks',
    summary: 'Create a task',
    description: 'The task goes to the bottom of the column named by status. The order key is minted by the server. The status has to be the id of a column of this board, and the owner a member of it.',
    access: 'Board member.',
    request: { params: boardIdParamSchema },
    body: 'CreateTaskRequest',
    success: { status: 201, model: 'TaskResponse', description: 'The new task.' },
    errors: [403, 404],
  },
  {
    method: 'get',
    path: '/tasks/{id}',
    tag: 'Tasks',
    summary: 'Read a task',
    access: 'Member of the task\'s board.',
    request: { params: taskIdParam },
    success: { status: 200, model: 'TaskResponse', description: 'The task.' },
    errors: [403, 404],
  },
  {
    method: 'put',
    path: '/tasks/{id}',
    tag: 'Tasks',
    summary: 'Update a task',
    description: 'The board and the order key cannot be changed here: a task changes column and position through the move route. Unknown fields are ignored.',
    access: 'Member of the task\'s board.',
    request: { params: taskIdParam },
    body: 'UpdateTaskRequest',
    success: { status: 200, model: 'TaskResponse', description: 'The updated task.' },
    errors: [403, 404],
  },
  {
    method: 'delete',
    path: '/tasks/{id}',
    tag: 'Tasks',
    summary: 'Delete a task',
    description: 'A soft delete. The task keeps its id, dates, column and order key, and the restore route puts it back in the same place until BOARD_RETENTION_MS has passed.',
    access: 'Member of the task\'s board.',
    request: { params: taskIdParam },
    success: { status: 200, model: 'TaskDeletedResponse', description: 'The task was marked deleted.' },
    errors: [403, 404],
  },
  {
    method: 'post',
    path: '/tasks/{id}/restore',
    tag: 'Tasks',
    summary: 'Restore a deleted task',
    description: 'Idempotent: restoring a task that is not deleted answers with the task. Somebody with no role on the board gets 404 whether the task exists or not. A task deleted longer ago than the retention window is a 404.',
    access: 'Member of the task\'s board.',
    request: { params: taskIdParam },
    success: { status: 200, model: 'TaskResponse', description: 'The task, back in its column.' },
    errors: [404],
  },
  {
    method: 'patch',
    path: '/tasks/{id}/move',
    tag: 'Tasks',
    summary: 'Move a task between two neighbours',
    description:
      'The body names the column and the two tasks the card was dropped between, never a position. No afterId means the top of the column, no beforeId the bottom. A 409 with the code CONFLICT means a named neighbour is no longer where the client saw it: reload the board and try again.',
    access: 'Member of the task\'s board.',
    request: { params: taskIdParam },
    body: 'MoveTaskRequest',
    success: { status: 200, model: 'TaskResponse', description: 'The task with its new column and order key.' },
    errors: [403, 404, 409],
  },
  {
    method: 'patch',
    path: '/tasks/{taskId}/checklist/{itemId}',
    tag: 'Tasks',
    summary: 'Update a checklist item',
    access: 'Member of the task\'s board.',
    request: { params: checklistParamsSchema },
    body: 'UpdateChecklistItemRequest',
    success: { status: 200, model: 'TaskResponse', description: 'The task with the item changed.' },
    errors: [403, 404],
  },
  {
    method: 'delete',
    path: '/tasks/{taskId}/checklist/{itemId}',
    tag: 'Tasks',
    summary: 'Remove a checklist item',
    access: 'Member of the task\'s board.',
    request: { params: checklistParamsSchema },
    success: { status: 200, model: 'TaskResponse', description: 'The task without the item.' },
    errors: [403, 404],
  },

  // Colors and templates
  {
    method: 'get',
    path: '/colors',
    tag: 'Reference data',
    summary: 'List the colour palette',
    request: { query: getColorsQuerySchema },
    success: { status: 200, model: 'ColorListResponse', description: 'Every colour, or those of one type.' },
    errors: [],
  },
  {
    method: 'get',
    path: '/colors/{id}',
    tag: 'Reference data',
    summary: 'Read a colour',
    request: { params: colorIdParam },
    success: { status: 200, model: 'ColorResponse', description: 'The colour.' },
    errors: [404],
  },
  {
    method: 'get',
    path: '/templates',
    tag: 'Reference data',
    summary: 'List the board templates',
    description: 'Oldest first. A template is the mould whose columns are copied onto a new board.',
    success: { status: 200, model: 'TemplateListResponse', description: 'Every template.' },
    errors: [],
  },

  // Dashboard
  {
    method: 'get',
    path: '/dashboard/stats',
    tag: 'Dashboard',
    summary: 'Totals over the boards the caller can open',
    description: 'Counted by the same rule as the board list, so the numbers always agree with it.',
    success: { status: 200, model: 'DashboardStatsResponse', description: 'The four totals.' },
    errors: [],
  },

  // Users
  {
    method: 'get',
    path: '/users/search',
    tag: 'Users',
    summary: 'Search for people',
    description: 'At most 10 results, never including the caller.',
    request: { query: searchUsersQuerySchema },
    success: { status: 200, model: 'UserListResponse', description: 'Matching people.' },
    errors: [],
  },
  {
    method: 'get',
    path: '/users/board-members',
    tag: 'Users',
    summary: 'List the members of a board',
    description: 'The board id travels in the query string. A missing or malformed id is a 400 before any board is looked up.',
    access: 'Board member.',
    request: { query: boardMembersQuerySchema },
    success: { status: 200, model: 'UserListResponse', description: 'The members of the board.' },
    errors: [400, 403, 404],
  },
  {
    method: 'get',
    path: '/users/{id}',
    tag: 'Users',
    summary: 'Read a person',
    request: { params: userIdParam },
    success: { status: 200, model: 'UserResponse', description: 'The person.' },
    errors: [404],
  },
  {
    method: 'put',
    path: '/users/{id}',
    tag: 'Users',
    summary: 'Update a profile',
    description: 'Only the caller\'s own profile can be updated. The password has its own route.',
    access: 'The person themself.',
    request: { params: userIdParam },
    body: 'UpdateUserRequest',
    success: { status: 200, model: 'UserResponse', description: 'The updated person.' },
    errors: [403, 404],
  },
  {
    method: 'post',
    path: '/users/{id}/avatar',
    tag: 'Users',
    summary: 'Upload a profile picture',
    description: 'A multipart form with one file field named avatar: png, jpeg, webp or gif, up to 6 MB. The bytes are checked against the declared type and a mismatch is rejected. A refused upload is a 400 and never a 500: INVALID_FILE_TYPE for a declared type that is not an image, FILE_TOO_LARGE for a file over the limit, VALIDATION_ERROR for a content mismatch.',
    access: 'The person themself.',
    request: { params: userIdParam },
    bodyKind: 'multipart',
    success: { status: 200, model: 'AvatarResponse', description: 'The URL of the stored picture.' },
    errors: [400, 403, 404],
  },

  // Workspaces
  {
    method: 'get',
    path: '/workspaces',
    tag: 'Workspaces',
    summary: 'List the caller\'s workspaces',
    description: 'The personal workspace first, then the rest by name.',
    success: { status: 200, model: 'WorkspaceListResponse', description: 'The workspaces the caller belongs to.' },
    errors: [],
  },
  {
    method: 'post',
    path: '/workspaces',
    tag: 'Workspaces',
    summary: 'Create a workspace',
    description: 'The caller becomes its admin.',
    body: 'CreateWorkspaceRequest',
    success: { status: 201, model: 'WorkspaceResponse', description: 'The new workspace.' },
    errors: [],
  },
  {
    method: 'get',
    path: '/workspaces/{id}',
    tag: 'Workspaces',
    summary: 'Read a workspace',
    description: 'A workspace that does not exist and one the caller is not in answer the same 403, so the route cannot be used to ask whether an id is real.',
    access: 'Workspace member.',
    request: { params: workspaceIdParam },
    success: { status: 200, model: 'WorkspaceResponse', description: 'The workspace with its members populated.' },
    errors: [403],
  },
  {
    method: 'patch',
    path: '/workspaces/{id}/members',
    tag: 'Workspaces',
    summary: 'Add members to a workspace',
    description: 'Adding somebody who is already a member leaves their role alone.',
    access: 'Workspace admin.',
    request: { params: workspaceIdParam },
    body: 'AddWorkspaceMembersRequest',
    success: { status: 200, model: 'WorkspaceResponse', description: 'The workspace with its members populated.' },
    errors: [403],
  },

  // Health
  {
    method: 'get',
    path: '/health',
    tag: 'Operations',
    summary: 'Is the API able to serve requests',
    description: 'Public. Answers 200 only when the database connection is up and answers a ping within 2 seconds, and 503 otherwise, with a body that names nothing about the deployment. Also served at /api/health, which the production image\'s healthcheck calls.',
    public: true,
    success: { status: 200, model: 'HealthResponse', description: 'The API and its database are up.' },
    errors: [503],
  },
];
