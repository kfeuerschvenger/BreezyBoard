import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User as UserModel } from '@/models';
import { useUpdateUser, useUploadAvatar, useUser } from '../queries';

/**
 * The editable profile. `createdAt` rides along for display only and is never
 * part of what is sent back, which the save payload below is explicit about.
 */
const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Email is invalid'),
  location: z.string().optional().or(z.literal('')),
  role: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  avatar: z.string().optional().or(z.literal('')),
  createdAt: z.string().optional().or(z.literal('')),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export interface UseProfileResult {
  form: UseFormReturn<ProfileFormValues>;
  isLoading: boolean;
  isUploadingAvatar: boolean;
  /** The one message worth showing, whether the read or a write produced it. */
  error: string | null;
  save: (values: ProfileFormValues) => Promise<boolean>;
  cancel: () => void;
  uploadAvatar: (file: File) => Promise<void>;
}

const EMPTY_VALUES: ProfileFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  location: '',
  role: '',
  department: '',
  avatar: '',
  createdAt: '',
};

/**
 * One mapping, used by the fill below and by cancel.
 *
 * It used to be written out twice, once in the fetching effect and once in
 * the cancel handler, with the second copy quietly missing `createdAt`, so
 * cancelling blanked the joined date until the page was reloaded.
 */
const toFormValues = (data: UserModel): ProfileFormValues => ({
  firstName: data.firstName ?? '',
  lastName: data.lastName ?? '',
  email: data.email ?? '',
  location: data.location ?? '',
  role: data.role ?? '',
  department: data.department ?? '',
  avatar: data.avatar ?? '',
  createdAt: data.createdAt ?? '',
});

/**
 * The signed-in person's profile: the record, the form over it, and the two
 * writes that change it.
 */
export function useProfile(userId: string | null): UseProfileResult {
  const profileQuery = useUser(userId);
  const updateUser = useUpdateUser(userId);
  const avatarUpload = useUploadAvatar(userId);

  // Only failures this page causes itself. A failed read is reported by the
  // query rather than kept in a second piece of state to be cleared by hand.
  const [writeError, setWriteError] = useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
    defaultValues: EMPTY_VALUES,
  });

  const { reset, setValue } = form;

  // Fill the form from whatever the cache holds. This also runs after the
  // window regains focus and the record turns out to have changed elsewhere,
  // which the fetch-once effect it replaced could not do.
  useEffect(() => {
    if (!profileQuery.data) return;
    reset(toFormValues(profileQuery.data), { keepDirty: false });
  }, [profileQuery.data, reset]);

  const save = async (values: ProfileFormValues): Promise<boolean> => {
    if (!userId) {
      setWriteError('User not available.');
      return false;
    }

    setWriteError(null);
    try {
      // Named field by field rather than spread, so `createdAt` cannot be
      // sent back to a server that does not accept it.
      await updateUser.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        location: values.location,
        role: values.role,
        department: values.department,
        avatar: values.avatar,
      });
      reset(values, { keepDirty: false });
      return true;
    } catch (err) {
      console.error('Failed to update profile:', err);
      setWriteError('Failed to update profile. Please try again.');
      return false;
    }
  };

  /**
   * Resets from the cache rather than refetching. The cached record is the
   * last thing the server confirmed, since every write here invalidates it,
   * and that is precisely what cancel means: put the form back to what is
   * actually stored.
   */
  const cancel = () => {
    if (!profileQuery.data) return;
    setWriteError(null);
    reset(toFormValues(profileQuery.data), { keepDirty: false });
  };

  const uploadAvatar = async (file: File) => {
    if (!userId) return;
    setWriteError(null);

    try {
      const avatarUrl = await avatarUpload.mutateAsync(file);
      setValue('avatar', avatarUrl, { shouldDirty: true, shouldValidate: true });
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setWriteError('Avatar upload failed. Please try again.');
    }
  };

  return {
    form,
    isLoading: profileQuery.isPending && Boolean(userId),
    isUploadingAvatar: avatarUpload.isPending,
    error: !userId
      ? 'User not found in auth context.'
      : (writeError ?? (profileQuery.isError ? 'Failed to load profile. Please try again later.' : null)),
    save,
    cancel,
    uploadAvatar,
  };
}

export default useProfile;
