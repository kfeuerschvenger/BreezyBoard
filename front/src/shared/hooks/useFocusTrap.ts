import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Traps Tab / Shift+Tab focus within the container while enabled.
 * On enable, focus moves to the first focusable element inside the container
 * (or the container itself when nothing is focusable). On disable or unmount,
 * focus is restored to whatever element had it before the trap activated.
 *
 * @param ref - Ref to the container element to trap focus within.
 * @param enabled - Whether the trap is active.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const container = ref.current;
    if (!container) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusables = getFocusableElements(container);
    const initialTarget = focusables[0] ?? container;
    initialTarget.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;

      const currentFocusables = getFocusableElements(container);
      if (currentFocusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [enabled, ref]);
}
