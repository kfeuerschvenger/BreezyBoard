import React from 'react';
import { IconLogout } from '@tabler/icons-react';
import { Button, Icon } from '@/shared/ui';
import { ProfilePanel } from './ProfilePanel';

export interface SignOutCardProps {
  onSignOut: () => void;
}

/**
 * The way out, at the foot of the profile. The header offers the same action
 * for a person who has not scrolled; both call the same handler.
 */
export const SignOutCard: React.FC<SignOutCardProps> = ({ onSignOut }) => (
  <ProfilePanel title="Sign out" description="Leave this device. Your boards will be here when you come back.">
    <Button type="button" variant="secondary" onClick={onSignOut} leftIcon={<Icon as={IconLogout} size={18} />}>
      Sign out
    </Button>
  </ProfilePanel>
);

export default SignOutCard;
