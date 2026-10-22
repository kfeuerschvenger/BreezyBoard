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
import { enterTransition, exitTransition } from './motionTokens';

export type ModalSize = 'sm' | 'md' | 'lg';

/**
 * `center` is a dialog in the middle of the screen at every width. `sheet` is
 * the same dialog from the medium breakpoint up and a bottom sheet below it.
 */
export type ModalPlacement = 'center' | 'sheet';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog. It is the heading too, unless `header` replaces the title row. */
  title: string;
  subtitle?: string;
  /**
   * Replaces the title row. The dialog is then named with `aria-label` from
   * `title`, since the row no longer holds the heading the name would point
   * at, and the header owns its close control: use `ModalClose` for it.
   */
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  placement?: ModalPlacement;
  closeOnBackdrop?: boolean;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
};

/** The medium breakpoint, where a sheet becomes a centered dialog. Matches Tailwind's `md`. */
const CENTERED_QUERY = '(min-width: 768px)';

const CENTER_PANEL = 'mx-4 max-h-[85dvh] rounded-modal';

// A sheet spans the screen and has square lower corners, so it sits flush
// against the bottom edge. Its footer pads for the home indicator through
// `safe-area-inset-bottom`, so its last button clears the bar.
const SHEET_PANEL = 'mx-0 max-h-[90dvh] rounded-t-modal rounded-b-none md:mx-4 md:max-h-[85dvh] md:rounded-modal';

export interface ModalCloseProps {
  onClose: () => void;
  className?: string;
}

/**
 * The round close button every modal header carries.
 *
 * An icon-only close is the one control every modal shell has and the one
 * that used to render as a bare button with nothing but an X inside, which
 * axe reports as button-name: a control a screen reader announces as
 * "button" and nothing else. IconButton demands an aria-label in its own
 * type, so putting it here makes that impossible to get wrong in any modal.
 * The glyph turns a quarter on hover, which the reduced motion rule
 * collapses.
 */
export function ModalClose({ onClose, className = '' }: ModalCloseProps): ReactNode {
  return (
    <IconButton type="button" aria-label="Close" shape="round" onClick={onClose} className={`group ${className}`}>
      <Icon as={IconX} size={20} className="transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
    </IconButton>
  );
}

/**
 * Modal
 * Centered dialog rendered through a portal into document.body, on a blurred
 * navy scrim. The panel rises in on `bbUp`: 16 pixels up and a 3 percent
 * scale, 350 milliseconds on the standard easing. It leaves faster and
 * without the rise, because something a person has just dismissed should not
 * make them wait for it. As a `sheet` below the medium breakpoint it rises
 * from the bottom edge instead, on the same timing.
 *
 * It keeps the accessibility the six hand-written shells got inconsistently
 * right: a labelled dialog role, an escape handler, a focus trap that
 * restores focus on close, and a scroll lock. It never auto-dismisses.
 *
 * Both layers stop receiving pointer events the moment the dialog is closed.
 * The wrapper covers the whole screen and stays mounted until the panel has
 * finished leaving, so without that the first press on the page after a save
 * lands on the fading wrapper and a drag becomes a text selection.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  header,
  children,
  footer,
  size = 'md',
  placement = 'center',
  closeOnBackdrop = true,
}: ModalProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const centered = useMediaQuery(CENTERED_QUERY);
  const asSheet = placement === 'sheet' && !centered;

  useEscapeKey(open, onClose);
  useFocusTrap(panelRef, open);
  useBodyScrollLock(open);

  const hidden = asSheet ? { opacity: 1, y: '100%' } : { opacity: 0, y: 16, scale: 0.97 };
  const shown = asSheet ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 };
  // A sheet leaves down, the way it came. A dialog fades.
  const leaving = asSheet ? { y: '100%' } : { opacity: 0 };

  const naming = header ? { 'aria-label': title } : { 'aria-labelledby': titleId };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          exit={{ pointerEvents: 'none' }}
          className={`fixed inset-0 z-50 flex justify-center ${placement === 'sheet' ? 'items-end md:items-center' : 'items-center'}`}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.2 } }}
            onClick={closeOnBackdrop ? onClose : undefined}
            className="absolute inset-0 bg-scrim backdrop-blur-[6px]"
          />

          <motion.div
            ref={panelRef}
            initial={hidden}
            animate={{ ...shown, transition: enterTransition(0.35) }}
            exit={{ ...leaving, pointerEvents: 'none', transition: exitTransition(0.2) }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            {...naming}
            className={`relative flex w-full flex-col overflow-hidden bg-surface shadow-modal outline-none ${SIZE_CLASSES[size]} ${
              placement === 'sheet' ? SHEET_PANEL : CENTER_PANEL
            }`}
          >
            {header ?? (
              <div className="flex items-center justify-between gap-3 border-b border-line-08 px-4 py-4 md:px-6 md:py-5">
                <div className="min-w-0">
                  <h2 id={titleId} className="font-heading text-[22px] font-bold tracking-tight text-ink break-words">
                    {title}
                  </h2>
                  {subtitle && <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>}
                </div>
                <ModalClose onClose={onClose} />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</div>

            {footer && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-08 bg-surface-subtle px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
