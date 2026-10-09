import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from './Drawer';

// The suite-wide stub strips every animation prop. This file asserts the
// entrance axis, which is one of those props, so it runs the real library.
vi.unmock('motion/react');

/**
 * jsdom loads no stylesheet, so what a breakpoint class does is measured in
 * `e2e/verify/responsive.mjs` against a rendered page. What is held here is
 * what a component test can see: the structure the layout depends on, the
 * axis the entrance animation uses, and the dialog semantics.
 */

const stubSidePanel = (matches: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderDrawer = (props: Partial<React.ComponentProps<typeof Drawer>> = {}) =>
  render(
    <Drawer open onClose={vi.fn()} title="Edit" footer={<button type="button">Save</button>} {...props}>
      <p>Body content</p>
    </Drawer>
  );

describe('Drawer', () => {
  it('is a bottom sheet capped in dynamic viewport units, and a side panel from md up', () => {
    renderDrawer();

    const panel = screen.getByRole('dialog');
    // `dvh`, not `vh`: the latter is taller than what a phone shows while its
    // browser chrome or keyboard is up. The md utilities turn the sheet into
    // the side panel and lift the height cap.
    expect(panel).toHaveClass('inset-x-0', 'bottom-0', 'max-h-[90dvh]', 'rounded-t-modal');
    expect(panel).toHaveClass('md:inset-y-0', 'md:right-0', 'md:max-h-none', 'md:max-w-xl');
  });

  it('scrolls its body and keeps the title and the footer outside the scroller', () => {
    renderDrawer();

    const scroller = screen.getByText('Body content').parentElement as HTMLElement;
    expect(scroller).toHaveClass('overflow-y-auto', 'min-h-0', 'flex-1');
    expect(scroller).not.toContainElement(screen.getByRole('heading', { name: 'Edit' }));
    expect(scroller).not.toContainElement(screen.getByRole('button', { name: 'Save' }));
  });

  it('pads its footer for the home indicator', () => {
    renderDrawer();

    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass(
      'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
    );
  });

  it('enters from the bottom on a phone and from the right on a wide screen', () => {
    stubSidePanel(false);
    const phone = renderDrawer();
    expect(screen.getByRole('dialog').style.transform).toContain('translateY(100%)');
    phone.unmount();

    stubSidePanel(true);
    renderDrawer();
    expect(screen.getByRole('dialog').style.transform).toContain('translateX(100%)');
  });

  it('stops catching the pointer the moment it is closed, while it is still on screen leaving', async () => {
    const children = <p>Body content</p>;
    const { rerender } = render(
      <Drawer open onClose={vi.fn()} title="Edit">
        {children}
      </Drawer>
    );
    const panel = screen.getByRole('dialog');
    const scrim = panel.previousElementSibling as HTMLElement;
    expect(scrim.style.pointerEvents).not.toBe('none');

    rerender(
      <Drawer open={false} onClose={vi.fn()} title="Edit">
        {children}
      </Drawer>
    );

    // The panel leaves on a spring that takes most of a second, and the scrim
    // covers the whole screen for as long as it is mounted. Anything pressed on
    // the board in that time lands on the scrim instead and starts a text
    // selection, so a card cannot be picked up straight after a save.
    await waitFor(() => expect(scrim.style.pointerEvents).toBe('none'));
    expect(scrim).toBeInTheDocument();
    expect(panel.style.pointerEvents).toBe('none');
  });

  it('keeps the dialog semantics: a name, Escape to close and focus inside', async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    expect(screen.getByRole('dialog', { name: 'Edit' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
