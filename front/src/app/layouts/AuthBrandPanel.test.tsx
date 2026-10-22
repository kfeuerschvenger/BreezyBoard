import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { restoreMatchMedia, stubMatchMedia } from '@/test/matchMedia';
import { BREEZE_STORAGE_KEY } from '@/features/breeze';
import { AuthBrandPanel } from './AuthBrandPanel';

const REDUCED = '(prefers-reduced-motion: reduce)';

const renderPanel = () => {
  const { container } = render(<AuthBrandPanel />);
  const panel = container.querySelector('aside') as HTMLElement;
  return {
    panel,
    streaks: () => panel.querySelectorAll('.pointer-events-none svg path').length,
    floating: () => panel.querySelectorAll('.animate-bb-float-a, .animate-bb-float-b').length,
  };
};

beforeEach(() => {
  window.localStorage.clear();
  stubMatchMedia({ [REDUCED]: false });
});

afterEach(restoreMatchMedia);

describe('the brand panel wind', () => {
  it('plays the default, breezy, when nothing is stored', () => {
    const view = renderPanel();

    expect(view.panel).toHaveAttribute('data-breeze', 'breezy');
    expect(view.streaks()).toBe(6);
    expect(view.floating()).toBe(2);
  });

  it('plays the stored level', () => {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, 'gusty');

    const view = renderPanel();

    expect(view.panel).toHaveAttribute('data-breeze', 'gusty');
    expect(view.streaks()).toBe(11);
    expect(view.floating()).toBe(2);
  });

  it('stops all ambient motion when the stored level is still', () => {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, 'still');

    const view = renderPanel();

    expect(view.panel).toHaveAttribute('data-breeze', 'still');
    expect(view.streaks()).toBe(0);
    expect(view.floating()).toBe(0);
  });

  it('falls back to the default when the stored value is not a level', () => {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, 'hurricane');

    expect(renderPanel().panel).toHaveAttribute('data-breeze', 'breezy');
  });

  it('is held at still by the system preference, and leaves the stored choice in place', () => {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, 'gusty');
    stubMatchMedia({ [REDUCED]: true });

    const view = renderPanel();

    expect(view.panel).toHaveAttribute('data-breeze', 'still');
    expect(view.streaks()).toBe(0);
    expect(view.floating()).toBe(0);
    expect(window.localStorage.getItem(BREEZE_STORAGE_KEY)).toBe('gusty');
  });
});
