import React from 'react';
import { IconWind } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';

export interface AuthBannerProps {
  children: React.ReactNode;
}

/**
 * The failure a form cannot predict: refused credentials, a request that did
 * not go through. A field's own mistake is written under the field, never here.
 *
 * It is an alert, so a screen reader announces it as it appears, and it rises
 * in on `bbUp` to match the shake of the form around it. The text is the
 * danger step on its own tint, above 7:1.
 */
export const AuthBanner: React.FC<AuthBannerProps> = ({ children }) => (
  <div
    role="alert"
    className="flex animate-bb-up items-center gap-2 rounded-control bg-danger-bg px-3.5 py-2.5 text-sm font-medium text-danger-strong"
  >
    <Icon as={IconWind} size={17} className="shrink-0" />
    {children}
  </div>
);

export default AuthBanner;
