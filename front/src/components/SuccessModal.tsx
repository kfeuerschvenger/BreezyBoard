import React from 'react';
import { Check } from 'lucide-react';
import { Button, Modal } from '@/shared/ui';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
};

/**
 * SuccessModal
 * Confirms that something was saved.
 *
 * It no longer dismisses itself. The previous version closed after two
 * seconds with no way to stop it, which is finding P4-3 and a plain failure
 * of WCAG 2.2.1: two seconds is not enough for somebody reading with a
 * screen reader, reading slowly, or simply looking elsewhere when it
 * appeared, and there was no way to ask for more time. A confirmation that
 * vanishes before it is read is the same as no confirmation, except that
 * the person cannot tell which of the two happened.
 *
 * The `autoCloseMs` prop is gone rather than defaulted to zero, so a caller
 * cannot quietly reintroduce the behaviour.
 *
 * The rest, backdrop, panel, escape handling, focus trapping and focus
 * restoration, comes from the shared Modal. Finding P3-4.
 */
const SuccessModal: React.FC<Props> = ({ open, title = 'Success', message = 'Changes saved.', onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <div className="flex w-full items-center justify-end">
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </div>
    }
  >
    {/* role="status" so the message is announced when it appears, rather
        than only being readable by somebody who goes looking for it. */}
    <div role="status" className="flex items-center gap-4">
      <span className="flex items-center justify-center w-12 h-12 bg-green-50 rounded-full shrink-0">
        <Check className="text-green-600" size={20} aria-hidden="true" />
      </span>
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  </Modal>
);

export default SuccessModal;
