import { useId } from 'react';
import type { ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

export interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
}

// The label is secondary text at 600 and 13 pixels. The error text is the
// danger step, 8.9:1 on white, and the hint is tertiary text, 5.41:1.
const LABEL_CLASSES = 'mb-1.5 block text-[13px] font-semibold text-ink-secondary';
const ERROR_CLASSES = 'mt-1.5 text-[13px] font-medium text-danger-strong';
const HINT_CLASSES = 'mt-1.5 text-[13px] text-ink-tertiary';

/**
 * Field
 * Composes a label, an optional icon slot, a control (supplied via a render
 * prop), and an optional hint / error message. The label is always rendered
 * with htmlFor pointing at the same id handed to the control, and the error
 * is always exposed through aria-describedby, so a Field can never render a
 * label that is not associated with its control.
 */
export function Field({ label, error, hint, required = false, icon, children }: FieldProps): ReactNode {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-tertiary">
            {icon}
          </div>
        )}
        {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      </div>
      {hint && !error && (
        <p id={hintId} className={HINT_CLASSES}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={ERROR_CLASSES}>
          {error}
        </p>
      )}
    </div>
  );
}
