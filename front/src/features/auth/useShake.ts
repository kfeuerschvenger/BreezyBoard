import { useCallback, useEffect, useRef } from 'react';

const SHAKE_CLASS = 'animate-bb-shake';

/**
 * Shakes a form once whenever it is refused, however recently it was last
 * refused.
 *
 * A form is refused in two ways and `shake` covers both: call it from the
 * invalid branch of the submit handler for a field that failed validation, and
 * pass the page's `error` and the form's `isSubmitting` for a failure that only
 * arrives after the request, which the hook watches for itself. A new message
 * shakes, and so does the same message again after another attempt has
 * finished, because a page that clears the error and sets it again can have
 * both updates land in one render and leave the prop unchanged.
 *
 * A CSS animation that has finished does not restart when its class is set
 * again, so the class is taken off, the layout is read to commit that, and the
 * class goes back on. It is added to the element directly rather than through
 * state: it is a one shot effect with nothing to render from, and a state flag
 * would have to flip off and on across two frames to get the same restart.
 *
 * The class comes off when its own animation ends. `animationend` bubbles, so a
 * child finishing an entrance animation inside the form would otherwise end the
 * shake early; the event's target is checked. A reduced motion preference
 * collapses the animation to a hundredth of a millisecond rather than removing
 * it, so the event still fires and the class still comes off.
 */
export function useShake<T extends HTMLElement>(error: string | null = null, isSubmitting = false) {
  const ref = useRef<T | null>(null);

  const shake = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    element.classList.remove(SHAKE_CLASS);
    void element.offsetWidth;
    element.classList.add(SHAKE_CLASS);

    const done = (event: AnimationEvent) => {
      if (event.target !== element) return;
      element.classList.remove(SHAKE_CLASS);
      element.removeEventListener('animationend', done);
    };
    element.addEventListener('animationend', done);
  }, []);

  const previous = useRef({ error, isSubmitting });
  useEffect(() => {
    const before = previous.current;
    previous.current = { error, isSubmitting };

    const attemptFinished = before.isSubmitting && !isSubmitting;
    if (error && (error !== before.error || attemptFinished)) shake();
  }, [error, isSubmitting, shake]);

  return { ref, shake };
}

export default useShake;
