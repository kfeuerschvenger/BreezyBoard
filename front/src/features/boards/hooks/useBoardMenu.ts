import { useCallback, useEffect, useState } from 'react';

export interface UseBoardMenuResult {
  isOpen: (boardId: string) => boolean;
  toggle: (boardId: string) => void;
  close: () => void;
}

/**
 * Which board's options menu is open, for a grid of them.
 *
 * One piece of state for the whole grid rather than one per card, which is
 * what makes opening a second menu close the first without the cards having
 * to know about each other.
 *
 * Both ways of dismissing it listen on the window, because a menu has to
 * close on a click it never receives. The click handler recognises its own
 * markup by the two data attributes the menu carries, so a click on the
 * trigger reaches the toggle instead of being closed out from under it.
 *
 * A dialog opened from a menu item is not outside the menu: pressing Cancel
 * or Escape in it must leave the menu open, because the dialog returns focus
 * to the item that opened it and that item has to still exist.
 */
export const useBoardMenu = (): UseBoardMenuResult => {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if ((event.target as HTMLElement | null)?.closest?.('[role="dialog"]')) return;
      setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-board-menu]') || target.closest('[data-board-menu-btn]')) return;
      if (target.closest('[role="dialog"]')) return;
      setOpenId(null);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const isOpen = useCallback((boardId: string) => openId === boardId, [openId]);
  const toggle = useCallback((boardId: string) => setOpenId(prev => (prev === boardId ? null : boardId)), []);
  const close = useCallback(() => setOpenId(null), []);

  return { isOpen, toggle, close };
};

export default useBoardMenu;
