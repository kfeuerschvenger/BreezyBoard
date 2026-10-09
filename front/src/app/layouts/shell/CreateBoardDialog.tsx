import { CreateBoardModal, useCreateBoard } from '@/features/boards';
import type { BoardFormData } from '@/features/boards';
import { useToast } from '@/shared/hooks/useToast';

export interface CreateBoardDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The create board dialog, owned by the shell so that every view and the
 * sidebar open the one instance.
 *
 * A failed write is reported in a toast and the dialog stays open holding what
 * was typed, which is what lets somebody try again. The form clears its saved
 * draft only once the dialog has closed after a submit, so closing on failure
 * would discard the very text the person needs to resubmit.
 */
export const CreateBoardDialog = ({ open, onClose }: CreateBoardDialogProps) => {
  const createBoard = useCreateBoard();
  const toast = useToast();

  const handleCreate = async (board: BoardFormData) => {
    try {
      await createBoard.mutateAsync(board);
      onClose();
    } catch (error) {
      console.error('Error creating board:', error);
      toast.show({ message: 'Failed to create board. Please try again.' });
    }
  };

  return <CreateBoardModal open={open} onClose={onClose} onCreateBoard={board => void handleCreate(board)} />;
};

export default CreateBoardDialog;
