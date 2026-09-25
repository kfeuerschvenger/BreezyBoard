import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import SuccessModal from '@/components/SuccessModal';
import { useAuth } from '@/hooks/useAuth';
import { ProfileActions, ProfileForm, ProfileSummary, useProfile } from '@/features/users';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const profile = useProfile(user?._id ?? null);
  const { form, save, cancel, uploadAvatar } = profile;
  const {
    handleSubmit,
    watch,
    formState: { isDirty, isValid, isSubmitting },
  } = form;

  const [savedOpen, setSavedOpen] = React.useState(false);

  const onSubmit = handleSubmit(async values => {
    if (await save(values)) setSavedOpen(true);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your account information and preferences"
        showBackButton
        onBack={() => navigate('/')}
      >
        {/* The header pair appears only once there is something to save. */}
        {!profile.isLoading && isDirty && (
          <div className="flex items-center gap-3">
            <ProfileActions
              isDirty={isDirty}
              isValid={isValid}
              isSubmitting={isSubmitting}
              onCancel={cancel}
              onSave={onSubmit}
            />
          </div>
        )}
      </PageHeader>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <ProfileSummary values={watch()} isUploadingAvatar={profile.isUploadingAvatar} onAvatarSelected={uploadAvatar} />

          <ProfileForm form={form} error={profile.error} onSubmit={onSubmit} onCancel={cancel} />
        </div>
      </div>

      <SuccessModal
        open={savedOpen}
        onClose={() => setSavedOpen(false)}
        title="Profile saved"
        message="Your profile has been updated successfully."
      />
    </div>
  );
};

export default ProfilePage;
