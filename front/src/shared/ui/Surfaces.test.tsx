import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { EmptyState, LoadingScreen, StatTile, SwatchPicker } from './index';
import type { SwatchOption } from './index';
import { HUES } from './hue';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

/**
 * The restyled content primitives. Their roles, names and keyboard behaviour
 * are held by `primitives.a11y.test.tsx`; this file holds what the restyle
 * decided, which jsdom can only see as classes and attributes.
 */

describe('SwatchPicker swatches', () => {
  const OPTIONS: SwatchOption[] = [
    { id: 'sky', label: 'Sky', color: 'oklch(0.72 0.12 232)', hue: 'sky' },
    { id: 'plain', label: 'Slate', color: '#475569' },
  ];

  it('outlines a hue swatch in the edge step of its hue', () => {
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="sky" onChange={() => {}} />);

    const label = screen.getByRole('radio', { name: 'Sky' }).closest('label');
    expect(label).toHaveClass('border-sky-edge');
    expect(label?.className).not.toContain('border-line-control');
  });

  it('outlines a swatch with no hue in the control border colour', () => {
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="sky" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Slate' }).closest('label')).toHaveClass('border-line-control');
  });

  it('draws the double ring on the chosen swatch, grows any swatch on hover, and shows the keyboard ring', () => {
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="sky" onChange={() => {}} />);

    const label = screen.getByRole('radio', { name: 'Sky' }).closest('label');
    expect(label).toHaveClass('has-[:checked]:shadow-swatch-ring', 'hover:scale-115', 'focus-ring-within');
  });

  it('paints the swatch with its colour and keeps the radio out of sight but in the tab order', () => {
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="sky" onChange={() => {}} />);

    const radio = screen.getByRole('radio', { name: 'Slate' });
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).toHaveStyle({ backgroundColor: '#475569' });
  });

  it('draws a grid card in the control border and ink when chosen', () => {
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="sky" onChange={() => {}} layout="grid" />);

    const card = screen.getByRole('radio', { name: 'Sky' }).closest('label');
    expect(card).toHaveClass('border-line-control', 'has-[:checked]:border-ink', 'focus-ring-within');
  });

  it('reports the choice by keyboard and by click', async () => {
    const user = userEvent.setup();
    const chosen: string[] = [];
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="sky" onChange={id => chosen.push(id)} />);

    await user.click(screen.getByRole('radio', { name: 'Slate' }));

    expect(chosen).toEqual(['plain']);
  });

  it('shows the wait with a spinner icon that is not announced, and says what it waits for', async () => {
    const { container } = render(
      <SwatchPicker name="c" legend="Colour" options={[]} value="" onChange={() => {}} isLoading />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading colours');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveClass('animate-bb-spin');
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('shows the error in the danger step', () => {
    render(<SwatchPicker name="c" legend="Colour" options={OPTIONS} value="" onChange={() => {}} error="Pick one" />);

    expect(screen.getByRole('alert')).toHaveClass('text-danger-strong');
  });
});

describe('EmptyState', () => {
  it.each(HUES)('draws the circle on the %s tint with the deep step for an icon with no colour', hue => {
    render(<EmptyState icon={<span>i</span>} title="Nothing" tone={hue} />);

    expect(screen.getByText('i').parentElement).toHaveClass(`bg-${hue}-tint`, `text-${hue}-deep`);
  });

  it('is on the sky tint by default', () => {
    render(<EmptyState icon={<span>i</span>} title="Nothing" />);

    expect(screen.getByText('i').parentElement).toHaveClass('bg-sky-tint');
  });

  it('enters on bbUp when full size and on a fade when compact', () => {
    const { container, rerender } = render(<EmptyState icon={<span>i</span>} title="Nothing" />);
    expect(container.firstElementChild).toHaveClass('animate-bb-up');

    rerender(<EmptyState icon={<span>i</span>} title="Nothing" compact />);
    expect(container.firstElementChild).toHaveClass('animate-bb-fade');
  });

  it('sets the full size title in the display face at 26 pixels and the compact one at 15', () => {
    const { rerender } = render(<EmptyState icon={<span>i</span>} title="Nothing" />);
    expect(screen.getByRole('heading', { name: 'Nothing' })).toHaveClass('font-heading', 'text-[26px]');

    rerender(<EmptyState icon={<span>i</span>} title="Nothing" compact />);
    expect(screen.getByRole('heading', { name: 'Nothing' })).toHaveClass('font-heading', 'text-[15px]');
  });

  it('uses the heading level it is given', () => {
    const { rerender } = render(<EmptyState icon={<span>i</span>} title="Nothing" />);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();

    rerender(<EmptyState icon={<span>i</span>} title="Nothing" headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });
});

describe('StatTile', () => {
  it.each(HUES)('draws the %s tile icon on the tint with the deep step', hue => {
    render(<StatTile icon={<span>i</span>} tone={hue} value={1} label="Count" />);

    expect(screen.getByText('i').parentElement).toHaveClass(`bg-${hue}-tint`, `text-${hue}-deep`);
  });

  it('is a white raised tile with a figure in the display face', () => {
    render(<StatTile icon={<span>i</span>} tone="sky" value={7} label="Count" />);

    expect(screen.getByText('7').closest('div.animate-bb-up')).toHaveClass('bg-surface', 'rounded-tile', 'shadow-tile');
    expect(screen.getByText('7')).toHaveClass('font-heading', 'font-bold');
  });

  it('staggers its entrance with the animation delay, not with a timer', () => {
    render(<StatTile icon={<span>i</span>} tone="sky" value={7} label="Count" delay={0.3} />);

    expect(screen.getByText('7').closest('div.animate-bb-up')).toHaveStyle({ animationDelay: '0.3s' });
  });

  it('sets no delay when there is none', () => {
    render(<StatTile icon={<span>i</span>} tone="sky" value={7} label="Count" />);

    expect(screen.getByText('7').closest('div.animate-bb-up')?.getAttribute('style')).toBeNull();
  });
});

describe('LoadingScreen', () => {
  it('draws the brand mark and not a rotating border', () => {
    const { container } = render(<LoadingScreen label="Loading boards" />);

    expect(container.innerHTML).not.toContain('animate-spin');
    expect(container.innerHTML).not.toContain('border-blue');
    expect(screen.getByRole('status', { name: 'Loading boards' })).toBeInTheDocument();
  });

  it('sways the wind glyph, hides it from assistive technology, and puts it on the gradient mark', () => {
    render(<LoadingScreen />);

    const mark = screen.getByRole('status');
    expect(mark.querySelector('svg')).toHaveClass('animate-bb-sway');
    expect(mark.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveStyle({ background: 'var(--gradient-mark)' });
  });

  it('stands on the page ground', () => {
    const { container } = render(<LoadingScreen />);

    expect(container.firstElementChild).toHaveClass('bg-ground');
  });
});
