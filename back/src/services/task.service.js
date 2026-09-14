import Task from '../models/Task.js';
import Board from '../models/Board.js';
import ApiError from '../utils/apiError.js';

// The columns a task on this board may legally sit in. They live on the
// BoardTemplate the board was created from, one collection away, which is
// why this cannot be a schema enum.
const loadColumnIds = async boardId => {
  const board = await Board.findById(boardId).select('template').populate('template', 'columns');

  if (!board) {
    throw new ApiError(404, 'Board not found');
  }

  return (board.template?.columns ?? []).map(column => column._id.toString());
};

// A well-formed id that belongs to a different board is still wrong, and it
// is the failure with real consequences: the task disappears from the board
// it was filed under while continuing to count in its totals. The shape check
// on the model catches the careless case, this catches the plausible one.
const assertStatusNamesAColumnOfThisBoard = async (boardId, status) => {
  const columnIds = await loadColumnIds(boardId);

  if (columnIds.length === 0) {
    throw new ApiError(
      400,
      'This board has no columns, because it was created without a template. A task cannot be given a status on it.'
    );
  }

  if (!columnIds.includes(String(status))) {
    throw new ApiError(400, 'status must be the id of a column belonging to this board');
  }
};

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

  await assertStatusNamesAColumnOfThisBoard(taskData.boardId, taskData.status);

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
  // Only pay for the lookup when the caller is actually changing the column.
  if (updateData.status !== undefined) {
    const existing = await Task.findById(id).select('boardId');

    if (!existing) {
      throw new ApiError(404, 'Task not found');
    }

    await assertStatusNamesAColumnOfThisBoard(existing.boardId, updateData.status);
  }

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
  const existing = await Task.findById(taskId).select('boardId');

  if (!existing) {
    throw new ApiError(404, 'Task not found');
  }

  await assertStatusNamesAColumnOfThisBoard(existing.boardId, newStatus);

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

// Pagination is opt-in: `limit` undefined means "return everything", exactly
// as before this parameter existed. `pagination` is always returned
// alongside the tasks so a client can discover `total` either way; only
// whether `tasks` itself is truncated depends on `limit` being present.
export const getTasksByBoard = async (boardId, { limit, offset } = {}) => {
  const filter = { boardId };

  const total = await Task.countDocuments(filter);

  let query = Task.find(filter)
    .populate('owner', 'firstName lastName avatar')
    .populate('color', 'name value')
    .sort({ createdAt: -1 });

  const hasLimit = typeof limit === 'number';
  const safeOffset = typeof offset === 'number' ? offset : 0;

  if (hasLimit) {
    query = query.skip(safeOffset).limit(limit);
  }

  const tasks = await query;

  const pagination = hasLimit ? { total, limit, offset: safeOffset } : { total };

  return { tasks, pagination };
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
