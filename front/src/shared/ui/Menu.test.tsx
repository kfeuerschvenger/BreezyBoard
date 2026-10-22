import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Menu, MenuItem } from './Menu';

const renderMenu = (onSelect = vi.fn(), onCardClick = vi.fn()) =>
  render(
    <div>
      {/* The click handler stands in for a clickable card around the menu. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={onCardClick}>
        <Menu
          label="Options"
          renderTrigger={props => (
            <button type="button" {...props}>
              Open
            </button>
          )}
        >
          <MenuItem onSelect={() => onSelect('one')}>One</MenuItem>
          <MenuItem onSelect={() => onSelect('two')} disabled>
            Two
          </MenuItem>
          <MenuItem onSelect={() => onSelect('three')}>Three</MenuItem>
        </Menu>
      </div>
      <button type="button">Elsewhere</button>
    </div>,
  );

const trigger = () => screen.getByRole('button', { name: 'Open' });

describe('Menu', () => {
  it('is closed until asked, and the trigger says so', () => {
    renderMenu();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on a click, focuses the first item and links the trigger to the menu', async () => {
    renderMenu();

    await userEvent.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Options' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', menu.id);
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
  });

  it('opens from the keyboard: ArrowDown on the first item, ArrowUp on the last', async () => {
    renderMenu();
    trigger().focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus();
  });

  it('moves between items with the arrows, wrapping, and with Home and End', async () => {
    renderMenu();
    await userEvent.click(trigger());

    await userEvent.keyboard('{ArrowDown}');
    // The disabled item stays in the order, so it is reachable and heard.
    expect(screen.getByRole('menuitem', { name: 'Two' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderMenu();
    await userEvent.click(trigger());

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes on Tab and returns focus to the trigger instead of walking into the page', async () => {
    renderMenu();
    await userEvent.click(trigger());

    await userEvent.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes when a press lands outside it', async () => {
    renderMenu();
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('runs the chosen action once, closes, and returns focus to the trigger', async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole('menuitem', { name: 'Three' }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('three');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('chooses an item with Enter', async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    trigger().focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('one');
  });

  it('does nothing when a disabled item is chosen, and stays open', async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    await userEvent.click(trigger());

    await userEvent.click(screen.getByRole('menuitem', { name: 'Two' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  // React events bubble through a portal to the React parent, so a menu inside
  // a clickable card would otherwise activate the card on every use.
  it('keeps its clicks from reaching a clickable ancestor', async () => {
    const onCardClick = vi.fn();
    renderMenu(vi.fn(), onCardClick);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitem', { name: 'One' }));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  // A scroll that is still settling when the menu opens, a scroll snap or a
  // focus scrolled into view, must not take the menu away from the person.
  it('stays open when something scrolls, and keeps its focus', async () => {
    renderMenu();
    await userEvent.click(trigger());

    fireEvent.scroll(document.body);
    fireEvent.resize(window);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
  });

  it('is present and reachable while open: not hidden and not inert', async () => {
    renderMenu();
    await userEvent.click(trigger());

    const menu = screen.getByRole('menu');
    expect(menu).not.toHaveAttribute('aria-hidden');
    expect(menu.hasAttribute('inert')).toBe(false);
  });

  it('draws the popup as a white rounded surface and each item as a rounded row with a focus ring', async () => {
    renderMenu();
    await userEvent.click(trigger());

    expect(screen.getByRole('menu')).toHaveClass('rounded-control', 'bg-surface', 'shadow-tile-hover');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveClass('rounded-button-small', 'focus-ring-inset');
  });

  it('draws a disabled item in tertiary text and does not lift it on hover', async () => {
    renderMenu();
    await userEvent.click(trigger());

    const disabled = screen.getByRole('menuitem', { name: 'Two' });
    expect(disabled).toHaveClass('text-ink-tertiary', 'cursor-not-allowed');
    expect(disabled.className).not.toContain('hover:bg-line-06');
  });

  it('has no accessibility violations open', async () => {
    const { baseElement } = renderMenu();
    await userEvent.click(trigger());

    // A bare test page has no landmarks, so `region` would fire on any
    // content at all. Whether the popup sits inside the page's landmarks is
    // measured on the real page by the end to end gate.
    const options = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

    expect(await axe(baseElement, options)).toHaveNoViolations();
  });
});
