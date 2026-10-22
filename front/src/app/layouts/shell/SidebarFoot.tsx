import { IconBrandGithub, IconBrandLinkedin, IconMail } from '@tabler/icons-react';
import type { Icon as TablerGlyph } from '@tabler/icons-react';
import LegalLinks from '@/components/LegalLinks';
import UserAvatar from '@/components/UserAvatar';
import { Icon } from '@/shared/ui';

interface ContactLink {
  href: string;
  label: string;
  title: string;
  icon: TablerGlyph;
  external: boolean;
}

const CONTACT_LINKS: ContactLink[] = [
  {
    href: 'https://www.linkedin.com/in/kevin-feuerschvenger/',
    label: 'LinkedIn profile',
    title: 'LinkedIn profile',
    icon: IconBrandLinkedin,
    external: true,
  },
  {
    href: 'https://github.com/kfeuerschvenger',
    label: 'GitHub profile',
    title: 'GitHub profile',
    icon: IconBrandGithub,
    external: true,
  },
  { href: 'mailto:kfeuerschvenger@gmail.com', label: 'Send email', title: 'Email me', icon: IconMail, external: false },
];

/**
 * The foot of the sidebar: the account, then what a page footer used to hold.
 *
 * The account button opens the menu with the profile and the way out. Under it
 * are the two legal documents, the author's name and the three ways to reach
 * the author. None of it is a `footer` element: the sidebar is chrome around
 * the page, and a page that has no footer of its own, the board, must not be
 * reported as having one.
 */
export const SidebarFoot = () => (
  <div className="flex flex-col gap-1">
    <UserAvatar />

    <div className="flex items-center justify-between gap-1">
      <div className="flex min-w-0 items-center">
        <LegalLinks />
      </div>

      <ul className="flex shrink-0 items-center">
        {CONTACT_LINKS.map(({ href, label, title, icon, external }) => (
          <li key={href}>
            <a
              href={href}
              aria-label={label}
              title={title}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="focus-ring inline-flex size-6 items-center justify-center rounded-chip text-ink-secondary transition-colors hover:bg-line-06 hover:text-ink"
            >
              <Icon as={icon} size={16} />
            </a>
          </li>
        ))}
      </ul>
    </div>

    <p className="px-1 font-mono text-[11px] text-ink-tertiary">{new Date().getFullYear()} Kevin Feuerschvenger</p>
  </div>
);

export default SidebarFoot;
