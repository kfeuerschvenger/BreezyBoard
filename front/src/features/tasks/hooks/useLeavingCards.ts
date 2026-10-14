import { useCallback, useState } from 'react';
import type { Task } from '@/models';

/** A deleted card that is still on screen playing its exit, and the card that was below it. */
export interface LeavingCard {
  task: Task;
  /** The card that stood directly below it in its column, or null when it was last. */
  beforeId: string | null;
}

export interface UseLeavingCardsResult {
  leaving: LeavingCard[];
  /** A card has left the list: keep a picture of it on the board until it has gone. */
  leave: (card: LeavingCard) => void;
  /** Its exit is over. */
  end: (taskId: string) => void;
}

/**
 * The cards that have been deleted and are still playing their exit.
 *
 * The task list is the truth about the board and a deleted task is no longer
 * in it, so the card that is leaving is held apart, as a picture with the place
 * it stood in. It is not a task: nothing counts it, drags it or opens it, and
 * the column closes the gap it leaves once `end` removes it.
 */
export const useLeavingCards = (): UseLeavingCardsResult => {
  const [leaving, setLeaving] = useState<LeavingCard[]>([]);

  const leave = useCallback(
    (card: LeavingCard) =>
      setLeaving(current => [...current.filter(entry => entry.task._id !== card.task._id), card]),
    [],
  );

  const end = useCallback(
    (taskId: string) => setLeaving(current => current.filter(entry => entry.task._id !== taskId)),
    [],
  );

  return { leaving, leave, end };
};

export default useLeavingCards;
