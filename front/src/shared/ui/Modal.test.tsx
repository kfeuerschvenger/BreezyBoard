import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './index';

/**
 * The accessibility of the shared Modal is held by `primitives.a11y.test.tsx`.
 * This file holds the surface contract, which jsdom can only see as classes:
 * the radii, the scrim and the footer. A real browser measures what they
 * compute to in `design-tokens.mjs`.
 */

const open = (props: Partial<React.ComponentProps<typeof Modal>> = {}) =>
  render(
    <Modal open onClose={() => {}} title="Create board" {...props}>
      <p>Body</p>
    </Modal>
  );

describe('Modal focus', () => {
  // The trap falls back to the panel when nothing inside can take focus, and a
  // div takes focus only with a tabindex. Without it the fallback does nothing
  // and focus stays behind the scrim.
  it('takes focus itself when nothing inside it can', () => {
    open({ header: <div>Plain header</div> });

    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('tabindex', '-1');
    expect(panel).toHaveFocus();
  });
});

describe('Modal surface', () => {
  it('draws the panel on white with the modal radius and the modal shadow', () => {
    open();

    expect(screen.getByRole('dialog')).toHaveClass('bg-surface', 'rounded-modal', 'shadow-modal');
  });

  it('draws a blurred navy scrim behind the panel', () => {
    open();

    const scrim = screen.getByRole('dialog').previousElementSibling;
    expect(scrim).toHaveClass('bg-scrim', 'backdrop-blur-[6px]');
  });

  it('sets the title in the display face', () => {
    open();

    expect(screen.getByRole('heading', { name: 'Create board' })).toHaveClass('font-heading', 'font-bold');
  });

  it('draws a round close button whose glyph turns on hover', () => {
    open();

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('rounded-pill', 'group');
    expect(close.querySelector('svg')).toHaveClass('group-hover:rotate-90');
  });

  it('draws the footer on the subtle surface under a divider', () => {
    open({ footer: <button type="button">Save</button> });

    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('bg-surface-subtle', 'border-t');
  });

  it('draws no footer when there is none', () => {
    open();

    expect(screen.getByRole('dialog').querySelectorAll('.border-t')).toHaveLength(0);
  });

  it.each([
    ['sm', 'max-w-md'],
    ['md', 'max-w-2xl'],
    ['lg', 'max-w-3xl'],
  ] as const)('is capped at %s width by %s', (size, expected) => {
    open({ size });

    expect(screen.getByRole('dialog')).toHaveClass(expected);
  });

  it('closes from the backdrop by default and not when told not to', async () => {
    const user = userEvent.setup();
    let closed = 0;
    const { unmount } = open({ onClose: () => (closed += 1) });

    await user.click(screen.getByRole('dialog').previousElementSibling as HTMLElement);
    expect(closed).toBe(1);
    unmount();

    open({ onClose: () => (closed += 1), closeOnBackdrop: false });
    await user.click(screen.getByRole('dialog').previousElementSibling as HTMLElement);
    expect(closed).toBe(1);
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    let closed = 0;
    open({ onClose: () => (closed += 1) });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(closed).toBe(1);
  });
});
