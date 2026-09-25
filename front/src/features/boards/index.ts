// The public surface of the boards feature. Another feature reaches this one
// through this file and never into its internals, which is what the
// dependency direction rule in the lint config enforces.
export {
  boardKeys,
  useBoards,
  useDashboardStats,
  useCreateBoard,
  useDeleteBoard,
  useAddBoardMembers,
} from './queries';
export { BOARD_COLOR_FALLBACK, resolveBoardColor, toColorLookup } from './boardColor';
export type { ColorLookup } from './boardColor';
export { BoardStats } from './components/BoardStats';
export type { BoardStatsProps } from './components/BoardStats';
