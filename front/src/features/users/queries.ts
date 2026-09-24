import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserService } from '@/services';
import type { User } from '@/models';

export const userKeys = {
  detail: (userId: string) => ['user', userId] as const,
};

export const useUser = (userId: string | null) =>
  useQuery({
    queryKey: userKeys.detail(userId ?? ''),
    queryFn: () => UserService.getById(userId as string),
    enabled: Boolean(userId),
  });

/**
 * Both writes below invalidate the same key, so the cache holds what the
 * server actually stored rather than what the form believed it sent.
 *
 * That is what lets the profile page's cancel button reset from the cache
 * instead of refetching: the cached record is the last thing the server
 * confirmed, which is exactly what cancel means.
 */
const useUserMutation = <TArgs, TResult>(userId: string | null, mutationFn: (args: TArgs) => Promise<TResult>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (!userId) return;
      await queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
};

export const useUpdateUser = (userId: string | null) =>
  useUserMutation(userId, (payload: Partial<User>) => UserService.update(userId as string, payload));

export const useUploadAvatar = (userId: string | null) =>
  useUserMutation(userId, (file: File) => UserService.uploadAvatar(userId as string, file));
