import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Menu, MenuItem } from './Menu';

/**
 * A menu that is leaving.
 *
 * The suite-wide stub reports every element as present, so nothing here can
 * exit. This file replaces `usePresence` with one that says the popup is on
 * its way out, which is the state the real library puts it in for the length
 * of its fade, and asserts the popup stops being reachable.
 */
vi.mock('motion/react', () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, tag) =>
        React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
          const { initial, animate, exit, transition, ...rest } = props;
          void initial;
          void animate;
          void exit;
          void transition;
          return React.createElement(String(tag), { ...rest, ref });
        }),
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    MotionConfig: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    usePresence: () => [false, () => {}] as const,
  };
});

describe('Menu while it is leaving', () => {
  it('is hidden from assistive technology and cannot take focus or clicks', async () => {
    render(
      <Menu
        label="Options"
        renderTrigger={props => (
          <button type="button" {...props}>
            Open
          </button>
        )}
      >
        <MenuItem onSelect={() => {}}>One</MenuItem>
      </Menu>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).toHaveAttribute('aria-hidden', 'true');
    expect(menu.hasAttribute('inert')).toBe(true);
  });
});
