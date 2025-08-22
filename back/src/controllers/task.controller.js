import * as taskService from '../services/task.service.js';
import responseHandler from '../utils/responseHandler.js';

export const createTask = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (req.params?.boardId) {
      payload.boardId = req.params.boardId;
    }
    const task = await taskService.createTask(payload);
    responseHandler(res, 201, task);
  } catch (error) {
    next(error);
  }
};

export const getTask = async (req, res, next) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    responseHandler(res, 200, task);
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req, res, next) => {
  try {
    const task = await taskService.updateTask(req.params.id, req.body);
    responseHandler(res, 200, task);
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req, res, next) => {
  try {
    await taskService.deleteTask(req.params.id);
    responseHandler(res, 200, { message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const moveTask = async (req, res, next) => {
  try {
    const { status, order } = req.body;
    const task = await taskService.moveTask(req.params.id, status, order);
    responseHandler(res, 200, task);
  } catch (error) {
    next(error);
  }
};

export const updateOrders = async (req, res, next) => {
  try {
    const { updates } = req.body;
    await taskService.updateOrders(updates);
    responseHandler(res, 200, { message: 'Orders updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const getBoardTasks = async (req, res, next) => {
  try {
    const tasks = await taskService.getTasksByBoard(req.params.boardId);
    responseHandler(res, 200, tasks);
  } catch (error) {
    next(error);
  }
};

export const updateChecklistItem = async (req, res, next) => {
  try {
    const { taskId, itemId } = req.params;
    const task = await taskService.updateChecklistItem(taskId, itemId, req.body);
    responseHandler(res, 200, task);
  } catch (error) {
    next(error);
  }
};

export const deleteChecklistItem = async (req, res, next) => {
  try {
    const { taskId, itemId } = req.params;
    const task = await taskService.deleteChecklistItem(taskId, itemId);
    responseHandler(res, 200, task);
  } catch (error) {
    next(error);
  }
};
