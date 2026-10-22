import React, { useEffect, useRef, useState } from 'react';
import { IconPlus } from '@tabler/icons-react';
import { useDraft } from '@/shared/hooks/useDraft';
import { Button, Icon, Textarea } from '@/shared/ui';

export interface CardComposerProps {
  /** The column it adds to, which names the controls so one column's is not another's. */
  columnId: string;
  columnTitle: string;
  /**
   * Adds a card with this title. It rejects when the card could not be saved,
   * and the composer then keeps what was typed and says so.
   */
  onSubmit: (title: string) => Promise<unknown>;
  /**
   * A number that changes each time something outside asks this composer to
   * open, such as the board's "Add card" button. Zero means nobody has asked.
   */
  openRequest?: number;
}

const FAILURE = 'The card could not be added. Check your connection and try again.';

/**
 * The foot of a column: a ghost button that opens a place to type a card's
 * title.
 *
 * Enter adds the card and leaves the composer open for the next one, Shift and
 * Enter start a new line, and Escape closes. Everything else about a task is
 * edited by opening it, so a card is one line of typing and no form.
 *
 * What is typed is kept as a draft per column in the browser, for the reason
 * every form here keeps one: a session that ends while somebody is typing must
 * not take the sentence with it.
 */
export const CardComposer: React.FC<CardComposerProps> = ({ columnId, columnTitle, onSubmit, openRequest = 0 }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ title: string; id: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Whether focus should move after the next render: to the field when the
  // composer opens, back to the button when it closes. A flag rather than an
  // effect on `open`, so the first render does not steal focus from the page.
  const moveFocus = useRef<'field' | 'trigger' | null>(null);
  const handledRequest = useRef(0);
  // The text as it is now, for a save that finishes after more was typed.
  const typed = useRef('');

  const draft = useDraft<string>(`composer:${columnId}`);

  const show = () => {
    // Already open: there is nothing to rebuild and no render to wait for.
    if (open) {
      fieldRef.current?.focus();
      return;
    }
    const stored = draft.read() ?? '';
    typed.current = stored;
    setText(stored);
    setError(null);
    moveFocus.current = 'field';
    setOpen(true);
  };

  const close = () => {
    moveFocus.current = 'trigger';
    setOpen(false);
  };

  useEffect(() => {
    if (openRequest === 0 || openRequest === handledRequest.current) return;
    handledRequest.current = openRequest;
    show();
    // `show` reads the draft once and sets state, and has no other input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  // The flag is kept until its element exists. A request that arrives with the
  // first render sets it in an effect that runs before the field is drawn, and
  // clearing it then would lose the focus it asked for.
  useEffect(() => {
    const target =
      moveFocus.current === 'field' ? fieldRef.current : moveFocus.current === 'trigger' ? triggerRef.current : null;
    if (!target) return;

    target.focus();
    moveFocus.current = null;
  }, [open]);

  const change = (value: string) => {
    typed.current = value;
    setText(value);
    setError(null);
    if (value.trim()) draft.write(value);
    else draft.clear();
  };

  const submit = async () => {
    const title = text.trim();
    if (!title || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(title);
      // The field stays editable while the card is being saved. Whatever was
      // typed in the meantime is the start of the next card, and clearing the
      // field and its draft now would take it away. `typed` is read here and
      // not `text`, which is the value from when the submit began.
      if (typed.current.trim() === title) {
        draft.clear();
        setText('');
        typed.current = '';
      }
      setAdded(previous => ({ title, id: (previous?.id ?? 0) + 1 }));
      fieldRef.current?.focus();
    } catch {
      // Kept: the person is looking at the sentence they typed, and clearing
      // it over a failure would read as the card having been added.
      setError(FAILURE);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    // An Enter that confirms an input method's composition must not submit.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        aria-label={`Add a card to ${columnTitle}`}
        className="focus-ring flex h-10 w-full cursor-pointer items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink-secondary transition-colors duration-200 hover:bg-surface/90 hover:text-ink"
      >
        <Icon as={IconPlus} size={17} aria-hidden="true" />
        Add a card
      </button>
    );
  }

  return (
    <form
      aria-label={`New card in ${columnTitle}`}
      onSubmit={event => {
        event.preventDefault();
        void submit();
      }}
      className="animate-bb-composer flex flex-col gap-2"
    >
      <Textarea
        ref={fieldRef}
        value={text}
        rows={2}
        hasError={Boolean(error)}
        aria-label={`Title of the new card in ${columnTitle}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `composer-error-${columnId}` : undefined}
        placeholder="What needs doing?"
        onChange={event => change(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {error && (
        <p id={`composer-error-${columnId}`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="xs" isLoading={busy} disabled={!text.trim()}>
          Add
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={close}>
          Done
        </Button>
      </div>

      {/* Its own line: beside the buttons it does not fit a 292 pixel column and wraps to three. */}
      <p aria-hidden="true" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-tertiary">
        Enter adds · Esc closes
      </p>

      {/* Mounted with the form and only its text changes, so a screen reader announces each card added. */}
      <div role="status" className="sr-only">
        {added && <span key={added.id}>Added {added.title} to {columnTitle}.</span>}
      </div>
    </form>
  );
};

export default CardComposer;
