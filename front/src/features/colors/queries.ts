import { useQuery } from '@tanstack/react-query';
import { ColorService } from '@/services';

export type ColorType = 'board' | 'task' | 'column';

/**
 * Keyed by type, because the three palettes are three different lists behind
 * one endpoint. A key that dropped the type would hand a board its task
 * colours, and only on the second palette anything asked for.
 */
export const colorKeys = {
  byType: (type: ColorType) => ['colors', type] as const,
};

/**
 * The colour palettes are seeded reference data: a fixed list that no part of
 * the product writes to. `staleTime: Infinity` states that, so opening a
 * fourth drawer costs nothing and a window regaining focus does not refetch a
 * list that cannot have changed.
 */
export const useColors = (type: ColorType) =>
  useQuery({
    queryKey: colorKeys.byType(type),
    queryFn: () => ColorService.getByType(type),
    staleTime: Infinity,
  });
