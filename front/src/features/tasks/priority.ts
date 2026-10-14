export type TaskPriority = 'low' | 'medium' | 'high';

/** In order of urgency, which is the order the picker offers them in. */
export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/**
 * One place decides which hue each priority is drawn in: green for low, sand
 * for medium and coral for high. The card draws a `Chip` in it, and the
 * picker below draws the same pair as the variant a checked radio needs.
 *
 * The picker's classes are whole literals and never derived from the hue at
 * runtime. Tailwind generates a rule only for a class it can read in the
 * source, so `has-[:checked]:${...}` names rules that were never emitted and
 * paints nothing, and composing it from a value holding two classes lets only
 * the first inherit the variant while the second applies unconditionally.
 * That is finding P4-7.
 */
export const PRIORITY_HUE: Record<TaskPriority, 'green' | 'sand' | 'coral'> = {
  low: 'green',
  medium: 'sand',
  high: 'coral',
};

/** The hue's tint and deep step as the variant a checked radio inside a label needs. */
export const PRIORITY_SELECTED_CLASSES: Record<TaskPriority, string> = {
  low: 'has-[:checked]:bg-green-tint has-[:checked]:text-green-deep',
  medium: 'has-[:checked]:bg-sand-tint has-[:checked]:text-sand-deep',
  high: 'has-[:checked]:bg-coral-tint has-[:checked]:text-coral-deep',
};

/** Anything unrecognised reads as the least urgent rather than crashing. */
export const asTaskPriority = (value: unknown): TaskPriority =>
  TASK_PRIORITIES.includes(value as TaskPriority) ? (value as TaskPriority) : 'low';
