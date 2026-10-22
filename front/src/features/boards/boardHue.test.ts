import { describe, expect, it } from 'vitest';
import type { Color } from '@/models';
import { HUES } from '@/shared/ui';
import { boardHueOf, boardHueOptions } from './boardHue';

describe('boardHueOf', () => {
  it.each(HUES)('reads %s off a populated board colour', hue => {
    expect(boardHueOf({ _id: 'c', name: hue, value: hue })).toBe(hue);
  });

  it.each([
    ['a bare id', 'color-1'],
    ['a hex value', '#0052CC'],
    ['an entry whose value is a hex colour', { _id: 'c', value: '#0052CC' }],
    ['an entry whose value is not a hue', { _id: 'c', value: 'mauve' }],
    ['an entry with the hue in the wrong case', { _id: 'c', value: 'Sky' }],
    ['nothing', undefined],
    ['null', null],
  ])('answers the default hue for %s', (_label, color) => {
    expect(boardHueOf(color as never)).toBe('sky');
  });
});

describe('boardHueOptions', () => {
  const entry = (hue: string, name = hue): Color => ({ _id: `id-${hue}`, name, value: hue });

  it('lists the hues in their own order, not the order the server sent', () => {
    const palette = [entry('lavender'), entry('green'), entry('sky'), entry('coral'), entry('sand'), entry('teal')];

    expect(boardHueOptions(palette).map(option => option.hue)).toEqual([...HUES]);
  });

  it('carries the id to store, the name to show and the hue, mid step as the fill', () => {
    expect(boardHueOptions([entry('teal', 'Teal')])).toEqual([
      { id: 'id-teal', label: 'Teal', color: 'var(--color-teal-mid)', hue: 'teal' },
    ]);
  });

  it('leaves out an entry that names no hue', () => {
    const palette = [{ _id: 'old', name: 'Royal Blue', value: '#0052CC' }, entry('sky')];

    expect(boardHueOptions(palette).map(option => option.id)).toEqual(['id-sky']);
  });

  it('names an entry that has no name after its hue', () => {
    expect(boardHueOptions([{ _id: 'x', value: 'coral' }])[0].label).toBe('Coral');
  });

  it('offers nothing for an empty palette', () => {
    expect(boardHueOptions([])).toEqual([]);
  });
});
