import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BREEZE_STORAGE_KEY, readStoredBreeze, writeStoredBreeze } from './breezeStorage';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('reading the remembered level', () => {
  it('is the default, breezy, when nothing was stored', () => {
    expect(readStoredBreeze()).toBe('breezy');
  });

  it.each(['still', 'calm', 'breezy', 'gusty'] as const)('returns %s as stored', level => {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, level);

    expect(readStoredBreeze()).toBe(level);
  });

  it.each([[''], ['Gusty'], ['hurricane'], ['3'], ['{}']])('reads %j as the default', value => {
    window.localStorage.setItem(BREEZE_STORAGE_KEY, value);

    expect(readStoredBreeze()).toBe('breezy');
  });

  it('is the default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readStoredBreeze()).toBe('breezy');
  });

  it('is the default when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    try {
      expect(readStoredBreeze()).toBe('breezy');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('writing the level', () => {
  it('stores it under bb.breeze', () => {
    writeStoredBreeze('calm');

    expect(window.localStorage.getItem('bb.breeze')).toBe('calm');
    expect(readStoredBreeze()).toBe('calm');
  });

  it('does not throw when storage refuses', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => writeStoredBreeze('gusty')).not.toThrow();
  });
});
