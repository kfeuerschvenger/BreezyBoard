import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionWarningToast } from './SessionWarningToast';

describe('SessionWarningToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the alert message and the visible countdown', () => {
    render(<SessionWarningToast secondsRemaining={45} onExtend={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/about to expire/i);
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('never auto-dismisses on its own', () => {
    vi.useFakeTimers();
    render(<SessionWarningToast secondsRemaining={5} onExtend={vi.fn()} />);

    vi.advanceTimersByTime(120_000);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('calls onExtend when "Stay signed in" is clicked', () => {
    const onExtend = vi.fn();
    render(<SessionWarningToast secondsRemaining={20} onExtend={onExtend} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(onExtend).toHaveBeenCalledTimes(1);
  });

  it('updates the announced alert text only at the 30s and 10s thresholds', () => {
    const { rerender } = render(<SessionWarningToast secondsRemaining={45} onExtend={vi.fn()} />);
    const initialText = screen.getByRole('alert').textContent;

    rerender(<SessionWarningToast secondsRemaining={35} onExtend={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe(initialText);

    rerender(<SessionWarningToast secondsRemaining={30} onExtend={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('30 seconds remaining');

    rerender(<SessionWarningToast secondsRemaining={20} onExtend={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('30 seconds remaining');

    rerender(<SessionWarningToast secondsRemaining={10} onExtend={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('10 seconds remaining');
  });
});
