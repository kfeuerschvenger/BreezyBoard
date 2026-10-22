import { useState, type ReactNode } from 'react';
import LegalModal from '@/components/LegalModal';

export type LegalDocument = 'terms' | 'privacy';

export interface LegalDocuments {
  /** Opens one of the two documents in its dialog. */
  show: (document: LegalDocument) => void;
  /** The two dialogs. Render them once, anywhere, next to whatever calls `show`. */
  dialogs: ReactNode;
}

/**
 * The state and the dialogs behind the legal links, so that the same two
 * documents open from a row of links under a form and from links set inside a
 * sentence without either rendering owning a second copy of them.
 *
 * Focus goes back to whatever opened the dialog, which is the link pressed:
 * the shared `Modal` restores it.
 */
export const useLegalDocuments = (): LegalDocuments => {
  const [open, setOpen] = useState<LegalDocument | null>(null);
  const close = () => setOpen(null);

  const dialogs = (
    <>
      <LegalModal
        open={open === 'terms'}
        onClose={close}
        title="Terms of Service - BreezyBoard"
        filePath="/terms-of-service.txt"
      />
      <LegalModal
        open={open === 'privacy'}
        onClose={close}
        title="Privacy Policy - BreezyBoard"
        filePath="/privacy-policy.txt"
      />
    </>
  );

  return { show: setOpen, dialogs };
};

export default useLegalDocuments;
