import { useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useColors } from '@/features/colors';
import type { Board, Color, Column } from '@/models';
import { apiErrorCodeOf, apiErrorMessageOf, httpStatusOf } from '@/shared/lib/httpStatus';
import { Button, Modal } from '@/shared/ui';
import { MIN_COLUMNS, columnsChanged, columnsRequest, rowsFromColumns } from '../boardColumns';
import type { ColumnChange, ColumnRow } from '../boardColumns';
import { boardHueOptions } from '../boardHue';
import { editBoardSchema } from '../boardForm';
import type { BoardFieldValues, EditBoardValues } from '../boardForm';
import { BoardFormFields } from './BoardFormFields';
import { ColumnsEditor } from './ColumnsEditor';

/**
 * What Save hands over: the board's fields, and its columns when they were
 * changed, with the version of the columns the dialog was opened on.
 */
export type EditBoardSave = BoardFieldValues & { columns?: ColumnChange[]; columnsVersion?: number };

/** The board's columns as the server holds them now, which is what a reload brings. */
export type ReloadedColumns = Pick<Board, 'columns' | 'columnsVersion'>;

export interface EditBoardModalProps {
  open: boolean;
  /** `columns` switches on the columns section, which a board page offers and nothing else does. */
  board: Pick<Board, 'title' | 'description' | 'color' | 'columnsVersion'> & { columns?: Column[] };
  /** Live cards in each column by column id, which is what decides whether a column can be removed. */
  taskCounts?: Readonly<Record<string, number>>;
  /** Opens with the cursor in the name of the column to add. */
  focusColumns?: boolean;
  onClose: () => void;
  /** Rejects when the save fails, so the dialog can say so and keep the edits. */
  onSave: (values: EditBoardSave) => Promise<void>;
  /** Reads the columns again, for the person who is told that they changed. Rejects when it cannot. */
  onReloadColumns?: () => Promise<ReloadedColumns>;
}

const STALE_COLUMNS_CODE = 'COLUMNS_STALE';

const NO_COLORS: Color[] = [];
const NO_COUNTS: Readonly<Record<string, number>> = {};

const colorIdOf = (color: Board['color']) => (typeof color === 'string' ? color : (color?._id ?? ''));

/**
 * Changes a board's name, description and colour, and on a board page its
 * columns.
 *
 * The same fields and the same validation as the create dialog, through the
 * shared `BoardFormFields` and `boardFieldsSchema`. It is a dialog of its own
 * rather than a mode of the create one because everything that makes the
 * create dialog heavy is about creating: the template, the draft that
 * survives a reload, and the defaults applied as the lists arrive. An edit
 * starts from a board that already has every value.
 *
 * Every change to the columns waits in the form with the rest, and Save sends
 * them in the same request as the board's own fields: the server applies all
 * of it or none of it. Cancel discards all of it.
 *
 * A failed save keeps the dialog open with what was typed and says so. The
 * save rejecting is the only signal, which is why `onSave` must not catch. A
 * 409 is the one failure whose text is shown as the server wrote it, because it
 * names the column that gained cards while the dialog was open.
 *
 * The columns a save carries are the ones the dialog was opened with, and so is
 * the version it sends: a board that is refetched while the dialog is open does
 * not move either, so a list built on one view is never saved against another.
 * When the server answers that the columns changed in the meantime, nothing was
 * saved, and the dialog says so and offers to read the columns again. Reloading
 * replaces the list with the current one, and leaves the name, description and
 * colour as typed.
 */
export const EditBoardModal = ({
  open,
  board,
  taskCounts = NO_COUNTS,
  focusColumns = false,
  onClose,
  onSave,
  onReloadColumns,
}: EditBoardModalProps) => {
  const colorsQuery = useColors('board');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [columnsStale, setColumnsStale] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  const hasColumns = board.columns !== undefined;

  const initial = useMemo<EditBoardValues>(
    () => ({
      title: board.title,
      description: board.description ?? '',
      color: colorIdOf(board.color),
      ...(board.columns && { columns: rowsFromColumns(board.columns) }),
    }),
    [board.title, board.description, board.color, board.columns]
  );

  const schema = useMemo(() => editBoardSchema((board.columns?.length ?? 0) >= MIN_COLUMNS), [board.columns]);

  const form = useForm<EditBoardValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
    mode: 'onChange',
  });
  const {
    handleSubmit,
    reset,
    getValues,
    formState: { isValid, isSubmitting },
  } = form;

  // The columns, and their version, that the form was last brought to. It
  // follows the board while the dialog is closed and stands still while it is
  // open, which is what makes it the view the person's edits are built on.
  const opened = useRef<{ version: number | undefined; rows: ColumnRow[] | undefined }>({
    version: board.columnsVersion,
    rows: initial.columns,
  });

  // The form is brought back to the board as it is now while the dialog is
  // closed, so every opening starts from it and an abandoned edit is never
  // shown again. It is not reset on opening. A reset empties react-hook-form's
  // field registry and the fields register again on the next render, and text
  // typed in between is written to a field the form no longer knows and then
  // overwritten from its values: a person cannot type that fast, but the
  // dialog is ready to type into before that render has happened. It also
  // means a board that is refetched while the dialog is open does not take the
  // edit away.
  useEffect(() => {
    if (open) return;
    reset(initial);
    opened.current = { version: board.columnsVersion, rows: initial.columns };
    setSaveError(null);
    setColumnsStale(false);
  }, [open, initial, board.columnsVersion, reset]);

  const submit = handleSubmit(async values => {
    setSaveError(null);
    setColumnsStale(false);

    const { columns, ...fields } = values;
    const baseline = opened.current.rows;
    const changed = columns !== undefined && baseline !== undefined && columnsChanged(baseline, columns);

    try {
      await onSave(
        changed ? { ...fields, columns: columnsRequest(columns), columnsVersion: opened.current.version ?? 0 } : fields
      );
    } catch (error) {
      if (httpStatusOf(error) === 409 && apiErrorCodeOf(error) === STALE_COLUMNS_CODE) {
        setColumnsStale(true);
        setSaveError(
          'The columns of this board were changed by someone else while you were editing. Nothing was saved. Reload the columns to see the current list, then make your column changes again.'
        );
        return;
      }

      setSaveError(
        httpStatusOf(error) === 409
          ? (apiErrorMessageOf(error) ?? 'A column still has cards. Move them first and try again.')
          : 'The board could not be saved. Your changes are still here, so you can try again.'
      );
      return;
    }

    onClose();
  });

  // Brings the columns of the form to what the server holds now and makes that
  // the view the next save is built on. Everything else in the form stays.
  const reloadColumns = async () => {
    if (!onReloadColumns) return;

    setIsReloading(true);

    try {
      const fresh = await onReloadColumns();
      const rows = rowsFromColumns(fresh.columns);

      opened.current = { version: fresh.columnsVersion, rows };
      reset({ ...getValues(), columns: rows });
      setColumnsStale(false);
      setSaveError(null);
    } catch {
      setSaveError('The columns could not be reloaded. Try again.');
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit board"
      subtitle={hasColumns ? 'Change the name, description, colour or columns' : 'Change the name, description or colour'}
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
          {columnsStale && onReloadColumns && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => void reloadColumns()}
                disabled={isReloading}
                className="focus-ring cursor-pointer rounded-chip font-semibold underline"
              >
                Reload columns
              </button>
            </>
          )}
        </div>
      )}

      <FormProvider {...form}>
        <form id="edit-board-form" onSubmit={submit} className="space-y-6">
          <BoardFormFields colors={colorsQuery.data ?? NO_COLORS} />

          {hasColumns && (
            <ColumnsEditor colors={colorsQuery.data ?? NO_COLORS} taskCounts={taskCounts} focusAdd={focusColumns} />
          )}
        </form>
      </FormProvider>
    </Modal>
  );
};

export default EditBoardModal;
