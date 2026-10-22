import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Cover } from './index';
import { coverGradient } from './hue';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

describe('Cover', () => {
  it('draws the hue gradient when there is no image', () => {
    const { container } = render(<Cover hue="coral" className="h-24" />);

    expect(container.firstElementChild).toHaveStyle({ background: coverGradient('coral') });
    expect(container.querySelector('img')).toBeNull();
  });

  it('is decorative by default: hidden from assistive technology, with no role', async () => {
    const { container } = render(<Cover hue="sky" src="/uploads/cover.png" />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('shows the image over the gradient when there is one', () => {
    const { container } = render(<Cover hue="sky" src="/uploads/cover.png" />);

    expect(container.querySelector('img')).toHaveAttribute('src', '/uploads/cover.png');
    expect(container.firstElementChild).toHaveStyle({ background: coverGradient('sky') });
  });

  it('becomes a named image when it is given alt text', async () => {
    const { container } = render(<Cover hue="sky" src="/uploads/cover.png" alt="Fitz Roy at dawn" />);

    expect(screen.getByRole('img', { name: 'Fitz Roy at dawn' })).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute('aria-hidden');
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  // The wrapper carries the name, so the inner image must not repeat it.
  it('leaves the naming to the wrapper rather than to the image', () => {
    const { container } = render(<Cover hue="sky" src="/uploads/cover.png" alt="Fitz Roy at dawn" />);

    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('falls back to the gradient when the image fails to load', () => {
    const { container } = render(<Cover hue="teal" src="/uploads/missing.png" />);

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild).toHaveStyle({ background: coverGradient('teal') });
  });

  it('tries a new image after a failed one is replaced', () => {
    const { container, rerender } = render(<Cover hue="teal" src="/uploads/missing.png" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(<Cover hue="teal" src="/uploads/new.png" />);

    expect(container.querySelector('img')).toHaveAttribute('src', '/uploads/new.png');
  });

  it('renders its children above the picture', () => {
    render(
      <Cover hue="sky">
        <span data-testid="overlay">wave</span>
      </Cover>
    );

    expect(screen.getByTestId('overlay')).toBeInTheDocument();
  });

  it('takes its size from the caller', () => {
    const { container } = render(<Cover hue="sky" className="h-24 w-full" />);

    expect(container.firstElementChild).toHaveClass('h-24', 'w-full', 'relative', 'overflow-hidden');
  });
});
