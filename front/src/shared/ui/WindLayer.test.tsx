import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { WindLayer } from './index';

const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

/** A `matchMedia` that answers yes to the reduced motion query and no to the rest. */
const stubReducedMotion = (reduced: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
  );
};

afterEach(() => vi.unstubAllGlobals());

const streaksOf = (container: HTMLElement) => container.querySelectorAll('svg path');
const particlesOf = (container: HTMLElement) => container.querySelectorAll('div > span');

describe('WindLayer levels', () => {
  it('draws nothing at all at the still level', () => {
    const { container } = render(<WindLayer level="still" />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['calm', 3, 3],
    ['breezy', 6, 9],
    ['gusty', 11, 20],
  ] as const)('draws %s with %i streaks and %i particles', (level, streaks, particles) => {
    const { container } = render(<WindLayer level={level} />);

    expect(streaksOf(container)).toHaveLength(streaks);
    expect(particlesOf(container)).toHaveLength(particles);
  });

  it('is breezy when no level is given', () => {
    const { container } = render(<WindLayer />);

    expect(streaksOf(container)).toHaveLength(6);
    expect(particlesOf(container)).toHaveLength(9);
  });

  it('draws more streaks as the wind rises', () => {
    const counts = (['calm', 'breezy', 'gusty'] as const).map(level => {
      const { container, unmount } = render(<WindLayer level={level} />);
      const count = streaksOf(container).length;
      unmount();
      return count;
    });

    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(new Set(counts).size).toBe(3);
  });

  it('changes what it draws when the level changes', () => {
    const { container, rerender } = render(<WindLayer level="calm" />);
    expect(streaksOf(container)).toHaveLength(3);

    rerender(<WindLayer level="gusty" />);
    expect(streaksOf(container)).toHaveLength(11);

    rerender(<WindLayer level="still" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WindLayer and reduced motion', () => {
  it('renders nothing when the person asks for reduced motion', () => {
    stubReducedMotion(true);

    const { container } = render(<WindLayer level="gusty" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders at every level when they do not', () => {
    stubReducedMotion(false);

    const { container } = render(<WindLayer level="gusty" />);

    expect(streaksOf(container)).toHaveLength(11);
  });
});

describe('WindLayer is decoration', () => {
  it('is hidden from assistive technology and takes no pointer events', async () => {
    const { container } = render(<WindLayer />);

    const layer = container.firstElementChild;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toHaveClass('pointer-events-none', 'absolute', 'inset-0', 'overflow-hidden');
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });

  it('exposes nothing to a screen reader reading the page', () => {
    const { container } = render(
      <div>
        <WindLayer level="gusty" />
        <p>Page text</p>
      </div>
    );

    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(container.querySelector('svg'));
  });

  it('draws its streaks on a 1440 by 900 canvas that stretches to the box', () => {
    const { container } = render(<WindLayer />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 1440 900');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
  });
});

describe('WindLayer is deterministic', () => {
  it('renders identical markup for identical props', () => {
    const first = render(<WindLayer level="gusty" tone="dark" />);
    const markup = first.container.innerHTML;
    first.unmount();

    const second = render(<WindLayer level="gusty" tone="dark" />);

    expect(second.container.innerHTML).toBe(markup);
  });

  it('does not change its markup when it is rendered again with the same props', () => {
    const { container, rerender } = render(<WindLayer level="breezy" />);
    const before = container.innerHTML;

    rerender(<WindLayer level="breezy" />);

    expect(container.innerHTML).toBe(before);
  });

  it('gives the streaks the formulas of the specification by index', () => {
    const { container } = render(<WindLayer level="breezy" />);

    const second = streaksOf(container)[1];
    expect(second.getAttribute('d')).toBe('M-80 207 C 260 124, 520 290, 820 173.8 S 1260 124, 1540 231.9');
    expect(second.getAttribute('stroke-dasharray')).toBe('155 1890');
    expect(second.getAttribute('pathLength')).toBe('1000');
    expect((second as SVGPathElement).style.animation).toContain('bbFlow 16.00s linear -3.10s infinite');
  });

  it('runs each particle on its own drift', () => {
    const { container } = render(<WindLayer level="breezy" />);

    const durations = Array.from(particlesOf(container)).map(el => (el as HTMLElement).style.animation);
    expect(durations[0]).toContain('bbDrift 14.00s');
    expect(durations[1]).toContain('bbDrift 19.00s');
    expect(new Set(durations).size).toBeGreaterThan(2);
  });

  it('speeds every animation up at the gusty level', () => {
    const calm = render(<WindLayer level="calm" />);
    const calmDuration = Number.parseFloat(((streaksOf(calm.container)[1] as SVGPathElement).style.animation.match(/bbFlow ([\d.]+)s/) ?? [])[1]);
    calm.unmount();

    const gusty = render(<WindLayer level="gusty" />);
    const gustyDuration = Number.parseFloat(((streaksOf(gusty.container)[1] as SVGPathElement).style.animation.match(/bbFlow ([\d.]+)s/) ?? [])[1]);

    expect(gustyDuration).toBeLessThan(calmDuration);
  });
});

describe('WindLayer follows its props', () => {
  it('redraws when only the tone changes', () => {
    const { container, rerender } = render(<WindLayer level="breezy" tone="light" />);
    expect(streaksOf(container)[0].getAttribute('stroke')).toContain('rgba(255,255,255');

    rerender(<WindLayer level="breezy" tone="dark" />);

    expect(streaksOf(container)[0].getAttribute('stroke')).toContain('oklch');
  });

  it('paces the particles with the level as well as the streaks', () => {
    const durationOf = (container: HTMLElement) =>
      Number.parseFloat(((particlesOf(container)[1] as HTMLElement).style.animation.match(/bbDrift ([0-9.]+)s/) ?? [])[1]);

    const calm = render(<WindLayer level="calm" />);
    const calmDuration = durationOf(calm.container);
    calm.unmount();
    const gusty = render(<WindLayer level="gusty" />);

    expect(durationOf(gusty.container)).toBeLessThan(calmDuration);
  });
});

describe('WindLayer tone', () => {
  it('draws white streaks and particles on the light tone', () => {
    const { container } = render(<WindLayer tone="light" />);

    expect(streaksOf(container)[0].getAttribute('stroke')).toBe('rgba(255,255,255,0.35)');
    expect((particlesOf(container)[0] as HTMLElement).style.background).toContain('rgba(255, 255, 255, 0.85)');
  });

  it('draws coloured streaks and particles on the dark tone', () => {
    const { container } = render(<WindLayer tone="dark" />);

    expect(streaksOf(container)[0].getAttribute('stroke')).toBe('oklch(0.62 0.12 232 / 0.22)');
    expect(streaksOf(container)[1].getAttribute('stroke')).toBe('oklch(0.62 0.12 192 / 0.28)');
    expect((particlesOf(container)[0] as HTMLElement).style.background).toContain('oklch');
  });

  it('is light by default', () => {
    const { container } = render(<WindLayer />);

    expect(streaksOf(container)[0].getAttribute('stroke')).toContain('rgba(255,255,255');
  });

  it('draws even particles as leaves and odd ones as dots', () => {
    const { container } = render(<WindLayer level="breezy" />);

    const [leaf, dot] = Array.from(particlesOf(container)) as HTMLElement[];
    expect(leaf.style.width).toBe('9px');
    expect(leaf.style.borderRadius).toBe('70% 0 70% 0');
    expect(dot.style.height).toBe('3px');
    expect(dot.style.borderRadius).toBe('50%');
  });
});
