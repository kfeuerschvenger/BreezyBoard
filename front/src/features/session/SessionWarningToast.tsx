import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/shared/ui';

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
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-card border border-line-10 bg-surface p-4 shadow-modal">
      <div role="alert" className="text-sm text-ink-body">
        {announcedText}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span aria-hidden="true" className="font-mono text-lg font-medium text-ink">
          {secondsRemaining}
        </span>
        <Button type="button" size="xs" onClick={onExtend}>
          Stay signed in
        </Button>
      </div>
    </div>,
    document.body
  );
}

export default SessionWarningToast;
