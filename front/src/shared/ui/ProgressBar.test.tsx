import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ProgressBar } from './index';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

describe('ProgressBar', () => {
  it('is a named progress bar carrying its value and bounds, with no violations', async () => {
    const { container } = render(<ProgressBar value={40} label="Board progress" />);

    const bar = screen.getByRole('progressbar', { name: 'Board progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('fills as much of the track as the value says', () => {
    render(<ProgressBar value={3} max={8} label="Landed" />);

    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '37.5%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '8');
  });

  it('moves when the value moves', () => {
    const { rerender } = render(<ProgressBar value={10} label="Landed" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '10%' });

    rerender(<ProgressBar value={90} label="Landed" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '90%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '90');
  });

  it('draws an empty bar for zero and a full bar for the maximum', () => {
    const { rerender } = render(<ProgressBar value={0} label="Landed" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '0%' });

    rerender(<ProgressBar value={100} label="Landed" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '100%' });
  });

  it('clamps a value past either end instead of overflowing the track', () => {
    const { rerender } = render(<ProgressBar value={150} label="Landed" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '100%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar value={-20} label="Landed" />);
    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '0%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('draws an empty bar, not a broken one, for a value that is not a number', () => {
    render(<ProgressBar value={Number.NaN} label="Landed" />);

    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '0%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('draws an empty bar when the maximum is zero, which a board with no cards has', () => {
    render(<ProgressBar value={0} max={0} label="Landed" />);

    expect(screen.getByTestId('progress-fill')).toHaveStyle({ width: '0%' });
  });

  it('speaks the value text instead of the percentage when it is given', () => {
    render(<ProgressBar value={3} max={8} label="Landed" valueText="3 of 8 landed" />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '3 of 8 landed');
  });

  it('is 6 pixels by default and 8 on request', () => {
    const { rerender } = render(<ProgressBar value={10} label="Landed" />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-1.5', 'bg-line-07');

    rerender(<ProgressBar value={10} label="Landed" size={8} />);
    expect(screen.getByRole('progressbar')).toHaveClass('h-2', 'bg-line-08');
  });

  it('fills a solid bar with the edge step of its hue', () => {
    render(<ProgressBar value={10} label="Landed" hue="teal" />);

    expect(screen.getByTestId('progress-fill')).toHaveClass('bg-teal-edge');
  });

  it('fills a gradient bar from one hue to another, and not with a solid class', () => {
    render(<ProgressBar value={10} label="Landed" variant="gradient" hue="sky" toHue="green" />);

    const fill = screen.getByTestId('progress-fill');
    expect(fill.getAttribute('style')).toContain('linear-gradient(90deg, var(--color-sky-edge), var(--color-green-edge))');
    expect(fill.className).not.toContain('bg-sky-edge');
  });
});
