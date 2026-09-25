import React from 'react';
import { Save } from 'lucide-react';

export interface ProfileActionsProps {
  isDirty: boolean;
  isValid: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  /**
   * Given for the pair rendered outside the form, where the button cannot
   * submit. Omitted inside it, where the button is the form's submit and
   * pressing Enter in a field still works.
   */
  onSave?: () => void;
}

/**
 * Cancel and save, rendered twice: once in the page header and once at the
 * foot of the form, for a narrow screen where the header pair is off the top.
 * They were written out twice, and the two copies had drifted into disabling
 * themselves on different conditions.
 */
export const ProfileActions: React.FC<ProfileActionsProps> = ({
  isDirty,
  isValid,
  isSubmitting,
  onCancel,
  onSave,
}) => (
  <>
    <button
      type="button"
      onClick={onCancel}
      disabled={isSubmitting || !isDirty}
      className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      Cancel
    </button>

    <button
      type={onSave ? 'button' : 'submit'}
      onClick={onSave}
      disabled={!isValid || !isDirty || isSubmitting}
      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      {isSubmitting ? (
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      ) : (
        <Save size={16} aria-hidden="true" />
      )}
      <span className="md:hidden">{isSubmitting ? 'Saving...' : 'Save'}</span>
      <span className="hidden md:inline">{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
    </button>
  </>
);

export default ProfileActions;
