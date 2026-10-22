import React from 'react';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { Button, Icon } from '@/shared/ui';

export interface ProfileActionsProps {
  isDirty: boolean;
  isValid: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
}

/**
 * Cancel and save, at the foot of the About panel. Save is the form's submit,
 * so pressing Enter in a field saves too. Neither does anything until there is
 * a change to keep or to drop.
 */
export const ProfileActions: React.FC<ProfileActionsProps> = ({ isDirty, isValid, isSubmitting, onCancel }) => (
  <>
    <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting || !isDirty}>
      Cancel
    </Button>

    <Button
      type="submit"
      isLoading={isSubmitting}
      disabled={!isValid || !isDirty}
      leftIcon={isSubmitting ? undefined : <Icon as={IconDeviceFloppy} size={18} />}
    >
      {isSubmitting ? 'Saving...' : 'Save changes'}
    </Button>
  </>
);

export default ProfileActions;
