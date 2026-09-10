import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SessionWarningToastProps {
  secondsRemaining: number;
  onExtend: () => void;
}

const INITIAL_MESSAGE = 'Your session is about to expire. Select "Stay signed in" to continue.';

/**
 * Non-blocking, non-modal toast warning that the sliding session is about to
 * expire. Portal-rendered to document.body, positioned fixed bottom-right,
 * matching shared/ui/Modal.tsx's portal pattern but deliberately without any
 * backdrop, focus trap, or auto-dismiss: the toast disappears only because
 * the parent stops rendering it once the warning window has passed.
 *
 * Accessibility: the role="alert" element's announced text is normally
 * static, so screen readers announce it exactly once on mount. It is only
 * mutated at the moments secondsRemaining crosses 30 and 10, producing
 * exactly two additional announcements - never one per second. The visible
 * ticking number lives in a separate aria-hidden span instead.
 */
export function SessionWarningToast({ secondsRemaining, onExtend }: SessionWarningToastProps) {
  const [announcedText, setAnnouncedText] = useState(INITIAL_MESSAGE);

  useEffect(() => {
    if (secondsRemaining === 30) {
      setAnnouncedText('30 seconds remaining. Select "Stay signed in" to continue.');
    } else if (secondsRemaining === 10) {
      setAnnouncedText('10 seconds remaining. Select "Stay signed in" to continue.');
    }
  }, [secondsRemaining]);

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <div role="alert" className="text-sm text-gray-800">
        {announcedText}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span aria-hidden="true" className="text-lg font-semibold text-gray-900">
          {secondsRemaining}
        </span>
        <button
          type="button"
          onClick={onExtend}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
        >
          Stay signed in
        </button>
      </div>
    </div>,
    document.body
  );
}

export default SessionWarningToast;
