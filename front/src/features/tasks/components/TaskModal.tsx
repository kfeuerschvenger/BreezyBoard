import React, { useState } from 'react';
import { IconLayoutKanban } from '@tabler/icons-react';
import type { Task } from '@/models';
import { useBreeze } from '@/features/breeze';
import { Cover, Icon, Modal, ModalClose, WindLayer } from '@/shared/ui';
import type { Hue } from '@/shared/ui';
import { useTaskModal } from '../hooks/useTaskModal';
import type { MoveTarget } from '../hooks/useTaskMover';
import { TaskForm, TaskFormActions } from './TaskForm';

export interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task?: Partial<Task> | null;
  onSave: (task: Partial<Task>) => Promise<void>;
  /** The name of the board, for the pill on the header strip. */
  boardTitle?: string;
  /** The hue of the board, which the header strip is drawn in. */
  hue?: Hue;
  /** Every column of the board, in board order. With `columnId` and `onMove` they make the "Move to" row. */
  columns?: MoveTarget[];
  /** The column the task is in now, as the board holds it. It can differ from `task.status` after a move. */
  columnId?: string;
  onMove?: (target: MoveTarget) => void;
  /** Deletes the task. Rejects when it could not be deleted, so the modal can say so. */
  onDelete?: (task: Partial<Task>) => Promise<void>;
}

const DELETE_FAILED = 'The task could not be blown away. Check your connection and try again.';

interface TaskModalHeaderProps {
  heading: string;
  boardTitle?: string;
  columnTitle?: string;
  hue: Hue;
  onClose: () => void;
}

/**
 * The strip across the top: the board's gradient with a calm wind over it, a
 * glass pill saying where the task is, and the close button.
 *
 * The gradient and the wind are decoration and are hidden from assistive
 * technology, so they are siblings of the controls and never their parent:
 * hiding a parent hides everything inside it, the close button included. The
 * heading is for them alone, and is what gives the dialog's sections a level to
 * hang from. The wind plays calm unless the Breeze setting is Still, and the
 * layer draws nothing under a reduced motion preference either.
 *
 * The pill is ink on white glass, so its text does not depend on which
 * gradient is behind it.
 */
const TaskModalHeader: React.FC<TaskModalHeaderProps> = ({ heading, boardTitle, columnTitle, hue, onClose }) => {
  const { level } = useBreeze();
  const place = [boardTitle, columnTitle].filter(Boolean).join(' · ');

  return (
    <div className="relative h-25 shrink-0">
      {/* Cover sets its own `relative`, which would win over an `absolute` passed to it. */}
      <div className="absolute inset-0">
        <Cover hue={hue} className="size-full" />
      </div>
      <WindLayer tone="light" level={level === 'still' ? 'still' : 'calm'} />

      <h2 className="sr-only">{heading}</h2>

      <div className="relative flex items-start justify-between gap-3 p-4 md:px-6 md:py-5">
        {place ? (
          <span
            data-task-place
            className="inline-flex min-w-0 items-center gap-1.5 rounded-pill bg-glass-strong px-3 py-1.5 text-[13px] font-semibold text-ink"
          >
            <Icon as={IconLayoutKanban} size={15} aria-hidden="true" />
            <span className="truncate">{place}</span>
          </span>
        ) : (
          <span />
        )}
        <ModalClose onClose={onClose} className="bg-glass-strong" />
      </div>
    </div>
  );
};

/**
 * The task as a dialog around the task form: the header strip, the form and
 * the form's buttons.
 *
 * It is a centered dialog from the medium breakpoint up and a bottom sheet
 * below it. Section 12.6 asks a page to read as composition, and the same
 * target is worth holding one level down: fetching, form state, the user
 * search, the checklist and the colour grid all live where they belong.
 *
 * "Move to" acts at once, through the board's own mover, so the task can be
 * moved without saving it, and what it does to the column is the board's
 * business and not the form's. Deleting also acts at once and does not go
 * through the form: the stored draft of a task that is gone is removed, and
 * the modal closes. A failed delete is said here and leaves everything as it
 * was.
 */
const TaskModal: React.FC<TaskModalProps> = ({
  open,
  onClose,
  task = null,
  onSave,
  boardTitle,
  hue = 'sky',
  columns,
  columnId,
  onMove,
  onDelete,
}) => {
  const editor = useTaskModal({ open, task, onSave, onSaved: onClose });
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const exists = Boolean(task?._id);
  const heading = exists ? 'Edit Task' : 'Create New Task';
  const columnTitle = columns?.find(column => column.id === columnId)?.title;

  const handleDelete =
    exists && onDelete && task
      ? async () => {
          setDeleteError(null);
          setIsDeleting(true);
          try {
            await onDelete(task);
            editor.discardDraft();
            onClose();
          } catch (error) {
            console.error('Error deleting task:', error);
            setDeleteError(DELETE_FAILED);
          } finally {
            setIsDeleting(false);
          }
        }
      : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading}
      placement="sheet"
      header={<TaskModalHeader heading={heading} boardTitle={boardTitle} columnTitle={columnTitle} hue={hue} onClose={onClose} />}
      footer={
        <TaskFormActions
          isValid={editor.isValid}
          isSubmitting={editor.isSubmitting}
          onCancel={onClose}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      }
    >
      <TaskForm {...editor} columns={columns} columnId={columnId} onMove={onMove} />
      {deleteError && (
        <div role="alert" className="mt-6 rounded-control bg-danger-bg p-3 text-sm text-danger-strong">
          {deleteError}
        </div>
      )}
    </Modal>
  );
};

export default TaskModal;
