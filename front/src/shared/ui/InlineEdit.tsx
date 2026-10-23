import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface InlineEditProps {
  value: string;
  /** Names the field. It has no visible label, the text it holds is its own caption. */
  label: string;
  /** Saves the trimmed text. Rejects when it could not be saved, and the field goes back to `value`. */
  onSave: (next: string) => Promise<void>;
  /** The reason the text may not be saved, or null when it may. Called with the trimmed text, never empty. */
  validate?: (next: string) => string | null;
  /** Tells the person why nothing was saved: a refused text, or a save that failed. */
  onError?: (message: string) => void;
  maxLength?: number;
  /** What an empty field is refused with. */
  emptyMessage?: string;
  /** What a failed save is reported with. */
  failureMessage?: string;
  className?: string;
}

// The text takes its size, weight and colour from the heading or title it sits
// in, so the field reads as that text until it is hovered or focused. Hover
// reveals a soft backdrop, focus a solid one with the focus outline: the outline
// is what makes focus visible, the backdrop alone is not enough contrast.
const FIELD_CLASSES =
  'block h-auto min-h-6 w-[calc(100%+1rem)] min-w-0 max-w-none -mx-2 truncate rounded-control border-0 bg-transparent px-2 py-0.5 text-ink ' +
  'font-[inherit] text-[length:inherit] leading-[inherit] tracking-[inherit] ' +
  'transition-[background-color] duration-200 enabled:hover:bg-glass-strong ' +
  'focus:bg-surface read-only:cursor-progress focus-ring';

/**
 * Text that is edited where it is read.
 *
 * It saves when it loses focus, which is also what Enter does: Enter blurs the
 * field. Escape puts the saved text back and leaves without saving. Nothing is
 * sent when the text has not changed, and an empty or refused text is not sent
 * either: the field returns to what it held and `onError` says why.
 *
 * The field is read only while a save is in flight, so a second blur cannot
 * send the same text twice. It follows `value` whenever it is not being
 * edited, so a title changed from another place appears here as well.
 */
export const InlineEdit = ({
  value,
  label,
  onSave,
  validate,
  onError,
  maxLength,
  emptyMessage = 'This cannot be empty.',
  failureMessage = 'This could not be saved.',
  className = '',
}: InlineEditProps) => {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const editing = useRef(false);
  // Escape reverts and then blurs, and the blur must not save what was reverted.
  const abandoned = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  const commit = async () => {
    editing.current = false;

    if (abandoned.current) {
      abandoned.current = false;
      return;
    }

    const next = draft.trim();

    if (next === value) {
      setDraft(value);
      return;
    }

    const refusal = next === '' ? emptyMessage : (validate?.(next) ?? null);

    if (refusal) {
      setDraft(value);
      onError?.(refusal);
      return;
    }

    setSaving(true);
    try {
      await onSave(next);
      setDraft(next);
    } catch {
      setDraft(value);
      onError?.(failureMessage);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      abandoned.current = true;
      setDraft(value);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      aria-label={label}
      aria-busy={saving || undefined}
      value={draft}
      maxLength={maxLength}
      readOnly={saving}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
      className={`${FIELD_CLASSES} ${className}`}
    />
  );
};

export default InlineEdit;
