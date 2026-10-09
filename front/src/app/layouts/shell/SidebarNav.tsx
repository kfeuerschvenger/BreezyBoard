import { NavLink } from 'react-router-dom';
import { IconHome2 } from '@tabler/icons-react';
import type { Icon as TablerGlyph } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';

interface NavEntry {
  to: string;
  label: string;
  icon: TablerGlyph;
}

/**
 * The places the sidebar always offers. Notes joins this list when the page
 * it points to exists: an entry here is a link people can follow, so one is
 * never added ahead of its destination.
 */
const PRIMARY_NAV: NavEntry[] = [{ to: '/', label: 'Home', icon: IconHome2 }];

const ITEM_CLASSES =
  'focus-ring flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-semibold transition-colors duration-200 lg:min-h-10';

export const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => (
  <nav aria-label="Main">
    <ul className="flex flex-col gap-0.5">
      {PRIMARY_NAV.map(({ to, label, icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              `${ITEM_CLASSES} ${
                isActive
                  ? 'bg-surface text-ink shadow-nav-active'
                  : 'text-ink-secondary hover:bg-surface/95 hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon as={icon} size={19} className={isActive ? 'text-accent' : ''} />
                {label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

export default SidebarNav;
