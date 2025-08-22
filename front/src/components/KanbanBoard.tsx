import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Board, Task } from '@/models';
import { BoardService, TaskService } from '@/services';
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
import Column from './Column';
import PageHeader from './PageHeader';
import TaskCard from './TaskCard';
import TaskDrawer from './TaskDrawer';
import UserAvatar from './UserAvatar';

interface ColumnData {
  _id: string;
  id: string;
  title: string;
  color: string;
  order: number;
}

const KanbanBoard = () => {
  const navigate = useNavigate();
  const { boardId } = useParams<{ boardId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!boardId) return;

    const fetchBoardData = async () => {
      try {
        setIsLoading(true);

        // Get current board
        const boardData = await BoardService.getById(boardId);
        setCurrentBoard(boardData);

        // Get board tasks and sort by order
        const tasksData = await TaskService.getByBoard(boardId);
        const sortedTasks = tasksData.sort((a, b) => a.order - b.order);
        setTasks(sortedTasks);

        // Prepare columns from board template
        if (boardData.template && typeof boardData.template !== 'string' && boardData.template.columns) {
          const formattedColumns = boardData.template.columns.map((col: any) => ({
            id: col._id,
            _id: col._id,
            title: col.title,
            color: col.color?.value || '#64748B',
            order: col.order,
          }));
          setColumns(formattedColumns);
        }
      } catch (error) {
        console.error('Error loading board data:', error);
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
    const { active, over } = event;

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

    // If moving to a different column
    if (activeTask.status !== targetColumnId) {
      const originalStatus = activeTask.status;

      // Get tasks in target column to determine new order
      const targetColumnTasks = tasks.filter(task => task.status === targetColumnId);
      const newOrder = targetColumnTasks.length > 0 ? Math.max(...targetColumnTasks.map(t => t.order)) + 1 : 0;

      // Optimistic UI update
      setTasks(prev =>
        prev.map(task => (task._id === activeTask._id ? { ...task, status: targetColumnId, order: newOrder } : task))
      );

      try {
        await TaskService.move(activeTask._id, targetColumnId, newOrder);
      } catch (error) {
        // Revert on error
        setTasks(prev =>
          prev.map(task =>
            task._id === activeTask._id ? { ...task, status: originalStatus, order: activeTask.order } : task
          )
        );
        console.error('Error moving task:', error);
      }
    }
    // If reordering within the same column
    else if (overTask && activeTask._id !== overTask._id) {
      // Get all tasks in the current column
      const columnTasks = tasks.filter(task => task.status === targetColumnId).sort((a, b) => a.order - b.order);

      // Find indices
      const oldIndex = columnTasks.findIndex(task => task._id === activeTask._id);
      const newIndex = columnTasks.findIndex(task => task._id === overTask._id);

      if (oldIndex !== newIndex) {
        // Reorder tasks
        const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex);

        // Update orders
        const updatedTasks = reorderedTasks.map((task, index) => ({
          ...task,
          order: index,
        }));

        // Update state with reordered tasks
        setTasks(prev => {
          const otherTasks = prev.filter(task => task.status !== targetColumnId);
          return [...otherTasks, ...updatedTasks];
        });

        try {
          // Update orders in backend
          await TaskService.updateOrders(
            boardId!,
            updatedTasks.map(task => ({ id: task._id, order: task.order }))
          );
        } catch (error) {
          // Revert on error
          const tasksData = await TaskService.getByBoard(boardId!);
          const sortedTasks = tasksData.sort((a, b) => a.order - b.order);
          setTasks(sortedTasks);
          console.error('Error updating task orders:', error);
        }
      }
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

      if (hasChecklist && allCompleted && result.status !== 'done') {
        // Find column with highest order (last column)
        const doneColumn = columns.reduce((max, col) => (col.order > max.order ? col : max), columns[0]);

        if (doneColumn) {
          await handleTaskMove(result._id, doneColumn.id);
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

  const handleTaskMove = async (taskId: string, newStatus: string) => {
    try {
      await TaskService.move(taskId, newStatus);
      setTasks(prev => prev.map(task => (task._id === taskId ? { ...task, status: newStatus } : task)));
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

export default KanbanBoard;
