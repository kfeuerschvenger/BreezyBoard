import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserService } from '@/services';
import { asBreezeLevel, DEFAULT_BREEZE } from './breeze';
import type { BreezeLevel } from './breeze';

/**
 * Keyed on the person, under a root of its own. A key under the user's
 * detail key would be invalidated by every profile save, which would refetch
 * the whole record to learn one value the cache already holds.
 */
export const breezeKeys = {
  forUser: (userId: string) => ['breeze', userId] as const,
};

export interface UseBreezeSettingResult {
  /** What the person chose, whatever the device is doing about motion. */
  level: BreezeLevel;
  setLevel: (level: BreezeLevel, onError?: () => void) => void;
}

/**
 * The stored Breeze setting, read from the cache and written optimistically.
 *
 * The first value comes with the signed in user, so the page paints with the
 * right wind and nothing is fetched to learn it. A choice is written to the
 * cache at once and sent in the background: the control is a segmented
 * choice, and one that waits on the network to move reads as broken.
 *
 * A failed write puts the value back, but only if nothing newer has been
 * chosen since. Choosing Gusty and then Calm, with Gusty failing late, must
 * not undo Calm. It then asks the server what is stored, because "what it was
 * before this choice" is not always what is stored: two failures in a row
 * would otherwise leave the control showing a choice that was never saved.
 */
export function useBreezeSetting(userId: string | null, initial: unknown): UseBreezeSettingResult {
  const queryClient = useQueryClient();
  const key = breezeKeys.forUser(userId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: async () => asBreezeLevel((await UserService.getById(userId as string)).breeze),
    initialData: asBreezeLevel(initial),
    staleTime: Infinity,
    enabled: Boolean(userId),
  });

  const mutation = useMutation({
    mutationFn: (level: BreezeLevel) => UserService.update(userId as string, { breeze: level }),
    onMutate: async level => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BreezeLevel>(key) ?? DEFAULT_BREEZE;
      queryClient.setQueryData<BreezeLevel>(key, level);
      return { previous };
    },
    onError: (_error, level, context) => {
      if (queryClient.getQueryData<BreezeLevel>(key) !== level) return;
      queryClient.setQueryData<BreezeLevel>(key, context?.previous ?? DEFAULT_BREEZE);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const { mutate } = mutation;
  const setLevel = useCallback(
    (level: BreezeLevel, onError?: () => void) => {
      if (!userId) return;
      mutate(level, { onError });
    },
    [userId, mutate],
  );

  return { level: query.data, setLevel };
}
