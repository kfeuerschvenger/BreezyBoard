import * as workspaceService from '../services/workspace.service.js';
import responseHandler from '../utils/responseHandler.js';

export const getUserWorkspaces = async (req, res, next) => {
  try {
    const workspaces = await workspaceService.getUserWorkspaces(req.user.id);
    responseHandler(res, 200, workspaces);
  } catch (error) {
    next(error);
  }
};

export const getWorkspace = async (req, res, next) => {
  try {
    const workspace = await workspaceService.getWorkspaceById(req.params.id);
    responseHandler(res, 200, workspace);
  } catch (error) {
    next(error);
  }
};

export const createWorkspace = async (req, res, next) => {
  try {
    const workspace = await workspaceService.createWorkspace(req.body, req.user.id);
    responseHandler(res, 201, workspace);
  } catch (error) {
    next(error);
  }
};

export const addWorkspaceMembers = async (req, res, next) => {
  try {
    const workspace = await workspaceService.addWorkspaceMembers(req.params.id, req.body.members);
    responseHandler(res, 200, workspace);
  } catch (error) {
    next(error);
  }
};
