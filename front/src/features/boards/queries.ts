import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoardService, DashboardService, TemplateService } from '@/services';
import type { Board } from '@/models';

/**
 * Query keys for everything board shaped, in one place.
 *
 * Kept as a single object rather than spelled out at each call site so that
 * invalidating after a write cannot miss a key by typing it differently.
 * That mistake shows up as a list that quietly fails to refresh, which is
 * the same symptom as no cache at all and much harder to find.
 */
export const boardKeys = {
  all: ['boards'] as const,
  list: () => [...boardKeys.all, 'list'] as const,
  stats: () => ['dashboard', 'stats'] as const,
  templates: () => ['templates'] as const,
};

/**
 * The board templates. Seeded reference data that no part of the product
 * writes to, so an infinite stale time states the fact and stops a second
 * consumer asking for a list the first one already holds.
 */
export const useTemplates = (enabled = true) =>
  useQuery({
    queryKey: boardKeys.templates(),
    queryFn: () => TemplateService.getAll(),
    staleTime: Infinity,
    // Gated, because the only thing that needs templates is the create board
    // dialog and that dialog is mounted closed on every dashboard load.
    // Ungated it costs a request on every visit for a list most visits never
    // look at, which the effect it replaced avoided by fetching on open.
    enabled,
  });

export const useBoards = () =>
  useQuery({
    queryKey: boardKeys.list(),
    queryFn: () => BoardService.getAll(),
  });

export const useDashboardStats = () =>
  useQuery({
    queryKey: boardKeys.stats(),
    queryFn: () => DashboardService.getStats(),
  });

/**
 * Everything that changes a board invalidates the same two keys, because
 * every one of them moves both the list and the totals on the dashboard.
 * Creating a board changes the board count, deleting one changes the task
 * count and the average progress, and adding a member changes the member
 * count.
 */
const useBoardMutation = <TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardKeys.list() }),
        queryClient.invalidateQueries({ queryKey: boardKeys.stats() }),
      ]);
    },
  });
};

export const useCreateBoard = () =>
  useBoardMutation((board: Pick<Board, 'title' | 'description' | 'color' | 'template'>) => BoardService.create(board));

export const useDeleteBoard = () => useBoardMutation((boardId: string) => BoardService.delete(boardId));

export const useAddBoardMembers = () =>
  useBoardMutation(({ boardId, memberIds }: { boardId: string; memberIds: string[] }) =>
    BoardService.addMembers(boardId, memberIds)
  );
