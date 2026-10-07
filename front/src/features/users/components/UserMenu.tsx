import React from 'react';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, Menu, MenuItem } from '@/shared/ui';
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
  const fullName = fullNameOf(user);

  return (
    <Menu
      className="w-64 py-2"
      renderTrigger={(props, { open }) => (
        <button
          {...props}
          aria-label={`Account menu for ${fullName}`}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
        >
          <Avatar name={fullName} src={user.avatar} size="md" decorative />
          <span className="hidden md:block text-sm font-medium text-gray-700">{fullName}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Avatar name={fullName} src={user.avatar} size="lg" decorative />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{fullName}</p>
            <p className="text-xs text-gray-500 truncate">{user.email ?? ''}</p>
          </div>
        </div>
      </div>

      <div className="py-1">
        <MenuItem onSelect={onProfile}>
          <UserIcon size={16} className="text-gray-400" aria-hidden="true" />
          <span>Profile</span>
        </MenuItem>

        <MenuItem onSelect={onLogout} className="text-red-600 hover:bg-red-50">
          <LogOut size={16} className="text-red-500" aria-hidden="true" />
          <span>Log out</span>
        </MenuItem>
      </div>
    </Menu>
  );
};

export default UserMenu;
