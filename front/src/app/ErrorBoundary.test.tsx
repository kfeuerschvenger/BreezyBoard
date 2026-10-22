import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

let shouldThrow = true;

const Bomb = () => {
  if (shouldThrow) throw new Error('boom');
  return <p>All fine</p>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs every caught render error, and so does the boundary.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders its children while nothing throws', () => {
    shouldThrow = false;
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('All fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a crashed page with an alert, a main landmark and one h1', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('saved work is not affected');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
  });

  it('shows the fallback it was given instead of its own screen', () => {
    render(
      <ErrorBoundary fallback={<p>Custom fallback</p>}>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('draws the children again when Try again is pressed and the cause is gone', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('All fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves for the home address when Back to boards is pressed', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: 'Back to boards' }));

    expect(assign).toHaveBeenCalledWith('/');
  });
});
