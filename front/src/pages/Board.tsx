import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Task } from '@/models';
import { TaskService } from '@/services';
import type { TaskNeighbours } from '@/services/task.service';
import { byOrder } from '@/features/board';
import { useBoard, useBoardTasks, useTaskCacheWriter } from '@/features/tasks/queries';
import { closestCorners, DndContext, DragOverlay } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import Column from '../components/Column';
import PageHeader from '../components/PageHeader';
import TaskCard from '../components/TaskCard';
import { TaskDrawer, useTaskDragAndDrop } from '@/features/tasks';
import UserAvatar from '../components/UserAvatar';

interface ColumnData {
  _id: string;
  id: string;
  title: string;
  color: string;
  order: number;
}

const Board = () => {
  const navigate = useNavigate();
  const { boardId } = useParams<{ boardId: string }>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const boardQuery = useBoard(boardId);
  const tasksQuery = useBoardTasks(boardId);
  const taskCache = useTaskCacheWriter(boardId);

  const currentBoard = boardQuery.data ?? null;
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const isLoading = Boolean(boardId) && (boardQuery.isPending || tasksQuery.isPending);
  const error = !boardId
    ? 'No board was specified in the address.'
    : boardQuery.isError || tasksQuery.isError
      ? 'This board could not be loaded. Check your connection and try again.'
      : null;

  // The board's own columns, not its template's. They were copied out of the
  // template when the board was created and belong to it since, which is
  // what lets one board rename a column without renaming it on every other
  // board built from the same template.
  const columns: ColumnData[] = useMemo(
    () =>
      (currentBoard?.columns ?? [])
        .map(column => ({
          id: column._id,
          _id: column._id,
          title: column.title,
          color: typeof column.color === 'string' ? column.color : (column.color?.value ?? '#64748B'),
          order: column.order,
        }))
        .sort((a, b) => a.order - b.order),
    [currentBoard]
  );

  const { activeTask, sensors, onDragStart, onDragEnd } = useTaskDragAndDrop({
    tasks,
    columnIds: columns.map(column => column.id),
    cache: taskCache,
  });

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  /**
   * Deliberately does not catch. The drawer reports a failed save and keeps
   * itself open holding the draft, and it can only do that if the failure
   * reaches it. A catch here returns normally, which tells the drawer the
   * save succeeded, so it clears the draft and closes over work that was
   * never written. That is finding P4-9.
   *
   * Closing on success is the drawer's job too, through onSaved.
   */
  const handleTaskSave = async (taskData: Partial<Task>) => {
    if (!boardId) throw new Error('No board was specified in the address.');

    const result = taskData._id
      ? await TaskService.update(taskData._id, taskData)
      : await TaskService.create(boardId, taskData);

    if (taskData._id) {
      taskCache.replace(result);
    } else {
      taskCache.write([...(taskCache.read() ?? []), result]);
    }

    // A task whose checklist is entirely done moves itself to the last
    // column. `status` holds a column id, so comparing it to the literal
    // 'done' never matched; the last column is resolved by order instead.
    const isChecklistComplete = Boolean(result.checklist?.length) && result.checklist.every(item => item.completed);
    if (!isChecklistComplete || columns.length === 0) return;

    const doneColumn = columns.reduce((last, column) => (column.order > last.order ? column : last), columns[0]);
    if (result.status === doneColumn.id) return;

    // Completing a checklist sends the task to the bottom of that column,
    // which is the only neighbour that needs naming. Its own failure is
    // reported and swallowed: the task was saved, and telling the person it
    // was not because a follow-up move failed would be a worse answer.
    const doneTasks = tasks.filter(task => task.status === doneColumn.id).sort(byOrder);
    await handleTaskMove(result._id, doneColumn.id, {
      afterId: doneTasks.length > 0 ? doneTasks[doneTasks.length - 1]._id : null,
    });
  };

  const handleAddTask = () => {
    if (!boardId || !columns.length) return;

    const defaultColumn = columns[0];

    const newTask: Partial<Task> = {
      title: 'New Task',
      description: '',
      status: defaultColumn.id,
      priority: 'medium',
      color: defaultColumn.color,
      owner: '',
      boardId,
      checklist: [],
    };

    setSelectedTask(newTask as Task);
    setDrawerOpen(true);
  };

  const handleTaskMove = async (taskId: string, newStatus: string, between: TaskNeighbours = {}) => {
    try {
      const moved = await TaskService.move(taskId, newStatus, between);
      taskCache.replace(moved);
    } catch (error) {
      console.error('Error moving task:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div role="alert" className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center max-w-md">
          <p className="text-gray-900 font-medium mb-2">This board could not be loaded</p>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 cursor-pointer"
            >
              Try again
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Back to boards
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={currentBoard ? currentBoard.title : 'Project Board'}
        subtitle="Manage tasks in this board"
        showBackButton
        onBack={() => navigate('/')}
      >
        <button
          onClick={handleAddTask}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl cursor-pointer"
          disabled={!columns.length}
        >
          <Plus size={20} />
          Add Task
        </button>
        <UserAvatar />
      </PageHeader>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto p-8">
        {columns.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {columns.map(column => (
                <Column
                  key={column.id}
                  column={column}
                  tasks={tasks.filter(task => task.status === column.id)}
                  onTaskClick={handleTaskClick}
                />
              ))}
            </div>

            <DragOverlay>{activeTask ? <TaskCard task={activeTask} isDragging /> : null}</DragOverlay>
          </DndContext>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg">No columns available for this board</div>
            <p className="text-gray-400 mt-2">This board template doesn't have any columns configured.</p>
          </div>
        )}

        <TaskDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          task={selectedTask}
          onSave={handleTaskSave}
        />
      </motion.div>
    </div>
  );
};

export default Board;
