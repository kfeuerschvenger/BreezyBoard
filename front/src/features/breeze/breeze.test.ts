import { describe, expect, it } from 'vitest';
import { BREEZE_KMH, BREEZE_LABEL, BREEZE_LEVELS, DEFAULT_BREEZE, asBreezeLevel } from './breeze';

describe('the breeze levels', () => {
  it('run from none to the most, and the default is the middle one', () => {
    expect(BREEZE_LEVELS).toEqual(['still', 'calm', 'breezy', 'gusty']);
    expect(DEFAULT_BREEZE).toBe('breezy');
  });

  it('have the speeds of the reference design, and a label each', () => {
    expect(BREEZE_KMH).toEqual({ still: 0, calm: 12, breezy: 38, gusty: 74 });
    expect(BREEZE_LEVELS.map(level => BREEZE_LABEL[level])).toEqual(['Still', 'Calm', 'Breezy', 'Gusty']);
  });

  it.each(['still', 'calm', 'breezy', 'gusty'])('read %s as itself', level => {
    expect(asBreezeLevel(level)).toBe(level);
  });

  it.each([[undefined], [null], [''], ['Gusty'], ['hurricane'], [3], [{}]])('read %s as the default', value => {
    expect(asBreezeLevel(value)).toBe('breezy');
  });
});
