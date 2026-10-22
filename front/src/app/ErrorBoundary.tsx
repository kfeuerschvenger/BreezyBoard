import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { IconWind } from '@tabler/icons-react';
import { Button, Icon } from '@/shared/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions so an uncaught error shows a recoverable screen
 * instead of blanking the whole application.
 *
 * The screen stands alone: it sits above the router and every provider, so it
 * can use neither a link nor the session, and it is its own `main` with its own
 * `h1`. Its buttons are the shared `Button`, which needs no provider.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replace with the error reporting service once one is configured.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback;

    return (
      <main className="flex min-h-screen items-center justify-center bg-ground bg-[image:var(--gradient-ground)] p-8">
        <div
          role="alert"
          className="max-w-md rounded-modal border border-glass-border bg-surface p-8 text-center shadow-modal"
        >
          <div
            className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-coral-tint text-coral-deep"
            aria-hidden="true"
          >
            <Icon as={IconWind} size={28} />
          </div>
          <h1 className="mb-2 font-heading text-2xl font-bold text-ink">Something went wrong</h1>
          <p className="mb-6 text-sm text-ink-secondary">
            The page could not be displayed. You can try again, and your saved work is not affected.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={this.handleReset}>
              Try again
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.location.assign('/')}>
              Back to boards
            </Button>
          </div>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
