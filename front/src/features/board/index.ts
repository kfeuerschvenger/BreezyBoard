/**
 * The public surface of the board feature.
 *
 * Section 12.3 says one feature reaches another only through its index, and
 * the lint rule that enforces it caught the first violation the day a second
 * feature appeared: `features/tasks/queries.ts` was importing
 * `features/board/arrangeColumn` directly. That is the rule working, and the
 * answer is to declare a surface rather than to widen the rule.
 */
export { arrangeColumn, byOrder, neighboursOf } from './arrangeColumn';
export type { ArrangedColumn } from './arrangeColumn';
