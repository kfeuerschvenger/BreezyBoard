import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { ToastContext } from './toastContext';
import type { ToastContextValue, ToastOptions } from './toastContext';

/** Long enough to read a sentence and reach a button, per WCAG 2.2.1. */
const DEFAULT_DURATION_MS = 10_000;

interface ToastEntry extends ToastOptions {
  id: string;
}

/** How long after a toast appears to look for lost focus, once the page behind it has settled. */
const RECOVER_FOCUS_AFTER_MS = 250;

interface ToastItemProps {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
  /** Whether the last input was the keyboard, which is when lost focus is worth recovering. */
  keyboardRef: RefObject<boolean>;
}

/**
 * One toast, and the clock that removes it.
 *
 * The clock runs only while nothing is pointing at the toast or inside it.
 * Hovering and focusing both stop it, and it resumes with the time that was
 * left rather than starting over, so a toast somebody is reading cannot
 * vanish under them and one they walked away from still leaves. A keyboard
 * user who has moved focus onto the action holds it open for as long as the
 * focus stays, which is what WCAG 2.2.1 asks for: the time limit can be
 * extended without a separate control.
 */
const ToastItem = ({ toast, onDismiss, keyboardRef }: ToastItemProps) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remainingRef = useRef(toast.duration ?? DEFAULT_DURATION_MS);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const paused = hovered || focused;

  // A toast never takes focus from something that has it. But a keyboard user
  // who confirms a dialog that then closes, or navigates, has no focus at all:
  // the element that held it is gone, and the browser resumes Tab from where
  // that element used to be, which is nowhere near the toast. Only then is
  // the action focused, after the page behind has settled, so Undo is a key
  // press away. A pointer user is never touched: a focused toast does not
  // expire, and they have no use for the focus.
  const hasAction = Boolean(toast.action);
  useEffect(() => {
    if (!hasAction) return;

    const timer = setTimeout(() => {
      const nothingFocused = !document.activeElement || document.activeElement === document.body;
      if (keyboardRef.current && nothingFocused) actionRef.current?.focus();
    }, RECOVER_FOCUS_AFTER_MS);

    return () => clearTimeout(timer);
  }, [hasAction, keyboardRef]);

  useEffect(() => {
    if (paused) return;

    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);

    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused, onDismiss, toast.id]);

  return (
    // The handlers only observe pointer and focus to pause the clock. The
    // toast itself is not an interactive element: its two buttons are.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={rootRef}
      data-testid="toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') onDismiss(toast.id);
      }}
      className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-lg bg-gray-900 py-2 pl-4 pr-2 text-sm text-white shadow-lg"
    >
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>

      {toast.action && (
        <button
          ref={actionRef}
          type="button"
          onClick={() => {
            toast.action?.onAction();
            if (rootRef.current) moveFocusOffToast(rootRef.current);
            onDismiss(toast.id);
          }}
          className="min-h-11 shrink-0 cursor-pointer rounded px-3 font-semibold text-blue-300 underline hover:text-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:min-h-8"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded text-gray-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-8 sm:w-8"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

/**
 * Where focus goes when the toast's action is pressed. Pressing it removes the
 * button that holds focus, and a browser answers that by dropping focus on
 * the document, so the next Tab starts again from the top of the page and a
 * screen reader goes quiet. The page's own heading is the one stable place
 * every page has: it names where the person is, and the thing the action
 * changed (a restored board, say) may not be on screen yet.
 *
 * Only when focus is inside the toast being closed. Somebody who pressed the
 * action with a pointer and has since put focus elsewhere keeps it there.
 */
const moveFocusOffToast = (toastElement: HTMLElement) => {
  if (!toastElement.contains(document.activeElement)) return;

  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1')).find(
    candidate => !toastElement.contains(candidate)
  );
  if (!heading) return;

  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
};

let counter = 0;

export interface ToastProviderProps {
  children: ReactNode;
  /**
   * Identifies who the toasts belong to, such as the signed in user's id.
   * When it changes every toast is discarded.
   */
  resetKey?: string | null;
}

/**
 * Toasts for the whole application: transient messages, optionally with one
 * action, announced politely and never taking focus.
 *
 * The live region is always mounted and the toasts are added into it. A
 * region that appears together with its content is announced by few screen
 * readers, so mounting it empty first is what makes the announcement
 * reliable.
 *
 * The viewport is rendered before the children, ahead of everything else in
 * the document. It is fixed at the bottom of the screen, so the order is
 * invisible to sighted users, and it puts the toast at the start of the tab
 * order for anybody who tabs from the top of the page. For a keyboard user
 * whose focus was lost, see `ToastItem`.
 */
export const ToastProvider = ({ children, resetKey = null }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  // A toast belongs to whoever was signed in when it appeared: it can name
  // their boards and carry an action that acts as them. Changing the key
  // discards every toast, so a message and an Undo never outlive the session
  // that raised them. Adjusted during render, not in an effect, so the old
  // user's toasts are never painted for the new one.
  const [currentKey, setCurrentKey] = useState(resetKey);
  if (currentKey !== resetKey) {
    setCurrentKey(resetKey);
    setToasts([]);
  }

  const dismiss = useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    counter += 1;
    const id = `toast-${counter}`;
    setToasts(current => [...current, { ...options, id }]);
    return id;
  }, []);

  const keyboardRef = useRef(false);

  useEffect(() => {
    const onKey = () => {
      keyboardRef.current = true;
    };
    const onPointer = () => {
      keyboardRef.current = false;
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <section aria-label="Notifications">
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4"
        >
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} keyboardRef={keyboardRef} />
          ))}
        </div>
      </section>
      {children}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
