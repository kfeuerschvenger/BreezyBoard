import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Names what is about to happen and to what. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /** Disables both buttons while the confirmed action is running. */
  isWorking?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before an action that is hard to take back.
 *
 * Focus starts on Cancel, not on the first control in the dialog and not on
 * the confirm button: for a destructive question the key press that is most
 * likely to be a reflex, Enter or Space right after the dialog opens, must be
 * the safe one. The focus trap puts it on the close button first, and this
 * moves it in the same commit, before the browser paints.
 */
export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  isWorking = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={isWorking ? () => undefined : onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={isWorking}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isWorking}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-ink-body">{description}</div>
    </Modal>
  );
};

export default ConfirmDialog;
