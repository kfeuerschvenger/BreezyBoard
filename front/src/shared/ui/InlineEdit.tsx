import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconPencil } from '@tabler/icons-react';
import { Icon } from './Icon';
import { acquireAnnouncer, announce } from './liveAnnouncer';

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
  /**
   * Lets a long text wrap onto as many lines as it needs, so it reads in full
   * where it is edited. Without it the text stays on one line and is cut short
   * with an ellipsis when it does not fit.
   */
  wrap?: boolean;
  className?: string;
}

// The text takes its size, weight and colour from the heading or title it sits
// in, so the field reads as that text until it is hovered or focused. Hover
// reveals a soft backdrop, focus a solid one with the focus outline: the outline
// is what makes focus visible, the backdrop alone is not enough contrast. The
// right padding leaves room for the pencil that marks the text as editable.
const FIELD_CLASSES =
  'peer block h-auto min-h-6 w-[calc(100%+1rem)] min-w-0 max-w-none -mx-2 rounded-control border-0 bg-transparent py-0.5 pl-2 pr-7 text-ink ' +
  'font-[inherit] text-[length:inherit] leading-[inherit] tracking-[inherit] ' +
  'transition-[background-color] duration-200 enabled:hover:bg-glass-strong ' +
  'focus:bg-surface read-only:cursor-progress focus-ring';

const ONE_LINE_CLASSES = 'truncate';
const WRAPPED_CLASSES = 'resize-none overflow-hidden whitespace-normal break-words';

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
 *
 * A pencil beside the text says that it can be edited without a hover, which a
 * touch screen does not have. It is drawn at 80% of the tertiary ink, which is
 * 3:1 against the page and no darker: it sits inside the box of the heading,
 * and the heading's text is measured against the darkest pixel of that box, so
 * a darker pencil would take the text below 4.5:1.
 *
 * A successful save is announced through one polite live region that every
 * field on the page shares. It lives in the page body and not beside the field:
 * the field sits inside a heading, and text inside a heading becomes part of its
 * accessible name.
 *
 * A text that is refused, or a save that fails, puts the saved text back and
 * returns focus to the field. The reason stays on the field through
 * `aria-invalid` and `aria-describedby` until the next edit, so it is read
 * with the field and not only shown for a moment in a toast. It is rendered in
 * the page body for the same reason the live region is.
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
  wrap = false,
  className = '',
}: InlineEditProps) => {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  // Why the last text was not saved, until the next edit.
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();
  const editing = useRef(false);
  // Escape reverts and then blurs, and the blur must not save what was reverted.
  const abandoned = useRef(false);
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => acquireAnnouncer(), []);

  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  // A wrapped field is as tall as its text: the height is set from the content
  // after every change of the text, and again when the field's width changes
  // and the text wraps differently.
  useLayoutEffect(() => {
    const element = field.current;
    if (!wrap || !(element instanceof HTMLTextAreaElement)) return;

    const fit = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };

    fit();

    if (typeof ResizeObserver === 'undefined') return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fit();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [wrap, draft]);

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

    // Focus is returned on the next turn: this runs inside the blur, and the
    // browser is about to move focus to whatever was chosen, which would
    // otherwise win over a focus call made here.
    const refuse = (message: string) => {
      setDraft(value);
      setProblem(message);
      onError?.(message);
      setTimeout(() => field.current?.focus(), 0);
    };

    if (refusal) {
      refuse(refusal);
      return;
    }

    setSaving(true);
    try {
      await onSave(next);
      setDraft(next);
      announce(`${label} saved.`);
    } catch {
      refuse(failureMessage);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // A key pressed to compose text with an input method editor (the Enter that
    // picks a candidate, the Escape that drops it) belongs to the editor. 229 is
    // the code browsers report for such a key when `isComposing` is not set.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      abandoned.current = true;
      setProblem(null);
      setDraft(value);
      event.currentTarget.blur();
    }
  };

  const shared = {
    'aria-label': label,
    'aria-busy': saving || undefined,
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': problem ? problemId : undefined,
    value: draft,
    maxLength,
    readOnly: saving,
    onFocus: () => {
      editing.current = true;
      announce('');
    },
    // A pasted line break would put a second line in a name that has one.
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setProblem(null);
      setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '));
    },
    onBlur: () => void commit(),
    onKeyDown,
    className: `${FIELD_CLASSES} ${wrap ? WRAPPED_CLASSES : ONE_LINE_CLASSES} ${className}`,
  };

  return (
    <span className="relative block">
      {wrap ? (
        <textarea ref={element => void (field.current = element)} rows={1} {...shared} />
      ) : (
        <input ref={element => void (field.current = element)} type="text" {...shared} />
      )}
      <Icon
        as={IconPencil}
        size={16}
        className={`pointer-events-none absolute right-0 text-ink-tertiary opacity-80 peer-focus:hidden ${wrap ? 'top-2' : 'top-1/2 -translate-y-1/2'}`}
      />
      {problem &&
        createPortal(
          <span id={problemId} className="sr-only">
            {problem}
          </span>,
          document.body
        )}
    </span>
  );
};

export default InlineEdit;
