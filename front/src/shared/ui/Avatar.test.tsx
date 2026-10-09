import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Avatar } from './index';
import { HUES, hueFromSeed } from './hue';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

/**
 * What the fill, the ink and the ring compute to is measured in a real
 * browser by `design-tokens.mjs`, which also records the contrast of ink on
 * every mid step. These hold the contract that is visible without a
 * stylesheet.
 */

const fillOf = (element: HTMLElement) => HUES.find(hue => element.classList.contains(`bg-${hue}-mid`));

describe('Avatar fill', () => {
  it('is the mid step of one of the six hues, with ink initials', () => {
    render(<Avatar name="Ada Lovelace" />);

    const avatar = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(fillOf(avatar)).toBeDefined();
    expect(avatar).toHaveClass('text-ink');
  });

  it('is the same hue for the same person every time', () => {
    const { unmount } = render(<Avatar name="Ada Lovelace" />);
    const first = fillOf(screen.getByRole('img'));
    unmount();

    render(<Avatar name="Ada Lovelace" />);

    expect(fillOf(screen.getByRole('img'))).toBe(first);
  });

  it('is derived from the name, ignoring case and surrounding space', () => {
    render(
      <div>
        <Avatar name="Ada Lovelace" />
        <Avatar name="  ada lovelace " />
      </div>
    );

    const [a, b] = screen.getAllByRole('img');
    expect(fillOf(a)).toBe(fillOf(b));
  });

  it('follows the seed when there is one, so a renamed person keeps their colour', () => {
    const { unmount } = render(<Avatar name="Ada Lovelace" seed="64f1c0ffee" />);
    const before = fillOf(screen.getByRole('img'));
    unmount();

    render(<Avatar name="Ada King" seed="64f1c0ffee" />);

    expect(fillOf(screen.getByRole('img'))).toBe(before);
    expect(before).toBe(hueFromSeed('64f1c0ffee'));
  });

  it('takes a hue directly when one is given, over the seed', () => {
    render(<Avatar name="Ada Lovelace" seed="anything" hue="lavender" />);

    expect(screen.getByRole('img')).toHaveClass('bg-lavender-mid');
  });

  it('spreads a set of different people across several hues', () => {
    const names = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Linus Torvalds', 'Margaret Hamilton', 'Dennis Ritchie'];
    render(
      <div>
        {names.map(name => (
          <Avatar key={name} name={name} />
        ))}
      </div>
    );

    const hues = new Set(screen.getAllByRole('img').map(fillOf));
    expect(hues.size).toBeGreaterThan(2);
  });

  it.each(HUES)('draws a %s avatar with its own mid fill and no other', hue => {
    render(<Avatar name="Ada Lovelace" hue={hue} />);

    const avatar = screen.getByRole('img');
    expect(avatar).toHaveClass(`bg-${hue}-mid`);
    expect(HUES.filter(other => avatar.classList.contains(`bg-${other}-mid`))).toEqual([hue]);
  });
});

describe('Avatar ring', () => {
  it('has none by default', () => {
    render(<Avatar name="Ada Lovelace" />);

    expect(screen.getByRole('img').className).not.toContain('ring-');
  });

  it('draws the white ring of an avatar on a card', () => {
    render(<Avatar name="Ada Lovelace" ring="surface" />);

    expect(screen.getByRole('img')).toHaveClass('ring-2', 'ring-surface');
  });

  it('draws the page coloured ring of an avatar on the ground', () => {
    render(<Avatar name="Ada Lovelace" ring="ground" />);

    expect(screen.getByRole('img')).toHaveClass('ring-[2.5px]', 'ring-ground');
  });
});

describe('Avatar semantics are unchanged by the colour', () => {
  it('is named, or hidden, never both, in every hue', async () => {
    const { container } = render(
      <div>
        {HUES.map(hue => (
          <Avatar key={hue} name={`Person ${hue}`} hue={hue} />
        ))}
        <Avatar name="Hidden Person" decorative />
      </div>
    );

    expect(screen.getAllByRole('img')).toHaveLength(HUES.length);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('sets the large avatar initials in the display face', () => {
    render(<Avatar name="Ada Lovelace" size="xl" />);

    expect(screen.getByRole('img')).toHaveClass('font-heading', 'text-3xl');
  });
});
