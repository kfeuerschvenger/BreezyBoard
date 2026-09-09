import Task from '../models/Task.js';
import Board from '../models/Board.js';
import ApiError from '../utils/apiError.js';

export const createTask = async taskData => {
  if (!taskData.boardId) {
    throw new ApiError(400, 'boardId is required to create a task');
  }
  if (taskData.owner) {
    const board = await Board.findById(taskData.boardId).populate('members');
    if (!board) {
      throw new ApiError(404, 'Board not found');
    }
    const memberIds = [String(board.createdBy), ...board.members.map(m => String(m._id))];
    if (!memberIds.includes(String(taskData.owner))) {
      throw new ApiError(400, 'Owner must be a member of the board');
    }
  }
  const task = await Task.create(taskData);

  await task.populate([
    { path: 'owner', select: 'firstName lastName avatar' },
    { path: 'color', select: 'name value' },
  ]);

  return task;
};

export const getTaskById = async id => {
  const task = await Task.findById(id).populate('owner', 'firstName lastName avatar').populate('color', 'name value');
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }
  return task;
};

export const updateTask = async (id, updateData) => {
  const task = await Task.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value');

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

export const deleteTask = async id => {
  const task = await Task.findByIdAndDelete(id);
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }
  return task;
};

export const moveTask = async (taskId, newStatus, newOrder) => {
  const task = await Task.findByIdAndUpdate(taskId, { status: newStatus, order: newOrder }, { new: true })
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value');

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  return task;
};

export const updateOrders = async (boardId, updates) => {
  if (!Array.isArray(updates) || updates.length === 0) {
    return;
  }

  // Only tasks that actually belong to the authorized board (from the URL)
  // may be renumbered. A task id in the body that belongs to a different
  // board is silently skipped rather than written: the caller is already
  // authorized against boardId by the route middleware, so this is a data
  // scoping guard, not a second authorization boundary.
  const requestedIds = updates.map(update => update.id);
  const scopedTasks = await Task.find({ _id: { $in: requestedIds }, boardId }).select('_id');
  const scopedIds = new Set(scopedTasks.map(task => task._id.toString()));

  const bulkOps = updates
    .filter(update => scopedIds.has(update.id.toString()))
    .map(update => ({
      updateOne: {
        filter: { _id: update.id, boardId },
        update: { order: update.order },
      },
    }));

  if (bulkOps.length > 0) {
    await Task.bulkWrite(bulkOps);
  }
};

export const getTasksByBoard = async boardId => {
  const tasks = await Task.find({ boardId })
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value')
    .sort({ createdAt: -1 });
  return tasks;
};

export const updateChecklistItem = async (taskId, itemId, updateData) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  const itemIndex = task.checklist.findIndex(item => item._id.toString() === itemId);
  if (itemIndex === -1) {
    throw new ApiError(404, 'Checklist item not found');
  }

  // Update the item
  task.checklist[itemIndex] = {
    ...task.checklist[itemIndex].toObject(),
    ...updateData,
  };

  await task.save();
  return task;
};

export const deleteChecklistItem = async (taskId, itemId) => {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  task.checklist = task.checklist.filter(item => item._id.toString() !== itemId);
  await task.save();
  return task;
};
