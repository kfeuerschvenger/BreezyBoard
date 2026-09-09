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

// Exact class strings harvested from src/components/FormInput.tsx.
const LABEL_CLASSES = 'block text-sm font-medium text-gray-700 mb-2';
const ERROR_CLASSES = 'mt-1 text-sm text-red-600';
const HINT_CLASSES = 'mt-1 text-sm text-gray-500';

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
        {icon && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">{icon}</div>}
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
