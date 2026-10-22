import { describe, expect, test } from 'vitest';
import { BOARD_HUES, hueAngleOf, nearestBoardHue } from '../src/constants/boardHues.js';
import ColorPalette from '../src/models/ColorPalette.js';

describe('nearestBoardHue', () => {
  // The eight colours the board palette held before the hues, with the hue each
  // is expected to land on. Each one is the closest angle on the wheel, and the
  // two that sit close to a boundary are pinned on purpose: the old Teal, at
  // 164.7 degrees, is 14.7 from green and 27.3 from teal, and Amber, at 58.8
  // degrees, is 20.8 from coral and 23.2 from sand.
  test.each([
    ['#0052CC', 'sky'],
    ['#6B3FA0', 'lavender'],
    ['#2F9E44', 'green'],
    ['#FF9700', 'sand'],
    ['#0CA678', 'green'],
    ['#F783AC', 'coral'],
    ['#F08A24', 'coral'],
    ['#00B4D8', 'sky'],
  ])('maps %s to %s', (hex, hue) => {
    expect(nearestBoardHue(hex)).toBe(hue);
  });

  test('a hue key maps to itself', () => {
    for (const hue of BOARD_HUES) {
      expect(nearestBoardHue(hue)).toBe(hue);
    }
  });

  test('accepts the short hex form and any letter case', () => {
    expect(nearestBoardHue('#0af')).toBe(nearestBoardHue('#00AAFF'));
    expect(nearestBoardHue('#2f9e44')).toBe('green');
  });

  test('a grey, and anything that is not a colour, maps to the default hue', () => {
    for (const value of ['#808080', '#000000', '#FFFFFF', 'not a colour', '', null, undefined]) {
      expect(nearestBoardHue(value)).toBe('sky');
    }
  });

  test('measures the angle round the wheel, so a red either side of zero lands on coral', () => {
    expect(nearestBoardHue('#E8334A')).toBe('coral');
    expect(nearestBoardHue('#FF3B7A')).toBe('coral');
  });

  test('reads a known colour at the angle OKLCH gives it', () => {
    // Pure sRGB blue is at about 264 degrees in OKLCH.
    expect(hueAngleOf('#0000FF').hue).toBeCloseTo(264.05, 0);
    expect(hueAngleOf('nope')).toBeNull();
  });
});

describe('the board palette model', () => {
  test('stores a hue key as a board colour', async () => {
    const entry = await ColorPalette.create({ name: 'Teal', value: 'teal', type: 'board' });
    expect(entry.value).toBe('teal');
  });

  test('refuses a hex value as a board colour', async () => {
    await expect(ColorPalette.create({ name: 'Blue', value: '#0052CC', type: 'board' })).rejects.toThrow(
      /six design hues/
    );
  });

  test('refuses a hue key that is not one of the six', async () => {
    await expect(ColorPalette.create({ name: 'Mauve', value: 'mauve', type: 'board' })).rejects.toThrow(
      /six design hues/
    );
  });

  test('task and column colours keep their hex values', async () => {
    await expect(ColorPalette.create({ name: 'Coral', value: '#FF6B6B', type: 'task' })).resolves.toBeDefined();
    await expect(ColorPalette.create({ name: 'Slate', value: '#64748B', type: 'column' })).resolves.toBeDefined();
  });
});
