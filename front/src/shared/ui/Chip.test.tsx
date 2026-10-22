import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Chip } from './index';
import { HUES } from './hue';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

describe('Chip', () => {
  it.each(HUES)('draws the %s chip as its deep text on its tint', hue => {
    render(<Chip hue={hue}>Dev</Chip>);

    const chip = screen.getByText('Dev');
    expect(chip).toHaveClass(`bg-${hue}-tint`, `text-${hue}-deep`);
  });

  // Tertiary text does not clear 4.5:1 on a chip tint: coral is 4.29:1. The
  // chip carries its own deep step so that no caller reaches for it.
  it.each([...HUES, 'neutral'] as const)('never uses tertiary text on the %s chip', hue => {
    render(<Chip hue={hue}>Dev</Chip>);

    expect(screen.getByText('Dev').className).not.toContain('text-ink-tertiary');
  });

  it('is neutral grey by default', () => {
    render(<Chip>Plain</Chip>);

    expect(screen.getByText('Plain')).toHaveClass('bg-line-06', 'text-ink-secondary');
  });

  it('draws the label variant as a round 11.5 pixel tag', () => {
    render(<Chip hue="teal">Trip</Chip>);

    expect(screen.getByText('Trip')).toHaveClass('rounded-pill', 'text-[11.5px]', 'font-semibold');
  });

  it('draws the status variant as a squarer 12 pixel chip', () => {
    render(
      <Chip hue="sand" variant="status">
        Today
      </Chip>
    );

    expect(screen.getByText('Today')).toHaveClass('rounded-chip', 'text-xs');
    expect(screen.getByText('Today')).not.toHaveClass('rounded-pill');
  });

  it('hides its icon from assistive technology and keeps the words', async () => {
    const { container } = render(
      <Chip hue="sand" variant="status" icon={<svg data-testid="icon" />}>
        Today
      </Chip>
    );

    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('renders no icon wrapper when there is no icon', () => {
    const { container } = render(<Chip>Plain</Chip>);

    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });
});
