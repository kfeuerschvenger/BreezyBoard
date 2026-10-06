import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import SimpleUserAvatar from '@/components/SimpleUserAvatar';
import type { User } from '@/models';

export interface UserMenuProps {
  user: User;
  onProfile: () => void;
  onLogout: () => void;
}

const fullNameOf = (user: User) => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();

/**
 * The signed in person, and what they can do about it.
 *
 * The trigger carries an explicit name rather than taking one from its
 * contents, and that is a fix rather than a preference. Its contents are an
 * avatar and a name that is `hidden md:block`, so below the medium
 * breakpoint the name is out of the accessibility tree entirely. With an
 * avatar image in place the previous version also hid the avatar, which left
 * the control with no accessible name at all on a phone. Measured at 390
 * pixels, where the button read as the two initials and nothing else.
 */
export const UserMenu: React.FC<UserMenuProps> = ({ user, onProfile, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = `user-menu-${useId()}`;
  const triggerId = `user-menu-trigger-${useId()}`;

  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const fullName = fullNameOf(user);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const choose = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };

    // Focus the first item once the menu is painted, so the keyboard lands
    // inside it rather than behind it.
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });

    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, close]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={triggerId}
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Account menu for ${fullName}`}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
      >
        <SimpleUserAvatar user={user} size="md" showTooltip={false} />
        <span className="hidden md:block text-sm font-medium text-gray-700">{fullName}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-labelledby={triggerId}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 focus:outline-none"
          >
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <SimpleUserAvatar user={user} size="lg" showTooltip={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email ?? ''}</p>
                </div>
              </div>
            </div>

            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => choose(onProfile)}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
              >
                <UserIcon size={16} className="text-gray-400" aria-hidden="true" />
                <span>Profile</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => choose(onLogout)}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 cursor-pointer"
              >
                <LogOut size={16} className="text-red-500" aria-hidden="true" />
                <span>Log out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserMenu;
