import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EASE_EXIT, EASE_STANDARD } from './motionTokens';

// `motion` cannot read a CSS custom property, so the easings are repeated in
// TypeScript. This reads the stylesheet and holds the two copies together.
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

const tokenOf = (name: string): number[] => {
  const match = css.match(new RegExp(`--${name}:\\s*cubic-bezier\\(([^)]+)\\)`));
  if (!match) throw new Error(`--${name} is not declared in index.css`);
  return match[1].split(',').map(part => Number(part.trim()));
};

describe('motion easings', () => {
  it('repeat --ease-standard from the stylesheet', () => {
    expect([...EASE_STANDARD]).toEqual(tokenOf('ease-standard'));
  });

  it('repeat --ease-exit from the stylesheet', () => {
    expect([...EASE_EXIT]).toEqual(tokenOf('ease-exit'));
  });

  it('are different curves, so one cannot stand in for the other unnoticed', () => {
    expect([...EASE_STANDARD]).not.toEqual([...EASE_EXIT]);
  });
});
