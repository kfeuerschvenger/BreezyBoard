// The public surface of the tasks feature. Another feature reaches this one
// through this file and never into its internals, which is what the
// dependency direction rule in the lint config enforces.
export { Checklist } from './components/Checklist';
export type { ChecklistItemData, ChecklistProps } from './components/Checklist';
export { PrioritySelect } from './components/PrioritySelect';
export type { PrioritySelectProps } from './components/PrioritySelect';
export {
  asTaskPriority,
  PRIORITY_HUE,
  PRIORITY_LABELS,
  PRIORITY_SELECTED_CLASSES,
  TASK_PRIORITIES,
} from './priority';
export type { TaskPriority } from './priority';
export { default as TaskModal } from './components/TaskModal';
export type { TaskModalProps } from './components/TaskModal';
export { TaskForm } from './components/TaskForm';
export type { TaskFormProps } from './components/TaskForm';
export { useTaskForm, resolveColorId } from './hooks/useTaskForm';
export type {
  TaskColorOption,
  TaskFormValues,
  TaskFormErrors,
  StoredTask,
  UseTaskFormOptions,
  UseTaskFormResult,
} from './hooks/useTaskForm';
export { TaskMoveMenu } from './components/TaskMoveMenu';
export type { TaskMoveMenuProps } from './components/TaskMoveMenu';
export { useTaskMover } from './hooks/useTaskMover';
export type {
  FocusRequest,
  FocusTarget,
  MoveOutcome,
  MoveTarget,
  UseTaskMoverOptions,
  UseTaskMoverResult,
} from './hooks/useTaskMover';
export { CardComposer } from './components/CardComposer';
export type { CardComposerProps } from './components/CardComposer';
export { EmptyBoardHero } from './components/EmptyBoardHero';
export type { EmptyBoardHeroProps } from './components/EmptyBoardHero';
export { BoardColumns } from './components/BoardColumns';
export type { BoardColumnsProps } from './components/BoardColumns';
export { useBoardData } from './hooks/useBoardData';
export type { ColumnData, UseBoardDataResult } from './hooks/useBoardData';
export { useTaskDragAndDrop } from './hooks/useTaskDragAndDrop';
export type { TaskCache, UseTaskDragAndDropOptions, UseTaskDragAndDropResult } from './hooks/useTaskDragAndDrop';
export { useTaskModal } from './hooks/useTaskModal';
export type { UseTaskModalOptions, UseTaskModalResult } from './hooks/useTaskModal';
export { useLeavingCards } from './hooks/useLeavingCards';
export type { LeavingCard, UseLeavingCardsResult } from './hooks/useLeavingCards';
export { useDeleteTaskWithUndo } from './hooks/useDeleteTaskWithUndo';
export type {
  DeletionCache,
  RemovedTask,
  UseDeleteTaskWithUndoOptions,
  UseDeleteTaskWithUndoResult,
} from './hooks/useDeleteTaskWithUndo';
