import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrioritySelect } from './PrioritySelect';

describe('PrioritySelect', () => {
  it('names the group and marks the current priority as the checked radio', () => {
    render(<PrioritySelect value="high" onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: /priority/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'High' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Low' })).not.toBeChecked();
  });

  it('reports the priority that was chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PrioritySelect value="medium" onChange={onChange} />);

    // The radio is sr-only, so what a person clicks is the label around it.
    await user.click(screen.getByText('Low'));

    expect(onChange).toHaveBeenCalledWith('low');
  });

  // This is an assertion about class names, which is normally the wrong way to
  // test a selection, and here it is the only way. The defect it guards is in
  // the class string itself: a variant composed at runtime names a rule the
  // stylesheet never generated, so the selected option is styled exactly like
  // the unselected ones. No behavioural assertion can see that, because the
  // test environment has no stylesheet to consult and the markup is correct.
  it('carries the selected styling as a variant rather than applying it to every option', () => {
    render(<PrioritySelect value="low" onChange={vi.fn()} />);

    for (const [label, tone] of [
      ['Low', 'green'],
      ['Medium', 'sand'],
      ['High', 'coral'],
    ]) {
      const option = screen.getByText(label).closest('label');
      const classes = option?.className ?? '';

      expect(classes).toContain(`has-[:checked]:bg-${tone}-tint`);
      expect(classes).toContain(`has-[:checked]:text-${tone}-deep`);
      // Unconditionally is the failure: it paints an option that is not chosen.
      expect(classes.split(/\s+/)).not.toContain(`text-${tone}-deep`);
      expect(classes.split(/\s+/)).not.toContain(`bg-${tone}-tint`);
    }
  });
});

describe('PrioritySelect ordering', () => {
  // Least urgent first. Nothing else pinned the order, so reversing it was a
  // change the whole suite would have let through, and a picker that reads
  // high to low invites the wrong click from anyone who has used the old one.
  it('offers the three in order of urgency, least first', () => {
    render(<PrioritySelect value="medium" onChange={() => {}} />);

    expect(screen.getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });
});
