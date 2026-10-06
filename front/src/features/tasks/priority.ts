export type TaskPriority = 'low' | 'medium' | 'high';

/** In order of urgency, which is the order the picker offers them in. */
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * One place decides that high is red, and it says so twice.
 *
 * The two spellings are deliberate and the duplication between them is not
 * the kind worth removing. Tailwind generates a rule only for a class it can
 * read in the source, so deriving the variant form from the plain one at
 * runtime, `has-[:checked]:${PRIORITY_BADGE_CLASSES[p]}`, names rules that
 * were never emitted and paints nothing. Composing it from a value holding
 * two classes is worse still: only the first inherits the variant and the
 * second applies unconditionally. That is finding P4-7, which reached the
 * interface once already through these exact chips.
 *
 * What was worth removing is the colour decision living in two files, which
 * is the priority half of P3-6. It lives here.
 */
export const PRIORITY_BADGE_CLASSES: Record<TaskPriority, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
};

/** The same three pairs, as the variant a checked radio inside a label needs. */
export const PRIORITY_SELECTED_CLASSES: Record<TaskPriority, string> = {
  low: 'has-[:checked]:bg-green-100 has-[:checked]:text-green-800',
  medium: 'has-[:checked]:bg-yellow-100 has-[:checked]:text-yellow-800',
  high: 'has-[:checked]:bg-red-100 has-[:checked]:text-red-800',
};

/** Anything unrecognised reads as the least urgent rather than crashing. */
export const asTaskPriority = (value: unknown): TaskPriority =>
  TASK_PRIORITIES.includes(value as TaskPriority) ? (value as TaskPriority) : 'low';
