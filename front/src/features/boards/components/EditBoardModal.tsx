import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useColors } from '@/features/colors';
import type { Board, Color } from '@/models';
import { Button, Modal } from '@/shared/ui';
import { boardHueOptions } from '../boardHue';
import { boardFieldsSchema } from '../boardForm';
import type { BoardFieldValues } from '../boardForm';
import { BoardFormFields } from './BoardFormFields';

export interface EditBoardModalProps {
  open: boolean;
  board: Pick<Board, 'title' | 'description' | 'color'>;
  onClose: () => void;
  /** Rejects when the save fails, so the dialog can say so and keep the edits. */
  onSave: (values: BoardFieldValues) => Promise<void>;
}

const NO_COLORS: Color[] = [];

const colorIdOf = (color: Board['color']) => (typeof color === 'string' ? color : (color?._id ?? ''));

/**
 * Changes a board's name, description and colour.
 *
 * The same fields and the same validation as the create dialog, through the
 * shared `BoardFormFields` and `boardFieldsSchema`. It is a dialog of its own
 * rather than a mode of the create one because everything that makes the
 * create dialog heavy is about creating: the template, the draft that
 * survives a reload, and the defaults applied as the lists arrive. An edit
 * starts from a board that already has every value.
 *
 * A failed save keeps the dialog open with what was typed and says so. The
 * save rejecting is the only signal, which is why `onSave` must not catch.
 */
export const EditBoardModal = ({ open, board, onClose, onSave }: EditBoardModalProps) => {
  const colorsQuery = useColors('board');
  const [saveError, setSaveError] = useState<string | null>(null);

  const initial = useMemo<BoardFieldValues>(
    () => ({ title: board.title, description: board.description ?? '', color: colorIdOf(board.color) }),
    [board.title, board.description, board.color]
  );

  const form = useForm<BoardFieldValues>({
    resolver: zodResolver(boardFieldsSchema),
    defaultValues: initial,
    mode: 'onChange',
  });
  const {
    handleSubmit,
    reset,
    formState: { isValid, isSubmitting },
  } = form;

  // Every opening starts from the board as it is now. Cancelling an edit and
  // opening the dialog again must not show the abandoned text.
  useEffect(() => {
    if (!open) return;
    reset(initial);
    setSaveError(null);
  }, [open, initial, reset]);

  const submit = handleSubmit(async values => {
    setSaveError(null);

    try {
      await onSave(values);
    } catch {
      setSaveError('The board could not be saved. Your changes are still here, so you can try again.');
      return;
    }

    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Board"
      subtitle="Change the name, description or colour"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-board-form" disabled={!isValid} isLoading={isSubmitting}>
            Save Changes
          </Button>
        </div>
      }
    >
      {(colorsQuery.isError || (colorsQuery.isSuccess && boardHueOptions(colorsQuery.data).length === 0)) && (
        <div role="alert" className="mb-6 rounded-control bg-danger-bg p-3 text-sm text-danger-strong">
          The colours could not be loaded.{' '}
          <button type="button" onClick={() => void colorsQuery.refetch()} className="focus-ring cursor-pointer rounded-chip font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {saveError && (
        <div role="alert" className="mb-6 rounded-control bg-danger-bg p-3 text-sm text-danger-strong">
          {saveError}
        </div>
      )}

      <FormProvider {...form}>
        <form id="edit-board-form" onSubmit={submit} className="space-y-6">
          <BoardFormFields colors={colorsQuery.data ?? NO_COLORS} />
        </form>
      </FormProvider>
    </Modal>
  );
};

export default EditBoardModal;
