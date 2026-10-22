import { useState } from 'react';
import type { Board, User } from '@/models';
import { useToast } from '@/shared/hooks/useToast';
import { useAddBoardMembers } from '../queries';

export type AddMembersTarget = Pick<Board, '_id' | 'title'>;

/** What `AddMemberModal` takes, so a caller spreads it and owns nothing else. */
export interface AddMembersDialogProps {
  open: boolean;
  onClose: () => void;
  onAddMembers: (members: User[]) => void;
  boardTitle: string;
  boardId: string;
}

export interface UseAddMembersFlowResult {
  /** Opens the dialog on a board. */
  open: (board: AddMembersTarget) => void;
  dialogProps: AddMembersDialogProps;
}

/**
 * The one way people are added to a board, from the Home tile's menu and from
 * the board page's: which board the dialog is open on, the write, and what is
 * said when the write fails.
 *
 * The dialog closes as soon as the choice is confirmed, so a failure cannot be
 * said inside it. It is a toast instead, which outlives the dialog and does
 * not take the page it was raised from away.
 */
export const useAddMembersFlow = (): UseAddMembersFlowResult => {
  const [target, setTarget] = useState<AddMembersTarget | null>(null);
  const addMembers = useAddBoardMembers();
  const toast = useToast();

  const add = (members: User[]) => {
    if (!target || members.length === 0) return;

    addMembers.mutate(
      { boardId: target._id, memberIds: members.map(member => member._id) },
      {
        onError: error => {
          console.error('Error adding members:', error);
          toast.show({ message: 'The members could not be added. Nothing was changed, so you can try again.' });
        },
      },
    );
  };

  return {
    open: setTarget,
    dialogProps: {
      open: target !== null,
      onClose: () => setTarget(null),
      onAddMembers: add,
      boardTitle: target?.title ?? '',
      boardId: target?._id ?? '',
    },
  };
};

export default useAddMembersFlow;
