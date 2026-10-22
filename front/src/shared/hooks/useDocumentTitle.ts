import { useEffect } from 'react';

/**
 * Names the browser tab while the calling component is mounted.
 *
 * The title a page replaced is put back on unmount rather than cleared, so
 * leaving a page that sets one never strands its title on a page that does
 * not. The title is what a screen reader announces on arrival and what the
 * tab, the history and a bookmark show, so a page that says it is somewhere
 * else (or nowhere) has to be able to say so.
 *
 * `null` leaves the title alone. A page that hands the screen to a child that
 * names it, such as a missing board, passes `null` for that case: effects run
 * child first, so a parent that set its own title would overwrite the child's.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return undefined;

    const previous = document.title;
    document.title = title;

    return () => {
      document.title = previous;
    };
  }, [title]);
}

export default useDocumentTitle;
