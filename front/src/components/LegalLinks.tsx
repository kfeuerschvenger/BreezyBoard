import { useLegalDocuments } from '@/hooks/useLegalDocuments';

const LINK_CLASSES =
  'focus-ring inline-flex min-h-7 cursor-pointer items-center whitespace-nowrap rounded-chip px-1 text-xs font-medium text-ink-secondary underline-offset-2 transition-colors hover:text-ink hover:underline';

/**
 * The two legal documents, as links that open them in a dialog.
 *
 * They are buttons rather than anchors: nothing navigates, a dialog opens over
 * the page the person is on and gives focus back to the button when it closes.
 * A sentence that names the documents sets its own links on the same dialogs
 * through `useLegalDocuments`.
 */
export const LegalLinks = () => {
  const { show, dialogs } = useLegalDocuments();

  return (
    <>
      <button type="button" onClick={() => show('privacy')} className={LINK_CLASSES}>
        Privacy policy
      </button>
      <button type="button" onClick={() => show('terms')} className={LINK_CLASSES}>
        Terms
      </button>

      {dialogs}
    </>
  );
};

export default LegalLinks;
