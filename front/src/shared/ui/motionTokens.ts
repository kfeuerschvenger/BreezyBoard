/**
 * The easings of the token layer, in the form `motion` takes them.
 *
 * `motion` drives its animations from JavaScript and cannot read a CSS custom
 * property, so these repeat `--ease-standard` and `--ease-exit` from
 * `index.css` as bezier arrays. `motionTokens.test.ts` reads the stylesheet
 * and fails if the two ever differ, so the value lives in one place that is
 * checked rather than in two places that are remembered.
 */
export const EASE_STANDARD = [0.2, 0.8, 0.2, 1] as const;
export const EASE_EXIT = [0.5, 0, 0.75, 0] as const;

/** An entrance with the standard easing: a fast start that settles. */
export const enterTransition = (duration: number) => ({ duration, ease: EASE_STANDARD });

/** A departure with the exit easing: it accelerates away. */
export const exitTransition = (duration: number) => ({ duration, ease: EASE_EXIT });
