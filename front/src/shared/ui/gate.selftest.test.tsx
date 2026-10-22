import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

/**
 * Proves the gate can fail.
 *
 * Every accessibility test in this repository asserts an absence, and an
 * assertion of absence passes just as happily when the thing doing the
 * checking is not wired up at all. This renders markup with a violation
 * nobody disputes, and fails if axe reports it clean.
 */
describe('the accessibility gate itself', () => {
  it('reports a violation when there is one', async () => {
    // An input with no label and no accessible name of any kind.
    const { container } = render(<input type="text" />);

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });

    expect(results.violations.length).toBeGreaterThan(0);
    expect(results.violations.map(violation => violation.id)).toContain('label');
  });

  it('reports the same markup clean once the violation is fixed', async () => {
    const { container } = render(
      <>
        <label htmlFor="named">Your name</label>
        <input id="named" type="text" />
      </>
    );

    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });

    expect(results.violations).toHaveLength(0);
  });
});
