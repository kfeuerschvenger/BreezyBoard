import { render } from '@testing-library/react';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';
import { resolveIcon } from '@/shared/lib/templateIcons';
import { Icon } from './Icon';

describe('Icon', () => {
  it('hides a bare glyph from assistive technology', () => {
    const { container } = render(<Icon as={IconPlus} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves a glyph that carries its own label exposed', () => {
    const { container } = render(<Icon as={IconPlus} aria-label="Add" />);
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden');
  });

  it('draws every glyph with the shared stroke width unless told otherwise', () => {
    const { container } = render(
      <>
        <Icon as={IconPlus} />
        <Icon as={IconFolder} stroke={1.25} />
      </>
    );
    const [first, second] = Array.from(container.querySelectorAll('svg'));
    expect(first).toHaveAttribute('stroke-width', '1.75');
    expect(second).toHaveAttribute('stroke-width', '1.25');
  });
});

describe('resolveIcon', () => {
  it('returns the folder for a missing or unknown name', () => {
    expect(resolveIcon(undefined)).toBe(IconFolder);
    expect(resolveIcon(null)).toBe(IconFolder);
    expect(resolveIcon('NoSuchIcon')).toBe(IconFolder);
  });

  it('resolves every name the seeded templates store to a distinct glyph', () => {
    const names = ['CheckSquare', 'Target', 'Bug', 'FileText', 'Phone', 'MessageSquare', 'UserPlus', 'AlertTriangle'];
    const glyphs = new Set(names.map(resolveIcon));
    expect(glyphs.size).toBe(names.length);
    expect(glyphs.has(IconFolder)).toBe(false);
  });
});
