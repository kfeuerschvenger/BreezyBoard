import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingScreen } from './LoadingScreen';

describe('LoadingScreen', () => {
  it('is a status named by its label, and draws no text unless asked', () => {
    render(<LoadingScreen label="Loading boards" />);

    expect(screen.getByRole('status', { name: 'Loading boards' })).toBeInTheDocument();
    expect(screen.queryByText('Loading boards')).not.toBeInTheDocument();
  });

  it('draws the label under the mark when showLabel is set', () => {
    render(<LoadingScreen label="Loading boards" showLabel />);

    expect(screen.getByText('Loading boards')).toBeInTheDocument();
  });

  it('is as tall as the window on the ground colour by default', () => {
    const { container } = render(<LoadingScreen />);

    expect(container.firstElementChild).toHaveClass('min-h-screen', 'bg-ground');
  });

  it('fills the box it is placed in and paints no ground of its own as a parent fill', () => {
    const { container } = render(<LoadingScreen fill="parent" />);

    expect(container.firstElementChild).toHaveClass('flex-1');
    expect(container.firstElementChild).not.toHaveClass('min-h-screen', 'bg-ground');
  });

  it('takes only the room of the mark as an inline fill, so a dialog does not grow a window of empty space', () => {
    const { container } = render(<LoadingScreen fill="inline" />);

    expect(container.firstElementChild).toHaveClass('py-4');
    expect(container.firstElementChild).not.toHaveClass('min-h-screen', 'flex-1');
  });
});
