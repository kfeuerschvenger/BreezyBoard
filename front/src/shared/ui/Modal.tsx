import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

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

// max-w-2xl matches the existing modal shell in src/components/AddMemberModal.tsx (md, default),
// max-w-3xl matches src/components/LegalModal.tsx (lg), max-w-md is the smaller variant.
const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
};

/**
 * Modal
 * Centered dialog rendered through a portal into document.body. Matches the
 * animation, backdrop and panel classes of the existing modal shells (see
 * src/components/AddMemberModal.tsx lines 147-183 and footer 337-363), while
 * fixing the accessibility gaps the six existing copies get inconsistently
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
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative bg-white rounded-xl shadow-2xl w-full ${SIZE_CLASSES[size]} mx-4 max-h-[80vh] overflow-hidden flex flex-col`}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 id={titleId} className="text-xl font-semibold text-gray-900 font-heading">
                  {title}
                </h2>
                {subtitle && <p className="text-sm text-gray-600 font-body mt-1">{subtitle}</p>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">{children}</div>

            {footer && (
              <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
