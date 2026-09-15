import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Board as BoardModel, Task } from '@/models';
import { BoardService, TaskService } from '@/services';
import type { TaskNeighbours } from '@/services/task.service';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import Column from '../components/Column';
import PageHeader from '../components/PageHeader';
import TaskCard from '../components/TaskCard';
import TaskDrawer from '../components/TaskDrawer';
import UserAvatar from '../components/UserAvatar';

interface ColumnData {
  _id: string;
  id: string;
  title: string;
  color: string;
  order: number;
}

const byOrder = (a: Task, b: Task) => a.order.localeCompare(b.order);

/**
 * The target column as it will read once the drag is released, plus where in
 * it the dragged card ended up.
 *
 * Returns null when the drop changes nothing, so the caller can skip the
 * request entirely rather than ask the server to move a card onto itself.
 */
const arrangeColumn = (
  tasks: Task[],
  active: Task,
  targetColumnId: string,
  overTask: Task | undefined
): { column: Task[]; position: number } | null => {
  const current = tasks.filter(task => task.status === targetColumnId).sort(byOrder);

  if (active.status === targetColumnId) {
    const from = current.findIndex(task => task._id === active._id);
    const to = overTask ? current.findIndex(task => task._id === overTask._id) : current.length - 1;

    if (from === -1 || to === -1 || from === to) {
      return null;
    }

    const column = arrayMove(current, from, to);
    return { column, position: to };
  }

  // Coming from another column: land where the card being hovered sits and
  // push it down, or at the bottom when the drop was on the column itself.
  const overIndex = overTask ? current.findIndex(task => task._id === overTask._id) : -1;
  const position = overIndex === -1 ? current.length : overIndex;
  const column = [...current];

  column.splice(position, 0, { ...active, status: targetColumnId });

  return { column, position };
};

const Board = () => {
  const navigate = useNavigate();
  const { boardId } = useParams<{ boardId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentBoard, setCurrentBoard] = useState<BoardModel | null>(null);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    // Without this guard the page keeps the initial isLoading value and spins forever.
    if (!boardId) {
      setIsLoading(false);
      setError('No board was specified in the address.');
      return;
    }

    const fetchBoardData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current board
        const boardData = await BoardService.getById(boardId);
        setCurrentBoard(boardData);

        // Get board tasks and sort by order
        const tasksData = await TaskService.getByBoard(boardId);
        setTasks([...tasksData].sort(byOrder));

        // The board's own columns, not its template's. They were copied out
        // of the template when the board was created and belong to it since,
        // which is what lets one board rename a column without renaming it
        // on every other board built from the same template.
        const formattedColumns = (boardData.columns ?? [])
          .map(column => ({
            id: column._id,
            _id: column._id,
            title: column.title,
            color: typeof column.color === 'string' ? column.color : (column.color?.value ?? '#64748B'),
            order: column.order,
          }))
          .sort((a, b) => a.order - b.order);

        setColumns(formattedColumns);
      } catch (err) {
        console.error('Error loading board data:', err);
        setError('This board could not be loaded. Check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBoardData();
  }, [boardId]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveTask(tasks.find(task => task._id === active.id) || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over } = event;

    // If dropping outside any container or no active task
    if (!over || !activeTask) {
      setActiveTask(null);
      return;
    }

    // Check if we're dropping on a column or a task
    const isOverColumn = columns.some(col => col.id === over.id);
    const overTask = tasks.find(task => task._id === over.id);

    // Determine the target column ID
    let targetColumnId: string;
    if (isOverColumn) {
      targetColumnId = over.id as string;
    } else if (overTask) {
      targetColumnId = overTask.status;
    } else {
      setActiveTask(null);
      return;
    }

    // Build the column exactly as it will look after the drop, then read the
    // dropped card's neighbours out of it. One arrangement drives both the
    // optimistic render and the request, so the two cannot disagree.
    //
    // This is also what fixes the cross-column drop. The previous version
    // computed one past the maximum order of the target column, so a card
    // dropped halfway down another column always landed at the bottom of it,
    // wherever it was released.
    const arranged = arrangeColumn(tasks, activeTask, targetColumnId, overTask);

    if (!arranged) {
      setActiveTask(null);
      return;
    }

    const { column, position } = arranged;
    const previous = tasks;

    setTasks(prev => [...prev.filter(task => task.status !== targetColumnId && task._id !== activeTask._id), ...column]);

    try {
      const moved = await TaskService.move(activeTask._id, targetColumnId, {
        afterId: position > 0 ? column[position - 1]._id : null,
        beforeId: position < column.length - 1 ? column[position + 1]._id : null,
      });

      // The server owns the ordering key, so the card is replaced with what
      // it actually wrote rather than left holding the placeholder used for
      // the optimistic render.
      setTasks(prev => prev.map(task => (task._id === moved._id ? moved : task)));
    } catch (error) {
      setTasks(previous);
      console.error('Error moving task:', error);
    }

    setActiveTask(null);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  const handleTaskSave = async (taskData: Partial<Task>) => {
    if (!boardId) {
      console.error('No boardId available for creating task.');
      return;
    }

    try {
      let result: Task;

      if (taskData._id) {
        result = await TaskService.update(taskData._id, taskData);
      } else {
        result = await TaskService.create(boardId, taskData);
      }

      setTasks(prev => {
        if (taskData._id) {
          return prev.map(t => (t._id === taskData._id ? result : t));
        } else {
          return [...prev, result];
        }
      });

      // Only move to done if there are checklist items AND all are completed
      const hasChecklist = result.checklist && result.checklist.length > 0;
      const allCompleted = hasChecklist && result.checklist.every(item => item.completed);

      if (hasChecklist && allCompleted && columns.length > 0) {
        // status holds a column id, so comparing it to the literal 'done' never matches.
        // Resolve the last column and compare against its id instead.
        const doneColumn = columns.reduce((max, col) => (col.order > max.order ? col : max), columns[0]);

        if (doneColumn && result.status !== doneColumn.id) {
          // Completing a checklist sends the task to the bottom of the last
          // column, which is the only neighbour that needs naming.
          const doneTasks = tasks.filter(task => task.status === doneColumn.id).sort(byOrder);
          await handleTaskMove(result._id, doneColumn.id, {
            afterId: doneTasks.length > 0 ? doneTasks[doneTasks.length - 1]._id : null,
          });
        }
      }

      setDrawerOpen(false);
    } catch (error) {
      console.error('Error saving task:', error);
    }
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
      setTasks(prev => prev.map(task => (task._id === taskId ? moved : task)));
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
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
