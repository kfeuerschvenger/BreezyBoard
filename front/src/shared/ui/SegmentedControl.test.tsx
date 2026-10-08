import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { SegmentedControl } from './index';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

const OPTIONS = [
  { id: 'calm', label: 'Calm' },
  { id: 'breezy', label: 'Breezy' },
  { id: 'gusty', label: 'Gusty' },
];

const Harness = ({ initial = 'breezy' }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return <SegmentedControl label="Breeze" options={OPTIONS} value={value} onChange={setValue} />;
};

describe('SegmentedControl', () => {
  it('is a named radio group of named radios, with the current one checked', async () => {
    const { container } = render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Breeze' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Breezy' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Calm' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Gusty' })).not.toBeChecked();
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('moves the selection with the right and left arrows', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Breezy' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Gusty' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Gusty' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Breezy' })).toBeChecked();
  });

  it('moves the selection with the down and up arrows too', async () => {
    const user = userEvent.setup();
    render(<Harness initial="calm" />);

    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Breezy' })).toBeChecked();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'Calm' })).toBeChecked();
  });

  it('wraps from the last segment to the first', async () => {
    const user = userEvent.setup();
    render(<Harness initial="gusty" />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Calm' })).toBeChecked();
  });

  it('is one tab stop, not one per segment', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">After</button>
      </>
    );

    await user.tab();
    await user.tab();

    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('reports the chosen id when a segment is clicked', async () => {
    const user = userEvent.setup();
    const chosen: string[] = [];
    render(<SegmentedControl label="Breeze" options={OPTIONS} value="calm" onChange={id => chosen.push(id)} />);

    await user.click(screen.getByText('Gusty'));

    expect(chosen).toEqual(['gusty']);
  });

  it('does not report a change for the segment that is already chosen', async () => {
    const user = userEvent.setup();
    const chosen: string[] = [];
    render(<SegmentedControl label="Breeze" options={OPTIONS} value="calm" onChange={id => chosen.push(id)} />);

    await user.click(screen.getByText('Calm'));

    expect(chosen).toEqual([]);
  });

  it('draws the selected segment on white with an ink ring and the frame with the control border', () => {
    render(<Harness />);

    const selected = screen.getByRole('radio', { name: 'Breezy' }).closest('label');
    expect(selected).toHaveClass('has-[:checked]:bg-surface', 'has-[:checked]:ring-ink');
    expect(screen.getByRole('radiogroup')).toHaveClass('border-line-control');
  });

  // Hidden from sight but not from the keyboard or the accessibility tree: the
  // segment is drawn by its label, and the radio is what answers the arrows.
  it('keeps the radios in the tab order and out of sight', () => {
    render(<Harness />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveClass('sr-only');
      expect(radio).not.toHaveAttribute('tabindex', '-1');
    }
  });

  it('shows a focus ring on the segment whose radio has the keyboard', () => {
    render(<Harness />);

    expect(screen.getByRole('radio', { name: 'Breezy' }).closest('label')).toHaveClass('focus-ring-within');
  });

  it('hides a segment icon from assistive technology', () => {
    render(
      <SegmentedControl
        label="Breeze"
        options={[{ id: 'a', label: 'Calm', icon: <svg data-testid="icon" /> }]}
        value="a"
        onChange={() => {}}
      />
    );

    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('radio', { name: 'Calm' })).toBeInTheDocument();
  });

  it('draws the larger size taller than the small one', () => {
    const { rerender } = render(<SegmentedControl label="Breeze" options={OPTIONS} value="calm" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Calm' }).closest('label')).toHaveClass('h-7');

    rerender(<SegmentedControl label="Breeze" options={OPTIONS} value="calm" onChange={() => {}} size="md" />);
    expect(screen.getByRole('radio', { name: 'Calm' }).closest('label')).toHaveClass('h-[38px]');
  });
});
