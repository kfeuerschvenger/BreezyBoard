// The public surface of the colours feature. Another feature reaches this one
// through this file and never into its internals, which is what the
// dependency direction rule in the lint config enforces.
export { colorKeys, useColors } from './queries';
export type { ColorType } from './queries';
