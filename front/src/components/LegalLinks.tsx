import { useState } from 'react';
import LegalModal from './LegalModal';

type Document = 'terms' | 'privacy';

const LINK_CLASSES =
  'focus-ring inline-flex min-h-7 cursor-pointer items-center whitespace-nowrap rounded-chip px-1 text-xs font-medium text-ink-secondary underline-offset-2 transition-colors hover:text-ink hover:underline';

/**
 * The two legal documents, as links that open them in a dialog.
 *
 * They are buttons rather than anchors: nothing navigates, a dialog opens over
 * the page the person is on and gives focus back to the button when it closes.
 */
export const LegalLinks = () => {
  const [open, setOpen] = useState<Document | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <button type="button" onClick={() => setOpen('privacy')} className={LINK_CLASSES}>
        Privacy policy
      </button>
      <button type="button" onClick={() => setOpen('terms')} className={LINK_CLASSES}>
        Terms
      </button>

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
};

export default LegalLinks;
