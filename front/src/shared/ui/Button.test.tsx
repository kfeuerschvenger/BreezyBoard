import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, IconButton } from './index';
import type { ButtonVariant } from './index';

/**
 * jsdom loads no stylesheet, so what a utility class does is measured in a
 * real browser by `design-tokens.mjs`. These tests hold the contract that is
 * observable here: which classes each variant and size selects, and the
 * behaviour of the states.
 */

describe('Button', () => {
  it.each([
    ['primary', 'bg-ink'],
    ['secondary', 'border-line-12'],
    ['glass', 'bg-white/70'],
    ['ghost', 'text-ink-secondary'],
    ['danger', 'bg-danger'],
    ['danger-ghost', 'text-danger'],
  ] as [ButtonVariant, string][])('draws the %s variant with %s', (variant, expected) => {
    render(<Button variant={variant}>Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(expected);
  });

  it.each([
    ['sm', 'h-10'],
    ['md', 'h-11'],
    ['lg', 'h-13'],
  ] as const)('is %s tall at %s', (size, expected) => {
    render(<Button size={size}>Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass(expected);
  });

  it('defaults to the 44 pixel primary button', () => {
    render(<Button>Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('bg-ink', 'h-11');
  });

  it('lifts and presses only while enabled', () => {
    render(<Button>Go</Button>);

    const classes = screen.getByRole('button', { name: 'Go' }).className;
    expect(classes).toContain('enabled:hover:-translate-y-px');
    expect(classes).toContain('enabled:active:scale-[0.97]');
  });

  it('carries the shared focus ring', () => {
    render(<Button>Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('focus-ring');
  });

  describe('loading', () => {
    it('disables the button, marks it busy and shows a spinner that is not announced', () => {
      render(<Button isLoading>Saving</Button>);

      const button = screen.getByRole('button', { name: 'Saving' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(button.querySelector('svg')).toHaveClass('animate-bb-spin');
    });

    it('does not dim a busy button, because the spinner is its state', () => {
      render(<Button isLoading>Saving</Button>);

      expect(screen.getByRole('button', { name: 'Saving' })).not.toHaveClass('opacity-60');
    });

    it('does not run the handler while loading', async () => {
      const user = userEvent.setup();
      let pressed = 0;
      render(
        <Button isLoading onClick={() => (pressed += 1)}>
          Saving
        </Button>
      );

      await user.click(screen.getByRole('button', { name: 'Saving' }));

      expect(pressed).toBe(0);
    });

    it('replaces the left icon with the spinner', () => {
      render(
        <Button isLoading leftIcon={<span data-testid="left">L</span>}>
          Saving
        </Button>
      );

      expect(screen.queryByTestId('left')).not.toBeInTheDocument();
    });
  });

  describe('disabled', () => {
    it('is dimmed and has one cursor class', () => {
      render(<Button disabled>Go</Button>);

      const button = screen.getByRole('button', { name: 'Go' });
      expect(button).toHaveClass('opacity-60', 'cursor-not-allowed');
      expect(button).not.toHaveClass('cursor-pointer');
    });

    it('is not marked busy', () => {
      render(<Button disabled>Go</Button>);

      expect(screen.getByRole('button', { name: 'Go' })).not.toHaveAttribute('aria-busy');
    });
  });

  it('keeps the left icon when not loading', () => {
    render(<Button leftIcon={<span data-testid="left">L</span>}>Go</Button>);

    expect(screen.getByTestId('left')).toBeInTheDocument();
  });

  it('lets a caller class win over the layout it needs to change', () => {
    render(<Button className="flex-1">Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('flex-1');
  });
});

describe('IconButton', () => {
  it.each([
    ['sm', 'size-7.5'],
    ['md', 'size-9'],
    ['lg', 'size-11'],
  ] as const)('is %s sized at %s', (size, expected) => {
    render(
      <IconButton aria-label="Close" size={size}>
        x
      </IconButton>
    );

    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(expected);
  });

  it('is square by default and round on request', () => {
    const { rerender } = render(<IconButton aria-label="Close">x</IconButton>);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('rounded-button-small');

    rerender(
      <IconButton aria-label="Close" shape="round">
        x
      </IconButton>
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('rounded-pill');
  });

  it('colours its glyph from the button, never from the glyph', () => {
    render(<IconButton aria-label="Close">x</IconButton>);

    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('text-ink-secondary', 'enabled:hover:text-ink');
  });

  it('carries the shared focus ring and one cursor class', () => {
    render(
      <IconButton aria-label="Close" disabled>
        x
      </IconButton>
    );

    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveClass('focus-ring', 'cursor-not-allowed');
    expect(button).not.toHaveClass('cursor-pointer');
  });
});
