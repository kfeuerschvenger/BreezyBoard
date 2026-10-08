/**
 * The field's frame, shared by `Input`, `PasswordInput` and `Textarea` so the
 * three cannot drift apart.
 *
 * The border is `line-control`, 3.34:1 on white, because a field is found by
 * its boundary and the reference design's 0.12 alpha navy is 1.28:1. Focus
 * swaps it for the focus token (4.6:1 on white) and adds the soft halo; the
 * outline is removed because the border change is the indicator, and it has
 * the contrast of one.
 */
export const FIELD_CLASSES =
  'w-full border-[1.5px] bg-surface text-[15px] text-ink placeholder:text-ink-tertiary ' +
  'transition-[border-color,box-shadow] duration-200 focus:border-focus focus:shadow-focus focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-secondary';

export const FIELD_BORDER = 'border-line-control';
export const FIELD_BORDER_ERROR = 'border-danger';
