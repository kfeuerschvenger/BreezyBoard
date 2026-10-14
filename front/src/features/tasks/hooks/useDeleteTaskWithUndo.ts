import type { Task } from '@/models';
import { TaskService } from '@/services';
import { byOrder } from '@/features/board';
import { useToast } from '@/shared/hooks/useToast';
import { httpStatusOf } from '@/shared/lib/httpStatus';
import type { TaskCache } from './useTaskMover';

/** The cache as deletion needs it: the list itself, to remove from and to put back into. */
export interface DeletionCache extends TaskCache {
  read: () => Task[] | undefined;
}

export interface UseDeleteTaskWithUndoOptions {
  cache: DeletionCache;
}

export interface UseDeleteTaskWithUndoResult {
  /** Rejects when the delete fails, so the caller can say so where the person is looking. */
  deleteTask: (task: Task) => Promise<void>;
}

/** What it takes to make the same card again, and where it stood. */
interface Snapshot {
  boardId: string;
  payload: Partial<Task>;
  /** The cards above and below it in its column when it was deleted. */
  afterId: string | null;
  beforeId: string | null;
}

const idOf = (reference: { _id?: string } | string | undefined): string | undefined =>
  typeof reference === 'object' ? reference?._id : reference;

const snapshotOf = (task: Task, column: Task[]): Snapshot => {
  const index = column.findIndex(other => other._id === task._id);

  return {
    boardId: task.boardId,
    payload: {
      title: task.title,
      ...(task.description !== undefined && { description: task.description }),
      status: task.status,
      priority: task.priority,
      color: idOf(task.color),
      owner: idOf(task.owner),
      checklist: (task.checklist ?? []).map(({ text, completed }) => ({ text, completed })),
    },
    afterId: index > 0 ? column[index - 1]._id : null,
    beforeId: index >= 0 && index < column.length - 1 ? column[index + 1]._id : null,
  };
};

/**
 * Deleting a card, with the way back that the toast offers.
 *
 * The server deletes a task for good, so "Catch it" makes the card again from
 * what it held: the title, description, priority, colour, owner, column and
 * checklist. The copy is a new document, with a new id and a new creation
 * date, and it is put back between the two cards that were its neighbours
 * when it was deleted. If those have moved, or the move fails, it stays at the
 * foot of its column, which is where the server puts any new card.
 *
 * Everything the toast needs is captured when it is made, because the page
 * that raised it may be gone by the time it is pressed. A failed catch says
 * so, and offers to try again only when trying again can change the answer:
 * a 400, 403 or 404 means the board no longer takes the card (its owner left
 * the board, the board was deleted, the person lost access), and the same
 * request would be refused again.
 */
export const useDeleteTaskWithUndo = ({ cache }: UseDeleteTaskWithUndoOptions): UseDeleteTaskWithUndoResult => {
  const toast = useToast();

  const catchIt = async (snapshot: Snapshot): Promise<void> => {
    const title = snapshot.payload.title ?? 'The card';

    try {
      let created = await TaskService.create(snapshot.boardId, snapshot.payload);

      const current = cache.read();
      // A board whose list is not held any more has nothing to add to: the
      // next read of it asks the server, which already has the card.
      if (current) cache.write([...current, created]);
      else await cache.refetch();

      if (current && (snapshot.afterId || snapshot.beforeId)) {
        try {
          created = await TaskService.move(created._id, created.status, {
            afterId: snapshot.afterId,
            beforeId: snapshot.beforeId,
          });
          cache.replace(created);
        } catch {
          // The card is back, only lower than it was.
        }
      }

      toast.show({ message: `Caught "${title}".` });
    } catch (error) {
      const status = httpStatusOf(error);

      if (status === 400 || status === 403 || status === 404) {
        toast.show({ message: `"${title}" can no longer be brought back.` });
        return;
      }

      toast.show({
        message: `"${title}" could not be brought back.`,
        action: { label: 'Try again', onAction: () => void catchIt(snapshot) },
      });
    }
  };

  const deleteTask = async (task: Task): Promise<void> => {
    const list = cache.read() ?? [];
    const snapshot = snapshotOf(
      task,
      list.filter(other => other.status === task.status).sort(byOrder),
    );

    await TaskService.delete(task._id);

    // Read again: the list may have changed while the request was in flight.
    cache.write((cache.read() ?? []).filter(other => other._id !== task._id));
    toast.show({ message: 'Card blown away.', action: { label: 'Catch it', onAction: () => void catchIt(snapshot) } });
  };

  return { deleteTask };
};

export default useDeleteTaskWithUndo;
