// The public surface of the boards feature. Another feature reaches this one
// through this file and never into its internals, which is what the
// dependency direction rule in the lint config enforces.
export {
  boardKeys,
  useBoard,
  useUpdateBoard,
  useBoards,
  useDashboardStats,
  useCreateBoard,
  useDeleteBoard,
  useAddBoardMembers,
  useTemplates,
} from './queries';
export { BoardCard } from './components/BoardCard';
export type { BoardCardProps } from './components/BoardCard';
export { BoardCardMenu } from './components/BoardCardMenu';
export type { BoardCardMenuProps } from './components/BoardCardMenu';
export { BoardActions } from './components/BoardActions';
export type { BoardActionsProps } from './components/BoardActions';
export { default as CreateBoardModal } from './components/CreateBoardModal';
export { EditBoardModal } from './components/EditBoardModal';
export type { EditBoardModalProps } from './components/EditBoardModal';
export { BoardFormFields } from './components/BoardFormFields';
export { boardFieldsSchema } from './boardForm';
export type { BoardFieldValues } from './boardForm';
export type { BoardFormData } from './components/CreateBoardModal';
export { TemplatePicker } from './components/TemplatePicker';
export type { TemplatePickerProps } from './components/TemplatePicker';
export { BoardStats } from './components/BoardStats';
export type { BoardStatsProps } from './components/BoardStats';
export { useBoardDashboard } from './hooks/useBoardDashboard';
export type { NewBoard, UseBoardDashboardResult } from './hooks/useBoardDashboard';
export { useBoardMenu } from './hooks/useBoardMenu';
export type { UseBoardMenuResult } from './hooks/useBoardMenu';
