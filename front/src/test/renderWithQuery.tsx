import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '@/shared/ui';

/**
 * Renders a component that reads from the query cache.
 *
 * A fresh QueryClient per call, deliberately: a shared one would carry a
 * previous test's data into the next, which reads as a test that passes on
 * its own and fails in the suite, or worse, passes for the wrong reason.
 *
 * Retries are off and `refetchOnWindowFocus` with them. Both are wanted in
 * the application and neither is wanted here: a retry turns an asserted
 * failure into a timeout, and jsdom fires focus events the moment anything
 * calls `.focus()`, which would refetch mid assertion.
 */
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });

export const renderWithQuery = (ui: ReactElement) => {
  const queryClient = createTestQueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  return { queryClient, ...render(ui, { wrapper }) };
};
