import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserService } from '@/services';
import type { User } from '@/models';
import { userKeys } from '../queries';

/** How long to wait after the last keystroke before asking the server. */
const DEBOUNCE_MS = 300;

export interface UseMemberSearchResult {
  term: string;
  setTerm: (term: string) => void;
  results: User[];
  isLoading: boolean;
  /** The one message worth showing instead of the list. */
  error: string | null;
  /** Clears the term and searches again, for a search that failed. */
  retry: () => void;
}

const NO_RESULTS: User[] = [];

/**
 * People who could be added to a board, searched as the person types.
 *
 * The debounce stays here rather than becoming a shared hook. `UserPicker`
 * also debounces, but its timer is wound through a minimum query length and a
 * check against the already selected name, so it is a debounced effect rather
 * than a debounced value and the two do not factor out yet.
 *
 * Out of order answers are the cache's problem rather than this hook's. Each
 * term is its own key, so a slow search resolving late lands under the key
 * nobody is reading any more. The request id and mounted flag that used to do
 * this by hand are gone.
 */
export function useMemberSearch(boardId: string | undefined, enabled: boolean): UseMemberSearchResult {
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // Nothing is typed while it is closed, so the term goes back to empty and
  // the next opening starts from the full list rather than the last search.
  useEffect(() => {
    if (enabled) return;
    setTerm('');
    setDebouncedTerm('');
  }, [enabled]);

  const query = useQuery({
    queryKey: userKeys.search(debouncedTerm, boardId ?? ''),
    queryFn: () => UserService.search(debouncedTerm, boardId),
    enabled,
  });

  return {
    term,
    setTerm,
    results: query.data ?? NO_RESULTS,
    // The debounce is part of the wait as far as anyone looking at the screen
    // is concerned, so a term that has not reached the query yet still reads
    // as loading rather than as no results.
    isLoading: query.isPending || term !== debouncedTerm,
    error: query.isError ? 'Failed to load team members' : null,

    // Clearing the term is not enough on its own. The search that fails most
    // often is the one that runs as the modal opens, where the term is
    // already empty, so clearing it changes no state, moves no query key and
    // runs nothing. The refetch is what makes the button do anything at all
    // in the case it exists for.
    retry: () => {
      setTerm('');
      void query.refetch();
    },
  };
}

export default useMemberSearch;
