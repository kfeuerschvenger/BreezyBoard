import type { User as UserModel } from '@/models';
import { useBoardMembers } from '@/features/users';
import { useColors } from '@/features/colors';
import { useTaskForm } from './useTaskForm';
import type { StoredTask, TaskColorOption, UseTaskFormResult } from './useTaskForm';

export interface UseTaskModalOptions {
  open: boolean;
  /** Null while the modal has never been opened. */
  task: StoredTask | null;
  onSave: (task: StoredTask) => Promise<void>;
  /** Called after a save the server accepted, so the caller can close. */
  onSaved: () => void;
}

export interface UseTaskModalResult extends UseTaskFormResult {
  colors: TaskColorOption[];
  members: UserModel[];
  isLoadingColors: boolean;
}

// Stable identities for the two lists while their requests are in flight or
// have failed. `useTaskForm` keys two effects on the colours, so a fresh
// literal would give every render a new one and re-run both.
const NO_COLORS: TaskColorOption[] = [];
const NO_MEMBERS: UserModel[] = [];

/**
 * Everything the task modal needs, in one call: the two reference lists it
 * reads and the form state machine they feed.
 *
 * It exists so the modal itself is composition and nothing else. The lint
 * rule that keeps components off the network is the same argument one level
 * up: which lists the form needs, and how they are keyed, is a question about
 * the feature rather than about the markup.
 */
export function useTaskModal({ open, task, onSave, onSaved }: UseTaskModalOptions): UseTaskModalResult {
  const { data: colors = NO_COLORS, isPending: isLoadingColors } = useColors('task');
  const { data: members = NO_MEMBERS } = useBoardMembers(task?.boardId);

  const form = useTaskForm({ open, task, colors, onSave, onSaved });

  return { ...form, colors, members, isLoadingColors };
}

export default useTaskModal;
