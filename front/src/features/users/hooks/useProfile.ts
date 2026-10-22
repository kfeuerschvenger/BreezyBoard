import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import type { User as UserModel } from '@/models';
import { apiErrorCodeOf } from '@/shared/lib/httpStatus';
import { useUpdateUser, useUploadAvatar, useUser } from '../queries';

/**
 * What to tell the person about a refused avatar upload. The two refusals the
 * server answers with a 400 cannot be fixed by trying the same file again, so
 * "try again" would send the person round in a circle; anything else keeps the
 * generic wording.
 */
const avatarFailureMessage = (error: unknown): string => {
  switch (apiErrorCodeOf(error)) {
    case 'FILE_TOO_LARGE':
      return 'That image is too large. Choose one under 6 MB.';
    case 'INVALID_FILE_TYPE':
      return 'That file is not an image. Choose a PNG, JPEG, WebP or GIF.';
    default:
      return 'Avatar upload failed. Please try again.';
  }
};

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
  // The session holds its own copy of the person, which the sidebar and the
  // greeting read. A write here has to reach it, or they show the old name and
  // picture until the page is reloaded.
  const { user: sessionUser, updateUser: updateSession } = useAuth();

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
  // which the fetch-once effect it replaced could not do. A field the person
  // has changed and not saved keeps what they typed: a picture upload refreshes
  // the record while they are in the middle of the form, and a plain reset
  // would throw their typing away.
  useEffect(() => {
    if (!profileQuery.data) return;
    reset(toFormValues(profileQuery.data), { keepDirtyValues: true });
  }, [profileQuery.data, reset]);

  const save = async (values: ProfileFormValues): Promise<boolean> => {
    if (!userId) {
      setWriteError('User not available.');
      return false;
    }

    setWriteError(null);
    try {
      // Named field by field rather than spread, so `createdAt` cannot be
      // sent back to a server that does not accept it. The avatar is not among
      // them: the upload stores the picture itself, and the form holds the
      // address the API answers with for drawing, which is absolute and built
      // from the request. Written back, it would replace the stored path with
      // an address that stops being right the day the site moves.
      const saved = await updateUser.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        location: values.location,
        role: values.role,
        department: values.department,
      });
      if (sessionUser) updateSession({ ...sessionUser, ...saved });
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
      // The server stored the picture on the record as the upload finished,
      // before the form is saved, so the session learns of it now.
      if (sessionUser) updateSession({ ...sessionUser, avatar: avatarUrl });
      // Not dirty: the picture is already stored, so there is nothing for Save
      // to keep.
      setValue('avatar', avatarUrl, { shouldDirty: false, shouldValidate: true });
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setWriteError(avatarFailureMessage(err));
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
