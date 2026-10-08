import React from 'react';
import { motion } from 'motion/react';
import { IconCalendar, IconMapPin } from '@tabler/icons-react';
import { Icon } from '@/shared/ui';
import type { ProfileFormValues } from '../hooks/useProfile';
import { AvatarUploader } from './AvatarUploader';

export interface ProfileSummaryProps {
  /**
   * The form's current values rather than the stored record, because this
   * card updates as the fields are edited and is meant to.
   */
  values: ProfileFormValues;
  isUploadingAvatar: boolean;
  onAvatarSelected: (file: File) => void;
}

/**
 * A record with no joined date reached `new Date('')`, which formats as the
 * literal string "Invalid Date". Every other missing field here has a
 * fallback; this one printed the error to the person. Finding P4-10.
 */
const formatJoined = (dateString?: string) => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export const ProfileSummary: React.FC<ProfileSummaryProps> = ({ values, isUploadingAvatar, onAvatarSelected }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-1">
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="text-center mb-6">
        <AvatarUploader
          avatarUrl={values.avatar}
          name={`${values.firstName ?? ''} ${values.lastName ?? ''}`}
          onFileSelected={onAvatarSelected}
        />

        <h2 className="text-xl font-bold text-gray-900 font-heading">
          {values.firstName} {values.lastName}
        </h2>
        <p className="text-gray-600 font-body">{values.role}</p>
        <p className="text-sm text-gray-500">{values.department}</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Icon as={IconCalendar} size={16} className="text-gray-400" aria-hidden="true" />
          <span className="text-gray-600">Joined {formatJoined(values.createdAt)}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Icon as={IconMapPin} size={16} className="text-gray-400" aria-hidden="true" />
          <span className="text-gray-600">{values.location || 'Unknown'}</span>
        </div>
        {isUploadingAvatar && <div className="text-sm text-gray-500">Uploading avatar...</div>}
      </div>
    </div>
  </motion.div>
);

export default ProfileSummary;
