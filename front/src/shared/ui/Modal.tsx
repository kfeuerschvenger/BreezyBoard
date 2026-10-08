import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { IconX } from '@tabler/icons-react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { enterTransition, exitTransition } from './motionTokens';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
};

/**
 * Modal
 * Centered dialog rendered through a portal into document.body, on a blurred
 * navy scrim. The panel rises in on `bbUp`: 16 pixels up and a 3 percent
 * scale, 350 milliseconds on the standard easing. It leaves faster and
 * without the rise, because something a person has just dismissed should not
 * make them wait for it.
 *
 * It keeps the accessibility the six hand-written shells got inconsistently
 * right: a labelled dialog role, an escape handler, a focus trap that
 * restores focus on close, and a scroll lock. It never auto-dismisses.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(open, onClose);
  useFocusTrap(panelRef, open);
  useBodyScrollLock(open);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            onClick={closeOnBackdrop ? onClose : undefined}
            className="absolute inset-0 bg-scrim backdrop-blur-[6px]"
          />

          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: enterTransition(0.35) }}
            exit={{ opacity: 0, transition: exitTransition(0.2) }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative bg-surface rounded-modal shadow-modal w-full ${SIZE_CLASSES[size]} mx-4 max-h-[85dvh] overflow-hidden flex flex-col`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-08 px-4 py-4 md:px-6 md:py-5">
              <div className="min-w-0">
                <h2 id={titleId} className="font-heading text-[22px] font-bold tracking-tight text-ink break-words">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>}
              </div>
              {/* An icon-only close is the one control every existing modal
                  shell has and every one of them renders as a bare button
                  with nothing but an X inside, which axe reports as
                  button-name: a control a screen reader announces as
                  "button" and nothing else. IconButton demands an
                  aria-label in its own type, so putting it here makes that
                  impossible to get wrong in any modal from now on. The glyph
                  turns a quarter on hover, which the reduced motion rule
                  collapses. */}
              <IconButton type="button" aria-label="Close" shape="round" onClick={onClose} className="group">
                <Icon as={IconX} size={20} className="transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
              </IconButton>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>

            {footer && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-08 bg-surface-subtle px-4 py-4 md:p-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
