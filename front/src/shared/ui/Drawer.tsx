import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { IconX } from '@tabler/icons-react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

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

// The width cap applies from the medium breakpoint up, where the drawer is a
// side panel. Below it the drawer is a bottom sheet and always spans the screen.
const SIZE_CLASSES: Record<DrawerSize, string> = {
  sm: 'md:max-w-md',
  md: 'md:max-w-xl',
  lg: 'md:max-w-2xl',
};

/** The medium breakpoint, where the sheet becomes a side panel. Matches Tailwind's `md`. */
const SIDE_PANEL_QUERY = '(min-width: 768px)';

/**
 * Drawer
 * Same contract and accessibility behavior as Modal, anchored to an edge
 * instead of being centered. It is a bottom sheet below the medium breakpoint
 * and a side panel against the right edge from there up: a full height side
 * panel on a phone leaves no board visible behind it, while a sheet capped at
 * 90 dvh keeps the page header in view.
 *
 * The panel never grows past the screen. The header and the optional `footer`
 * stay in place and only the body scrolls, so a form's actions are reachable
 * however long the form is. Heights use `dvh`, which follows the browser
 * chrome and, where the browser resizes the layout for the on-screen
 * keyboard, the keyboard too; `vh` would be taller than what is visible. The
 * footer pads for the home indicator through `safe-area-inset-bottom`.
 *
 * It slides in from the bottom or from the right to match. It never
 * auto-dismisses and has no drag-to-dismiss gesture: Escape, the close
 * button and the backdrop all work for every input method, and a drag
 * gesture would add a path only a touch screen can take.
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
  const sidePanel = useMediaQuery(SIDE_PANEL_QUERY);
  const offscreen = sidePanel ? { x: '100%' } : { y: '100%' };
  const onscreen = sidePanel ? { x: 0 } : { y: 0 };

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
            className="fixed inset-0 z-40 bg-scrim backdrop-blur-[6px]"
          />

          <motion.div
            ref={panelRef}
            initial={offscreen}
            animate={onscreen}
            exit={offscreen}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-modal bg-surface shadow-modal md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:rounded-tr-none md:rounded-bl-modal ${SIZE_CLASSES[size]}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-08 px-4 py-4 md:px-6 md:py-5">
              <div className="min-w-0">
                <h2 id={titleId} className="font-heading text-[22px] font-bold tracking-tight text-ink break-words">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>}
              </div>
              {/* See the same block in Modal: an icon-only close with no
                  accessible name is what axe reports as button-name, and
                  IconButton demands the label in its own type. */}
              <IconButton type="button" aria-label="Close" shape="round" onClick={onClose} className="group">
                <Icon as={IconX} size={20} className="transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
              </IconButton>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</div>

            {footer && (
              <div className="flex items-center justify-between border-t border-line-08 bg-surface-subtle px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-6">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
