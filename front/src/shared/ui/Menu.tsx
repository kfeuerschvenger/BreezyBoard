import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, usePresence } from 'motion/react';
import { enterTransition, exitTransition } from './motionTokens';

/** What the trigger must spread onto its button so the menu can drive it. */
export interface MenuTriggerProps {
  ref: React.RefObject<HTMLButtonElement | null>;
  id: string;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: (event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface MenuProps {
  /**
   * Names the menu for assistive technology. Left out, the menu is named by
   * its trigger, which is the pattern's default and right whenever the
   * trigger's own name already says what the menu is.
   */
  label?: string;
  /** Draws the trigger. `open` is only for styling, such as a rotated chevron. */
  renderTrigger: (props: MenuTriggerProps, state: { open: boolean }) => React.ReactNode;
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

interface MenuContextValue {
  /** Closes the menu and puts focus back on the trigger. */
  close: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

const VIEWPORT_MARGIN = 8;
const GAP = 4;

const itemsOf = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

/**
 * A menu button: a trigger and a popup of actions.
 *
 * **Who owns the open state: the menu does, privately.** Nothing outside it
 * can open or close it. Two menus on one page need no coordinating hook,
 * because pressing anywhere outside a menu closes it, and that includes
 * pressing another menu's trigger. A caller that needs to know a choice was
 * made passes `onSelect` to the item, which is the only signal there is.
 *
 * The popup is rendered in a portal at fixed coordinates measured from the
 * trigger. The task cards that carry one of these sit inside a column body
 * that scrolls, and an absolutely positioned popup would be clipped by it and
 * make that column scroll to show it. The popup is measured again when
 * anything scrolls or the window resizes, since fixed coordinates cannot
 * follow the trigger by themselves.
 *
 * Keyboard follows the ARIA menu button pattern: Enter, Space and the arrows
 * open it from the trigger, the arrows, Home and End move between items,
 * Escape and Tab close it, and focus returns to the trigger every time the
 * menu closes.
 *
 * React events bubble through a portal to the component's React parent, so
 * the popup stops clicks at its own boundary. A menu inside a clickable card
 * would otherwise activate the card on every choice.
 */
export const Menu: React.FC<MenuProps> = ({ label, renderTrigger, align = 'end', className = '', children }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const menuId = `menu-${useId()}`;
  const triggerId = `menu-trigger-${useId()}`;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Which item takes focus when the menu opens: the first for a click or
  // Enter, the last for ArrowUp, as the pattern asks.
  const entry = useRef<'first' | 'last'>('first');

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const openAt = useCallback((where: 'first' | 'last') => {
    entry.current = where;
    setOpen(true);
  }, []);

  // Fixed coordinates cannot follow the trigger by themselves, so they are
  // measured from it again whenever something could have moved it.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const anchor = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;

    const preferredLeft = align === 'end' ? anchor.right - width : anchor.left;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, window.innerWidth - width - VIEWPORT_MARGIN));

    const below = anchor.bottom + GAP;
    const fitsBelow = below + height + VIEWPORT_MARGIN <= window.innerHeight;
    const above = anchor.top - GAP - height;
    // Flip only when it helps: a menu taller than both sides stays below.
    const top = fitsBelow || above < VIEWPORT_MARGIN ? below : above;

    setPosition({ top, left });
  }, [align]);

  // Position from the trigger, then focus an item, before the first paint so
  // the popup never shows at the wrong place or without focus. The state set
  // here re-renders synchronously, still ahead of the paint. The panel must
  // stay visible while this runs: an element with visibility hidden cannot
  // take focus.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;

    place();

    const items = itemsOf(panel);
    const enabled = items.filter(item => item.getAttribute('aria-disabled') !== 'true');
    const target = entry.current === 'last' ? (enabled.at(-1) ?? items.at(-1)) : (enabled[0] ?? items[0]);
    target?.focus({ preventScroll: true });
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    // Capture, because a scroll does not bubble and the one that matters is
    // the column's or the board row's, never the window's. The menu follows
    // its trigger rather than closing: a scroll that is still settling when
    // the menu opens, such as a scroll snap or a focus scrolled into view,
    // would otherwise close it before it could be used.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const onTriggerClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (open) setOpen(false);
    else openAt('first');
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt('last');
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    const items = itemsOf(panelRef.current);
    const current = items.indexOf(document.activeElement as HTMLElement);

    const focusAt = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };

    switch (event.key) {
      case 'ArrowDown':
        focusAt(current + 1);
        break;
      case 'ArrowUp':
        focusAt(current < 0 ? items.length - 1 : current - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(items.length - 1);
        break;
      case 'Escape':
      case 'Tab':
        // Tab leaves the menu rather than walking through it, and lands on
        // the trigger because the popup lives at the end of the document and
        // letting the browser continue from there would skip the page.
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: onTriggerClick,
    onKeyDown: onTriggerKeyDown,
  };

  return (
    <MenuContext.Provider value={{ close }}>
      {renderTrigger(triggerProps, { open })}

      {createPortal(
        <AnimatePresence>
          {open && (
            // One key handler on the popup rather than one per item: the
            // pattern treats the items as a single composite widget.
            <MenuSurface
              id={menuId}
              panelRef={panelRef}
              label={label}
              triggerId={triggerId}
              onKeyDown={onPanelKeyDown}
              position={position}
              align={align}
              className={className}
            >
              {children}
            </MenuSurface>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </MenuContext.Provider>
  );
};

interface MenuSurfaceProps {
  id: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  label: string | undefined;
  triggerId: string;
  onKeyDown: (event: React.KeyboardEvent) => void;
  position: { top: number; left: number } | null;
  align: 'start' | 'end';
  className: string;
  children: React.ReactNode;
}

/**
 * The popup and its animation. It rises 4 pixels and fades in over 180
 * milliseconds on the standard easing, from the edge it is lined up with, and
 * fades out over 120 on the exit easing.
 *
 * While it leaves it is still in the document, because the exit is what keeps
 * it mounted. `usePresence` says so, and the popup is then inert and hidden
 * from assistive technology: a menu that has been closed must not stay
 * reachable for the length of its own fade.
 */
const MenuSurface: React.FC<MenuSurfaceProps> = ({
  id,
  panelRef,
  label,
  triggerId,
  onKeyDown,
  position,
  align,
  className,
  children,
}) => {
  const [isPresent] = usePresence();

  return (
    <motion.div
      id={id}
      ref={panelRef}
      role="menu"
      aria-label={label}
      aria-labelledby={label ? undefined : triggerId}
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={event => event.stopPropagation()}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: enterTransition(0.18) }}
      exit={{ opacity: 0, transition: exitTransition(0.12) }}
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        transformOrigin: align === 'end' ? 'top right' : 'top left',
      }}
      className={`z-50 min-w-44 rounded-control border border-line-10 bg-surface p-1.5 shadow-tile-hover focus:outline-none ${className}`}
    >
      {children}
    </motion.div>
  );
};

export interface MenuItemProps {
  children: React.ReactNode;
  /** Runs after the menu has closed and returned focus to the trigger. */
  onSelect: () => void;
  /**
   * Stays in the keyboard order and in the accessibility tree, so a person
   * hears that the option exists and why it does nothing, but cannot be
   * chosen. `aria-disabled` rather than `disabled` keeps it focusable.
   */
  disabled?: boolean;
  className?: string;
}

export const MenuItem: React.FC<MenuItemProps> = ({ children, onSelect, disabled = false, className = '' }) => {
  const menu = useContext(MenuContext);

  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        menu?.close();
        onSelect();
      }}
      className={`focus-ring-inset flex min-h-11 w-full items-center gap-3 rounded-button-small px-3 py-2 text-left text-sm font-medium transition-colors duration-150 sm:min-h-9 ${
        disabled
          ? 'cursor-not-allowed text-ink-tertiary'
          : 'cursor-pointer text-ink-secondary hover:bg-line-06 hover:text-ink focus-visible:bg-line-06 focus-visible:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  );
};

export default Menu;
