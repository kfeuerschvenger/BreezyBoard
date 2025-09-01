import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '@/services';
import type { User as UserModel } from '@/models';

const UserAvatar: React.FC = () => {
  const navigate = useNavigate();
  const id = useId(); // unique id for aria relationships

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserModel | null>(null);

  // refs used for click-outside detection and focus management
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Fetch the current user once on mount.
  useEffect(() => {
    try {
      const user = AuthService.getCurrentUser();
      setCurrentUser(user ?? null);
    } catch (err) {
      // If AuthService.getCurrentUser throws, ensure we don't crash
      console.error('Failed to get current user', err);
      setCurrentUser(null);
    }
  }, []);

  // Memoize initials so they don't recompute on every render unnecessarily.
  const initials = useMemo(() => {
    if (!currentUser) return '';
    const first = (currentUser.firstName?.[0] ?? '').toUpperCase();
    const last = (currentUser.lastName?.[0] ?? '').toUpperCase();
    return `${first}${last}`.trim();
  }, [currentUser]);

  // Toggle dropdown (memoized)
  const toggleDropdown = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // Close dropdown helper (memoized)
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    // return focus to the toggle button for accessibility
    if (buttonRef.current) buttonRef.current.focus();
  }, []);

  // Navigate to profile
  const handleProfileClick = useCallback(() => {
    closeDropdown();
    navigate('/profile');
  }, [closeDropdown, navigate]);

  // Logout handler - supports both sync and async logout implementations
  const handleLogout = useCallback(async () => {
    closeDropdown();
    try {
      // If AuthService.logout returns a promise, await it; otherwise nothing happens.
      const maybePromise: any = AuthService.logout();
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      navigate('/login');
    }
  }, [closeDropdown, navigate]);

  // Close when clicking outside the component
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target!) &&
        buttonRef.current &&
        !buttonRef.current.contains(target!)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard handling: close on Escape, trap initial focus to menu when opened
  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape to close the menu
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
      }
    };

    // When opened, move focus to the first focusable element inside dropdown
    // This improves keyboard accessibility.
    const focusFirstItem = () => {
      requestAnimationFrame(() => {
        const root = dropdownRef.current;
        if (!root) return;
        const firstFocusable = root.querySelector<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) firstFocusable.focus();
        else root.focus(); // fallback
      });
    };

    document.addEventListener('keydown', onKeyDown);
    focusFirstItem();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, closeDropdown]);

  // If user not loaded yet, render nothing (could be a spinner if preferred)
  if (!currentUser) return null;

  // Accessible id for dropdown
  const dropdownId = `user-menu-${id}`;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {/* Avatar */}
        <div
          aria-hidden={!!currentUser.avatar}
          className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium overflow-hidden"
        >
          {currentUser.avatar ? (
            <img
              src={currentUser.avatar}
              alt={`${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span aria-hidden="false">{initials}</span>
          )}
        </div>

        {/* Name (hidden on small screens) */}
        <span className="hidden md:block text-sm font-medium text-gray-700">
          {currentUser.firstName ?? ''} {currentUser.lastName ?? ''}
        </span>

        {/* Chevron icon */}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={dropdownId}
            ref={dropdownRef}
            role="menu"
            aria-labelledby={buttonRef.current ? undefined : undefined}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.12 }}
            tabIndex={-1} // allow focusing the container if needed
            className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 focus:outline-none"
          >
            {/* User header inside dropdown */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium overflow-hidden">
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={`${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {currentUser.firstName ?? ''} {currentUser.lastName ?? ''}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{currentUser.email ?? ''}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                onClick={handleProfileClick}
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150"
              >
                <User size={16} className="text-gray-400" aria-hidden="true" />
                <span>Profile</span>
              </button>

              <button
                onClick={handleLogout}
                role="menuitem"
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150"
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

export default UserAvatar;
