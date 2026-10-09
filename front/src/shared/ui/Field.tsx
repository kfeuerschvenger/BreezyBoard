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
  /**
   * A control set on the label's line, at the far end, such as a "Forgot it?"
   * button. It sits beside the label rather than inside it, so it is not part
   * of the label's text and the field's accessible name stays the label alone.
   */
  labelAside?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
}

// The label is secondary text at 600 and 13 pixels. The error text is the
// danger step, 8.9:1 on white, and the hint is tertiary text, 5.41:1.
const LABEL_TEXT_CLASSES = 'block text-[13px] font-semibold text-ink-secondary';
const LABEL_CLASSES = `mb-1.5 ${LABEL_TEXT_CLASSES}`;
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
export function Field({ label, error, hint, required = false, icon, labelAside, children }: FieldProps): ReactNode {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  // With an aside the row owns the bottom margin, so the label drops its own.
  const labelElement = (
    <label htmlFor={id} className={labelAside ? LABEL_TEXT_CLASSES : LABEL_CLASSES}>
      {label}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  );

  return (
    <div>
      {labelAside ? (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {labelElement}
          {labelAside}
        </div>
      ) : (
        labelElement
      )}
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
