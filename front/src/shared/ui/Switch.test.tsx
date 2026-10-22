import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { Switch } from './index';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

const Harness = ({ initial = false }: { initial?: boolean }) => {
  const [checked, setChecked] = useState(initial);
  return <Switch aria-label="Cards sway in gusty weather" checked={checked} onCheckedChange={setChecked} />;
};

describe('Switch', () => {
  it('is a switch with a name and no violations', async () => {
    const { container } = render(<Harness />);

    expect(screen.getByRole('switch', { name: 'Cards sway in gusty weather' })).toBeInTheDocument();
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('reports its state in aria-checked', () => {
    const { rerender } = render(<Switch aria-label="Sway" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    rerender(<Switch aria-label="Sway" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('turns on and off when clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const control = screen.getByRole('switch');
    await user.click(control);
    expect(control).toHaveAttribute('aria-checked', 'true');

    await user.click(control);
    expect(control).toHaveAttribute('aria-checked', 'false');
  });

  it('asks for the opposite of its current state', async () => {
    const user = userEvent.setup();
    const asked: boolean[] = [];
    const { rerender } = render(<Switch aria-label="Sway" checked={false} onCheckedChange={value => asked.push(value)} />);

    await user.click(screen.getByRole('switch'));
    rerender(<Switch aria-label="Sway" checked onCheckedChange={value => asked.push(value)} />);
    await user.click(screen.getByRole('switch'));

    expect(asked).toEqual([true, false]);
  });

  it('toggles with Space and with Enter, because it is a button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();

    await user.keyboard(' ');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{Enter}');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('does nothing while disabled', async () => {
    const user = userEvent.setup();
    let asked = 0;
    render(<Switch aria-label="Sway" checked={false} disabled onCheckedChange={() => (asked += 1)} />);

    await user.click(screen.getByRole('switch'));

    expect(asked).toBe(0);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('is named by a wrapping label when it has no label of its own', () => {
    render(
      <>
        <label htmlFor="weekly">Weekly wind-down email</label>
        <Switch id="weekly" checked={false} onCheckedChange={() => {}} />
      </>
    );

    expect(screen.getByRole('switch', { name: 'Weekly wind-down email' })).toBeInTheDocument();
  });

  it('draws the 44 by 26 track and moves the 20 pixel knob 18 pixels when on', () => {
    const { rerender } = render(<Switch aria-label="Sway" checked={false} onCheckedChange={() => {}} />);

    const control = screen.getByRole('switch');
    expect(control).toHaveClass('h-[26px]', 'w-11', 'bg-line-control');
    const knob = control.querySelector('span');
    expect(knob).toHaveClass('size-5', 'translate-x-0', 'ease-spring');

    rerender(<Switch aria-label="Sway" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveClass('bg-accent-strong');
    expect(screen.getByRole('switch').querySelector('span')).toHaveClass('translate-x-[18px]');
  });

  it('hides the knob from assistive technology', () => {
    render(<Switch aria-label="Sway" checked onCheckedChange={() => {}} />);

    expect(screen.getByRole('switch').querySelector('span')).toHaveAttribute('aria-hidden', 'true');
  });
});
