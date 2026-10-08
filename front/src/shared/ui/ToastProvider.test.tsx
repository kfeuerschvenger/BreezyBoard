import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { useToast } from '../hooks/useToast';
import type { ToastOptions } from './toastContext';
import { ToastProvider } from './ToastProvider';

const Launcher = ({ options }: { options: ToastOptions }) => {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      Launch
    </button>
  );
};

const renderToast = (options: ToastOptions) =>
  render(
    <ToastProvider>
      <main>
        <Launcher options={options} />
        <button type="button">Somewhere else</button>
      </main>
    </ToastProvider>
  );

const launch = () => fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const focus = (element: HTMLElement) => act(() => element.focus());

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mounts its live region before anything is shown, so the first message is announced', () => {
    renderToast({ message: 'Hello' });

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    launch();

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Hello');
  });

  it('removes a toast after its duration', () => {
    renderToast({ message: 'Gone soon', duration: 3000 });
    launch();

    advance(2999);
    expect(screen.getByText('Gone soon')).toBeInTheDocument();

    advance(1);
    expect(screen.queryByText('Gone soon')).not.toBeInTheDocument();
  });

  it('keeps a toast while the pointer is on it and resumes with the time that was left', () => {
    renderToast({ message: 'Reading this', duration: 3000 });
    launch();

    advance(2000);
    fireEvent.mouseEnter(screen.getByTestId('toast'));
    advance(60_000);
    expect(screen.getByText('Reading this')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByTestId('toast'));
    advance(999);
    expect(screen.getByText('Reading this')).toBeInTheDocument();
    advance(1);
    expect(screen.queryByText('Reading this')).not.toBeInTheDocument();
  });

  it('keeps a toast for as long as focus is inside it, and releases it when focus leaves', () => {
    renderToast({ message: 'Focus me', duration: 3000, action: { label: 'Undo', onAction: vi.fn() } });
    launch();
    const undo = screen.getByRole('button', { name: 'Undo' });

    focus(undo);
    advance(60_000);
    expect(screen.getByText('Focus me')).toBeInTheDocument();

    focus(screen.getByRole('button', { name: 'Somewhere else' }));
    advance(3000);
    expect(screen.queryByText('Focus me')).not.toBeInTheDocument();
  });

  it('does not release a toast when focus moves between its own two buttons', () => {
    renderToast({ message: 'Two buttons', duration: 3000, action: { label: 'Undo', onAction: vi.fn() } });
    launch();

    const undo = screen.getByRole('button', { name: 'Undo' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
    focus(undo);
    // jsdom's own focus() does not report where focus went, so the leaving
    // event is sent with the destination a browser would give it.
    act(() => {
      fireEvent.focusOut(undo, { relatedTarget: dismiss });
    });
    advance(60_000);

    expect(screen.getByText('Two buttons')).toBeInTheDocument();
  });

  it('runs the action once and removes the toast', async () => {
    vi.useRealTimers();
    const onAction = vi.fn();
    renderToast({ message: 'Deleted', action: { label: 'Undo', onAction } });
    launch();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
  });

  it('dismisses from the dismiss button and from Escape inside the toast', () => {
    renderToast({ message: 'First', action: { label: 'Undo', onAction: vi.fn() } });
    launch();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('First')).not.toBeInTheDocument();

    launch();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Undo' }), { key: 'Escape' });
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  it('never takes focus when it appears', () => {
    renderToast({ message: 'Quiet', action: { label: 'Undo', onAction: vi.fn() } });
    const trigger = screen.getByRole('button', { name: 'Launch' });
    trigger.focus();

    launch();

    expect(trigger).toHaveFocus();
  });

  it('focuses the action when a keyboard user has lost focus, and only then', () => {
    renderToast({ message: 'Deleted', action: { label: 'Undo', onAction: vi.fn() } });
    launch();
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    (document.activeElement as HTMLElement | null)?.blur();

    advance(250);

    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
  });

  it('leaves focus alone when something else has it', () => {
    renderToast({ message: 'Deleted', action: { label: 'Undo', onAction: vi.fn() } });
    const elsewhere = screen.getByRole('button', { name: 'Somewhere else' });
    launch();
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });
    focus(elsewhere);

    advance(250);

    expect(elsewhere).toHaveFocus();
  });

  it('never focuses the action for a pointer user, whose toast would then never expire', () => {
    renderToast({ message: 'Deleted', duration: 3000, action: { label: 'Undo', onAction: vi.fn() } });
    launch();
    act(() => {
      fireEvent.pointerDown(window);
    });
    (document.activeElement as HTMLElement | null)?.blur();

    advance(250);
    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveFocus();

    advance(3000);
    expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
  });

  it('has no axe violations with a toast showing', async () => {
    vi.useRealTimers();
    renderToast({ message: 'Deleted "Launch Plan"', action: { label: 'Undo', onAction: vi.fn() } });
    launch();

    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('useToast', () => {
  it('refuses to run outside a provider rather than silently showing nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Launcher options={{ message: 'x' }} />)).toThrow(/ToastProvider/);
  });

  describe('who the toasts belong to', () => {
    const Harness = ({ resetKey, message = 'Deleted "Mine"' }: { resetKey: string | null; message?: string }) => (
      <ToastProvider resetKey={resetKey}>
        <Launcher options={{ message }} />
      </ToastProvider>
    );

    it('discards every toast when the key changes, so a sign out leaves none behind', () => {
      const { rerender } = render(<Harness resetKey="user-1" />);
      launch();
      launch();
      expect(screen.getAllByTestId('toast')).toHaveLength(2);

      rerender(<Harness resetKey={null} />);

      expect(screen.queryAllByTestId('toast')).toHaveLength(0);
    });

    it('discards them when a different person signs in, and still shows what that person raises', () => {
      const { rerender } = render(<Harness resetKey="user-1" />);
      launch();

      rerender(<Harness resetKey="user-2" />);
      expect(screen.queryByText('Deleted "Mine"')).not.toBeInTheDocument();

      launch();
      expect(screen.getByText('Deleted "Mine"')).toBeInTheDocument();
    });

    it('keeps them while the key stays the same', () => {
      const { rerender } = render(<Harness resetKey="user-1" />);
      launch();

      rerender(<Harness resetKey="user-1" message="Unrelated change" />);

      expect(screen.getByText('Deleted "Mine"')).toBeInTheDocument();
    });
  });

  describe('focus after the action', () => {
    const renderWithHeading = (options: ToastOptions) =>
      render(
        <ToastProvider>
          <h1>My Boards</h1>
          <Launcher options={options} />
          <button type="button">Somewhere else</button>
        </ToastProvider>
      );

    it('moves focus to the page heading when the action removes the button that had it', async () => {
      vi.useRealTimers();
      renderWithHeading({ message: 'Deleted', action: { label: 'Undo', onAction: vi.fn() } });
      launch();

      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'My Boards' })).toHaveFocus();
    });

    it('works from the keyboard as well', async () => {
      vi.useRealTimers();
      renderWithHeading({ message: 'Deleted', action: { label: 'Undo', onAction: vi.fn() } });
      launch();
      screen.getByRole('button', { name: 'Undo' }).focus();

      await userEvent.keyboard('{Enter}');

      expect(screen.getByRole('heading', { name: 'My Boards' })).toHaveFocus();
    });

    it('leaves focus alone when it was not inside the toast', () => {
      renderWithHeading({ message: 'Deleted', action: { label: 'Undo', onAction: vi.fn() } });
      launch();
      const elsewhere = screen.getByRole('button', { name: 'Somewhere else' });
      elsewhere.focus();

      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(elsewhere).toHaveFocus();
    });

    it('does nothing when the page has no heading to go to', async () => {
      vi.useRealTimers();
      renderToast({ message: 'Deleted', action: { label: 'Undo', onAction: vi.fn() } });
      launch();

      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

      expect(screen.queryByText('Deleted')).not.toBeInTheDocument();
    });
  });
});
