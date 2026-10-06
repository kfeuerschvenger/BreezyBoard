import React from 'react';
import { Button, Modal } from '@/shared/ui';

export interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * What to do when there is no password reset yet.
 *
 * It was the fifth hand-written modal in the codebase and the one finding
 * P3-4 missed, so it had no dialog role, no accessible name, no focus trap,
 * no focus restoration, no Escape, and a close button with no name. All of
 * that comes from the shared Modal, which is the whole argument of P3-4: a
 * shell written once is a shell that cannot be got wrong a sixth time.
 */
export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ open, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Forgot password"
    size="sm"
    footer={
      <div className="flex justify-end w-full">
        <Button type="button" onClick={onClose}>
          OK
        </Button>
      </div>
    }
  >
    <p className="text-gray-600 p-6">
      This feature is not implemented yet. Please contact your administrator for assistance.
    </p>
  </Modal>
);

export default ForgotPasswordModal;
