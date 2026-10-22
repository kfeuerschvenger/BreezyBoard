import { useEffect, useRef } from 'react';

/**
 * Attaches a window keydown listener that calls the handler when Escape is pressed.
 * The handler is kept in a ref so callers do not need to memoize it.
 *
 * @param enabled - Whether the listener should be active.
 * @param handler - Called when the Escape key is pressed while enabled.
 */
export function useEscapeKey(enabled: boolean, handler: () => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') handlerRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
