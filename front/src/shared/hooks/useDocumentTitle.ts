import { useEffect } from 'react';

/**
 * Names the browser tab while the calling component is mounted.
 *
 * The title a page replaced is put back on unmount rather than cleared, so
 * leaving a page that sets one never strands its title on a page that does
 * not. The title is what a screen reader announces on arrival and what the
 * tab, the history and a bookmark show, so a page that says it is somewhere
 * else (or nowhere) has to be able to say so.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;

    return () => {
      document.title = previous;
    };
  }, [title]);
}

export default useDocumentTitle;
