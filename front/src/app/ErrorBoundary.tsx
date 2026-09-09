import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div role="alert" className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center max-w-md">
          <p className="text-gray-900 font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-gray-600 mb-6">
            The page could not be displayed. You can try again, and your saved work is not affected.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-all duration-200 cursor-pointer"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Back to boards
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
