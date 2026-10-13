/**
 * Reads the board's cards off the screen, which is the one place the drop
 * slot needs the document.
 *
 * The column body carries `data-column-body` and each card `data-task-card`
 * with the task's id, so the lookup names a column and its cards without the
 * hook holding a ref to either. The held card is skipped by id: while it is
 * carried it takes no room in its column, so it has no midpoint to count.
 */
export function readMidpoints(columnId: string, heldId: string): number[] {
  const body = document.querySelector(`[data-column-body="${CSS.escape(columnId)}"]`);
  if (!body) return [];

  return Array.from(body.querySelectorAll<HTMLElement>('[data-task-card]'))
    .filter(card => card.dataset.taskCard !== heldId)
    .map(card => {
      const { top, height } = card.getBoundingClientRect();
      return top + height / 2;
    });
}
