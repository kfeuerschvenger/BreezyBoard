import React from 'react';
import { IconChevronUp, IconLogout, IconUser } from '@tabler/icons-react';
import { Avatar, Menu, MenuItem, Icon } from '@/shared/ui';
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
 * It is drawn as the account button at the foot of the sidebar: the avatar,
 * the name and a chevron on a translucent row the width of the sidebar. The
 * menu opens upward from it, because there is no room below the foot of the
 * screen.
 *
 * The trigger carries an explicit name rather than taking one from its
 * contents. Its contents are an avatar, which is decorative, and a name that
 * is cut short with an ellipsis, and a name taken from them would read as two
 * initials where an avatar image stands in for them. The explicit one also
 * says what the button does, which the person's name alone does not.
 */
export const UserMenu: React.FC<UserMenuProps> = ({ user, onProfile, onLogout }) => {
  const fullName = fullNameOf(user);

  return (
    <Menu
      align="start"
      className="w-64 py-2"
      renderTrigger={(props, { open }) => (
        <button
          {...props}
          aria-label={`Account menu for ${fullName}`}
          className="focus-ring flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-card border border-line-05 bg-surface/70 px-2.5 text-left transition-colors duration-200 hover:bg-surface"
        >
          <Avatar name={fullName} src={user.avatar} seed={user._id} size="md" decorative />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={fullName}>
            {fullName}
          </span>
          <Icon
            as={IconChevronUp}
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-ink-secondary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    >
      <div className="border-b border-line-08 px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={fullName} src={user.avatar} seed={user._id} size="lg" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink" title={fullName}>
              {fullName}
            </p>
            <p className="truncate text-xs text-ink-secondary" title={user.email ?? undefined}>
              {user.email ?? ''}
            </p>
          </div>
        </div>
      </div>

      <div className="py-1">
        <MenuItem onSelect={onProfile}>
          <Icon as={IconUser} size={16} className="text-ink-tertiary" aria-hidden="true" />
          <span>Profile</span>
        </MenuItem>

        <MenuItem onSelect={onLogout} className="text-danger hover:bg-danger-bg">
          <Icon as={IconLogout} size={16} className="text-danger" aria-hidden="true" />
          <span>Log out</span>
        </MenuItem>
      </div>
    </Menu>
  );
};

export default UserMenu;
