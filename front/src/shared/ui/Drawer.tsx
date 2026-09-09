import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export type DrawerSize = 'sm' | 'md' | 'lg';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DrawerSize;
  closeOnBackdrop?: boolean;
}

// max-w-xl matches the existing drawer panel in src/components/TaskDrawer.tsx (md, default).
const SIZE_CLASSES: Record<DrawerSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
};

/**
 * Drawer
 * Same contract and accessibility behavior as Modal, sliding in from the
 * right instead of being centered. Matches the backdrop and panel classes
 * and the spring transition of the existing drawer (see
 * src/components/TaskDrawer.tsx lines 540-558). It never auto-dismisses.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: DrawerProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(open, onClose);
  useFocusTrap(panelRef, open);
  useBodyScrollLock(open);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          <motion.div
            ref={panelRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`fixed right-0 top-0 h-full w-full ${SIZE_CLASSES[size]} bg-white shadow-xl z-50 overflow-y-auto flex flex-col`}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 id={titleId} className="text-xl font-bold text-gray-900 font-heading">
                  {title}
                </h2>
                {subtitle && <p className="text-sm text-gray-600 font-body mt-1">{subtitle}</p>}
              </div>
            </div>

            <div className="flex-1 p-6">{children}</div>

            {footer && (
              <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">{footer}</div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
