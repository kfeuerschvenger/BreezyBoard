import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLogout } from '@tabler/icons-react';
import { ShellAction } from '@/app/layouts/shell/ShellAction';
import { useAuth } from '@/hooks/useAuth';
import {
  BreezePreferences,
  PasswordPanel,
  ProfileForm,
  ProfileSummary,
  SignOutCard,
  useProfile,
} from '@/features/users';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { useToast } from '@/shared/hooks/useToast';
import { Button, Icon, LoadingScreen } from '@/shared/ui';

/**
 * The profile: who the person is, what they can change about themselves, how
 * the interface behaves for them, and the way out.
 *
 * The cover, avatar and name come first, then two columns that stack below
 * about 800 pixels: "About you" on the left, and "Your breeze", the password
 * and the sign out card on the right. Sign out is also the view's action in
 * the header, where the other views keep theirs.
 */
const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, logout } = useAuth();
  useDocumentTitle('Profile | BreezyBoard');

  const profile = useProfile(user?._id ?? null);
  const { form, save, cancel, uploadAvatar } = profile;

  const onSubmit = form.handleSubmit(async values => {
    if (await save(values)) toast.show({ message: 'Profile saved.' });
  });

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (profile.isLoading) return <LoadingScreen label="Loading profile..." showLabel fill="parent" />;

  return (
    <div className="mx-auto flex w-full max-w-250 animate-bb-view flex-col gap-6 pb-8">
      <ShellAction>
        <Button type="button" size="sm" variant="secondary" onClick={signOut} leftIcon={<Icon as={IconLogout} size={18} />}>
          Sign out
        </Button>
      </ShellAction>

      <ProfileSummary
        values={form.watch()}
        userId={user?._id ?? ''}
        isUploadingAvatar={profile.isUploadingAvatar}
        onAvatarSelected={uploadAvatar}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-start gap-4.5">
        <ProfileForm form={form} error={profile.error} onSubmit={onSubmit} onCancel={cancel} />

        <div className="flex flex-col gap-4.5">
          <BreezePreferences />
          <PasswordPanel />
          <SignOutCard onSignOut={signOut} />
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
