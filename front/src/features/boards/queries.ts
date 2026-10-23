import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoardService, DashboardService, TemplateService } from '@/services';
import { userKeys } from '@/features/users';
import type { Board } from '@/models';
import type { ColumnChange } from './boardColumns';

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
  // One board as the board page reads it. Not under `all`: invalidating the
  // list must not refetch a board page that is open in another tab of the
  // same cache, and the page invalidates its own key when it needs to.
  detail: (boardId: string) => ['board', boardId] as const,
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

export const useBoard = (boardId?: string) =>
  useQuery({
    queryKey: boardKeys.detail(boardId ?? ''),
    queryFn: () => BoardService.getById(boardId as string),
    enabled: Boolean(boardId),
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

/**
 * The fields an edit can change. The template only seeds columns, so it is not
 * among them. `columns` is the complete new list in its new order, and a save
 * that leaves it out leaves the columns alone.
 */
export type BoardChanges = Partial<Pick<Board, 'title' | 'description'>> & { color?: string; columns?: ColumnChange[] };

/**
 * Saves an edit and writes it into both caches that hold the board.
 *
 * The response is not stored whole. The server answers a PUT with the members
 * populated and no `viewerRole`, a different shape from the read the board
 * page holds, and replacing the cached board with it would silently drop the
 * role and swap the members for objects the page never asked for. What
 * changed is the title, the description, the colour and, when the request
 * carried them, the columns, so those are merged into what each cache already
 * has. The dashboard list and the board page therefore agree straight away,
 * with no refetch: the totals do not depend on any of them, so the stats are
 * left alone.
 */
export const useUpdateBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boardId, changes }: { boardId: string; changes: BoardChanges }) =>
      BoardService.update(boardId, changes),
    onSuccess: (updated, { boardId, changes }) => {
      const merge = <T extends Pick<Board, 'title' | 'description' | 'color'>>(board: T): T => ({
        ...board,
        title: updated.title,
        description: updated.description,
        color: updated.color,
        ...(changes.columns && { columns: updated.columns }),
      });

      queryClient.setQueryData<Board>(boardKeys.detail(boardId), previous => previous && merge(previous));
      queryClient.setQueryData<Board[]>(boardKeys.list(), previous =>
        previous?.map(board => (board._id === boardId ? merge(board) : board))
      );
    },
  });
};

export const useCreateBoard = () =>
  useBoardMutation((board: Pick<Board, 'title' | 'description' | 'color' | 'template'>) => BoardService.create(board));

/**
 * A soft delete on the server. The board's own cache entry goes with it, so
 * going back to its address fetches fresh and meets the 404 instead of
 * showing a board that is no longer there. Its tasks stay cached: the server
 * keeps them untouched, and a restore makes them valid again as they are.
 */
export const useDeleteBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => BoardService.delete(boardId),
    onSuccess: async (_result, boardId) => {
      queryClient.removeQueries({ queryKey: boardKeys.detail(boardId) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardKeys.list() }),
        queryClient.invalidateQueries({ queryKey: boardKeys.stats() }),
      ]);
    },
  });
};

/** Brings back a soft deleted board; the list and the totals count it again. */
export const useRestoreBoard = () => useBoardMutation((boardId: string) => BoardService.restore(boardId));

/**
 * Besides the list and the totals, adding people changes the board page's own
 * read, which carries the member count, and the list of people a task on that
 * board can be given to. Both are held for thirty seconds, so without their
 * invalidation a person added from the board page would be missing from the
 * task form's owner picker until the cache aged out.
 */
export const useAddBoardMembers = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boardId, memberIds }: { boardId: string; memberIds: string[] }) =>
      BoardService.addMembers(boardId, memberIds),
    onSuccess: async (_result, { boardId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardKeys.list() }),
        queryClient.invalidateQueries({ queryKey: boardKeys.stats() }),
        queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
        queryClient.invalidateQueries({ queryKey: userKeys.boardMembers(boardId) }),
      ]);
    },
  });
};
