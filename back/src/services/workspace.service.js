import Workspace from '../models/Workspace.js';
import ApiError from '../utils/apiError.js';

export const getUserWorkspaces = async userId => {
  const workspaces = await Workspace.find({ 'members.user': userId })
    .populate('members.user', 'firstName lastName email avatar')
    .sort({ isPersonal: -1, name: 1 });

  return workspaces;
};

export const getWorkspaceById = async id => {
  const workspace = await Workspace.findById(id).populate('members.user', 'firstName lastName email avatar');

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  return workspace;
};

// The creator is always an admin of what they create, and `isPersonal` is
// never accepted from a client: the one personal workspace an account has is
// the one registration made for it, and a second would give the fallback in
// createBoard two candidates to choose between.
export const createWorkspace = async (workspaceData, userId) => {
  const workspace = await Workspace.create({
    name: workspaceData.name,
    createdBy: userId,
    members: [{ user: userId, role: 'admin' }],
    isPersonal: false,
  });

  await workspace.populate('members.user', 'firstName lastName email avatar');

  return workspace;
};

// Adding somebody who is already a member leaves their existing role alone
// rather than resetting it, so re-inviting an admin does not quietly demote
// them.
export const addWorkspaceMembers = async (workspaceId, members) => {
  const workspace = await Workspace.findById(workspaceId);

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const existing = new Set(workspace.members.map(member => member.user.toString()));

  for (const { user, role } of members) {
    if (!existing.has(user.toString())) {
      workspace.members.push({ user, role: role ?? 'member' });
      existing.add(user.toString());
    }
  }

  await workspace.save();
  await workspace.populate('members.user', 'firstName lastName email avatar');

  return workspace;
};

/**
 * Add users to a workspace as plain members if they are not in it already.
 *
 * Called when somebody is added to a board, because board membership is
 * worthless without it: `resolveBoardRole` returns no role at all for a
 * person outside the workspace, so they would sit in `Board.members` and
 * still be refused, which reads as a bug rather than a policy.
 *
 * The consequence is deliberate and worth stating plainly: a board owner who
 * is only a plain member of the workspace can pull somebody into that
 * workspace by adding them to a board. For a small team that is the humane
 * behaviour and it preserves how the product already works. When workspace
 * management gets a real interface, this is the first thing to revisit,
 * because the alternative is to refuse and tell the inviter to add the
 * person to the workspace first.
 *
 * @param {string} workspaceId
 * @param {string[]} userIds
 * @param {object} [options]
 * @param {import('mongoose').ClientSession} [options.session]
 * @returns {Promise<void>}
 */
export const ensureWorkspaceMembership = async (workspaceId, userIds, { session } = {}) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return;
  }

  const query = Workspace.findById(workspaceId);

  if (session) {
    query.session(session);
  }

  const workspace = await query;

  if (!workspace) {
    throw new ApiError(404, 'Workspace not found');
  }

  const existing = new Set(workspace.members.map(member => member.user.toString()));
  const missing = userIds.map(String).filter(id => !existing.has(id));

  if (missing.length === 0) {
    return;
  }

  workspace.members.push(...missing.map(user => ({ user, role: 'member' })));

  await workspace.save({ session });
};
