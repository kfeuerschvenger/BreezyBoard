import { QueryClient } from '@tanstack/react-query';

/**
 * The server state layer.
 *
 * No real time transport is built. Concurrency on a board is occasional, so
 * the application revalidates when the window regains focus rather than
 * holding a stream open. The part that was expensive to retrofit was never
 * the transport, it was whether the cache can be written from something
 * that is not a fetch, and `queryClient.setQueryData` is exactly that. If a
 * Server-Sent Events stream is ever added, it writes through that entry
 * point and no page changes.
 *
 * This also leaves the session design alone (see docs/ARCHITECTURE.md), which a stream
 * would not have. Every authenticated request renews the token, so anything
 * that polls quietly turns a fifteen minute inactivity window into a session
 * that never ends. Focus is a human action, not a timer: a window nobody
 * touches never regains focus and therefore never refetches. `idle.mjs`
 * asserts zero API calls across an idle period and is the thing that would
 * notice if that ever stopped being true.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // The whole point. Coming back to the tab is when somebody wants to
        // see what changed while they were away.
        refetchOnWindowFocus: true,

        // Fresh for half a minute, so flicking between two windows does not
        // refetch on every alt-tab. Longer than a glance, shorter than the
        // time it takes somebody else to do something worth seeing.
        staleTime: 30_000,

        // A failed request is shown rather than retried three times behind a
        // spinner. The pages have real error states now, and a silent retry
        // is how a broken endpoint looks like a slow one.
        retry: false,
      },
    },
  });
