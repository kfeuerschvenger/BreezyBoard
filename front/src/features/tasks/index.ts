// The public surface of the tasks feature. Another feature reaches this one
// through this file and never into its internals, which is what the
// dependency direction rule in the lint config enforces.
export { Checklist } from './components/Checklist';
export type { ChecklistItemData, ChecklistProps } from './components/Checklist';
