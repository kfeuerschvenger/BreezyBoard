import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Modal } from './Modal';

// The suite-wide stub strips every animation prop. This file asserts what a
// leaving modal does and the axis a sheet enters on, which are those props,
// so it runs the real library.
vi.unmock('motion/react');

const stubWide = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Modal while it leaves', () => {
  it('stops catching the pointer on every layer the moment it is closed, while it is still on screen', async () => {
    const children = <p>Body content</p>;
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Edit">
        {children}
      </Modal>
    );
    const panel = screen.getByRole('dialog');
    const scrim = panel.previousElementSibling as HTMLElement;
    const wrapper = panel.parentElement as HTMLElement;
    expect(wrapper.style.pointerEvents).not.toBe('none');

    rerender(
      <Modal open={false} onClose={vi.fn()} title="Edit">
        {children}
      </Modal>
    );

    // The wrapper is fixed over the whole screen and stays mounted until the
    // panel has finished leaving, so anything pressed on the page in that time
    // lands on it instead: the click is swallowed and a drag becomes a text
    // selection.
    // Read while all three are still attached: the panel's exit lasts 200
    // milliseconds here, and a check after it would read a detached node.
    await waitFor(() => {
      expect(wrapper.isConnected).toBe(true);
      expect(wrapper.style.pointerEvents).toBe('none');
      expect(scrim.style.pointerEvents).toBe('none');
      expect(panel.style.pointerEvents).toBe('none');
    });
  });
});

describe('Modal as a sheet', () => {
  const renderSheet = () =>
    render(
      <Modal open onClose={vi.fn()} title="Edit" placement="sheet">
        <p>Body content</p>
      </Modal>
    );

  it('enters from the bottom edge below the medium breakpoint', () => {
    stubWide(false);
    renderSheet();

    expect(screen.getByRole('dialog').style.transform).toContain('translateY(100%)');
  });

  it('rises like a dialog from the medium breakpoint up', () => {
    stubWide(true);
    renderSheet();

    const transform = screen.getByRole('dialog').style.transform;
    expect(transform).not.toContain('100%');
    expect(transform).toContain('translateY(16px)');
  });

  it('is anchored to the bottom and squared off below the breakpoint, and centered from it', () => {
    stubWide(false);
    renderSheet();

    const panel = screen.getByRole('dialog');
    expect(panel.parentElement).toHaveClass('items-end', 'md:items-center');
    expect(panel).toHaveClass('rounded-t-modal', 'rounded-b-none', 'md:rounded-modal');
  });
});
