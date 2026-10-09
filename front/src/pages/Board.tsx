import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Task } from '@/models';
import { TaskService } from '@/services';
import type { TaskNeighbours } from '@/services/task.service';
import { byOrder } from '@/features/board';
import { BoardActions } from '@/features/boards';
import { BoardColumns, TaskDrawer, useBoardData, useTaskDragAndDrop } from '@/features/tasks';
import { motion } from 'motion/react';
import { IconPlus } from '@tabler/icons-react';
import { Button, LoadingScreen, Icon } from '@/shared/ui';
import { ShellAction } from '@/app/layouts/shell/ShellAction';
import NotFound from './NotFound';
import PageHeader from '../components/PageHeader';

const Board = () => {
  const navigate = useNavigate();
  const { boardId } = useParams<{ boardId: string }>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Partial<Task> | null>(null);

  const { board, columns, tasks, taskColors, cache, isLoading, error, notFound } = useBoardData(boardId);

  const drag = useTaskDragAndDrop({
    tasks,
    columns,
    cache,
  });

  const openTask = (task: Partial<Task>) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  const openNewTask = () => {
    if (!boardId || columns.length === 0) return;
    const [firstColumn] = columns;

    openTask({
      title: 'New Task',
      description: '',
      status: firstColumn.id,
      priority: 'medium',
      color: firstColumn.color,
      owner: '',
      boardId,
      checklist: [],
    });
  };

  const moveTask = async (taskId: string, newStatus: string, between: TaskNeighbours = {}) => {
    try {
      cache.replace(await TaskService.move(taskId, newStatus, between));
    } catch (error) {
      console.error('Error moving task:', error);
    }
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
  const saveTask = async (taskData: Partial<Task>) => {
    if (!boardId) throw new Error('No board was specified in the address.');

    const result = taskData._id
      ? await TaskService.update(taskData._id, taskData)
      : await TaskService.create(boardId, taskData);

    if (taskData._id) {
      cache.replace(result);
    } else {
      cache.write([...(cache.read() ?? []), result]);
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
    await moveTask(result._id, doneColumn.id, {
      afterId: doneTasks.length > 0 ? doneTasks[doneTasks.length - 1]._id : null,
    });
  };

  if (isLoading) return <LoadingScreen label="Loading this board" fill="parent" />;

  // Ahead of the generic failure: a board that is missing, deleted or not the
  // caller's answers the same on every attempt, so "Try again" would only
  // repeat the answer.
  if (notFound) {
    return (
      <NotFound
        title="Board not found"
        description="This board does not exist, was deleted, or you do not have access to it."
      />
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div role="alert" className="max-w-md rounded-panel border border-line-08 bg-surface p-8 text-center shadow-card">
          <p className="mb-2 font-medium text-ink">This board could not be loaded</p>
          <p className="mb-6 text-sm text-ink-secondary">{error}</p>
          <div className="flex justify-center gap-3">
            <Button type="button" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/')}>
              Back to boards
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // Fills the frame the app gives the board page, which is pinned to the
    // viewport: the header takes what it needs and the columns take the rest,
    // so the only things that scroll are the column row sideways and each
    // column body down.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={board ? board.title : 'Project Board'}
        subtitle="Manage tasks in this board"
        showBackButton
        onBack={() => navigate('/')}
      >
        {board && <BoardActions board={board} onDeleted={() => navigate('/')} />}
      </PageHeader>

      <ShellAction>
        <Button
          type="button"
          size="sm"
          onClick={openNewTask}
          disabled={columns.length === 0}
          leftIcon={<Icon as={IconPlus} size={18} />}
        >
          Add Task
        </Button>
      </ShellAction>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-0 flex-1 flex-col pt-6"
      >
        <BoardColumns
          columns={columns}
          tasks={tasks}
          drag={drag}
          taskColors={taskColors}
          onTaskClick={openTask}
          onAddTask={openNewTask}
        />

        <TaskDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} task={selectedTask} onSave={saveTask} />
      </motion.div>
    </div>
  );
};

export default Board;
