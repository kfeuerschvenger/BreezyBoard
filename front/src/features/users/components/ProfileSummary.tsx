import React from 'react';
import { IconMapPin } from '@tabler/icons-react';
import { Cover, Icon } from '@/shared/ui';
import type { ProfileFormValues } from '../hooks/useProfile';
import { AvatarUploader } from './AvatarUploader';

export interface ProfileSummaryProps {
  /**
   * The form's current values rather than the stored record, because this
   * block updates as the fields are edited and is meant to.
   */
  values: ProfileFormValues;
  /** The id the avatar's colour is seeded from. */
  userId: string;
  isUploadingAvatar: boolean;
  onAvatarSelected: (file: File) => void;
}

/**
 * "March 2025", or nothing for a record with no joined date or one that does
 * not parse. `new Date('')` formats as the literal string "Invalid Date", and
 * a profile must never print that to the person. Finding P4-10.
 */
const formatBreezingSince = (dateString?: string): string | null => {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;

  return `Breezing since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
};

/**
 * The top of the profile: the cover, the avatar overlapping its lower edge,
 * the name and the line under it.
 *
 * It is a `header` inside the page's `main`, so a sectioning header and not a
 * second banner, and it holds the page's one `h1`. The cover is its gradient
 * until a cover image exists (Phase 8d) and is decoration. The name sits
 * wholly below the cover from `sm` up, because ink on the gradient would not
 * hold its contrast; below `sm` the avatar and the name stack and the name is
 * below it anyway.
 *
 * The avatar's controls are real: the camera button is 44 pixels and the input
 * behind it is named. An upload in flight is said in a status line.
 */
export const ProfileSummary: React.FC<ProfileSummaryProps> = ({ values, userId, isUploadingAvatar, onAvatarSelected }) => {
  const fullName = `${values.firstName ?? ''} ${values.lastName ?? ''}`.trim();
  const since = formatBreezingSince(values.createdAt);
  const work = [values.role, values.department].filter(Boolean).join(' · ');

  return (
    <header>
      <Cover hue="sky" className="h-55 rounded-hero" />

      <div className="-mt-14.5 flex flex-col gap-4 px-4 sm:flex-row sm:items-start sm:gap-5 sm:px-8">
        <AvatarUploader avatarUrl={values.avatar} name={fullName} seed={userId} onFileSelected={onAvatarSelected} />

        <div className="flex min-w-0 flex-col gap-1.5 sm:mt-16.5">
          <h1 className="font-heading text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-balance text-ink">
            {fullName || 'Your profile'}
          </h1>

          {work && <p className="text-[15px] text-ink-body">{work}</p>}

          {(values.location || since) && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-secondary">
              {values.location && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon as={IconMapPin} size={16} aria-hidden="true" />
                  {values.location}
                </span>
              )}
              {values.location && since && <span aria-hidden="true">·</span>}
              {since && <span>{since}</span>}
            </p>
          )}

          {/* Always in the page, so the message is announced when it arrives; hidden while it is empty. */}
          <p role="status" className="text-sm text-ink-secondary empty:hidden">
            {isUploadingAvatar ? 'Uploading avatar...' : ''}
          </p>
        </div>
      </div>
    </header>
  );
};

export default ProfileSummary;
