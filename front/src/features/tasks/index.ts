// The public surface of the tasks feature. Another feature reaches this one
// through this file and never into its internals, which is what the
// dependency direction rule in the lint config enforces.
export { Checklist } from './components/Checklist';
export type { ChecklistItemData, ChecklistProps } from './components/Checklist';
export { PrioritySelect } from './components/PrioritySelect';
export type { PrioritySelectProps, TaskPriority } from './components/PrioritySelect';
export { default as TaskDrawer } from './components/TaskDrawer';
export type { TaskDrawerProps } from './components/TaskDrawer';
export { TaskForm } from './components/TaskForm';
export type { TaskFormProps } from './components/TaskForm';
export { useTaskForm, resolveColorId } from './hooks/useTaskForm';
export type {
  TaskColorOption,
  TaskFormValues,
  TaskFormErrors,
  UseTaskFormOptions,
  UseTaskFormResult,
} from './hooks/useTaskForm';
export { BoardColumns } from './components/BoardColumns';
export type { BoardColumnsProps } from './components/BoardColumns';
export { useBoardData } from './hooks/useBoardData';
export type { ColumnData, UseBoardDataResult } from './hooks/useBoardData';
export { useTaskDragAndDrop } from './hooks/useTaskDragAndDrop';
export type { TaskCache, UseTaskDragAndDropOptions, UseTaskDragAndDropResult } from './hooks/useTaskDragAndDrop';
export { useTaskDrawer } from './hooks/useTaskDrawer';
export type { UseTaskDrawerOptions, UseTaskDrawerResult } from './hooks/useTaskDrawer';
