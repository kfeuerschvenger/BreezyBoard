import { describe, it, expect } from 'vitest';
import type { Column } from '@/models';
import {
  COLUMN_NAME_MAX_LENGTH,
  MAX_COLUMNS,
  columnNameProblem,
  columnPositions,
  columnRowsSchema,
  columnRowsSchemaFor,
  columnsChanged,
  columnsRequest,
  nextColumnHue,
  rowsFromColumns,
} from './boardColumns';

const row = (title: string, columnId?: string) => ({ ...(columnId && { columnId }), title, color: 'c-sky' });

describe('nextColumnHue', () => {
  it('walks the reference cycle by hue angle: sky, sand, lavender, teal, coral', () => {
    expect([0, 1, 2, 3, 4].map(nextColumnHue)).toEqual(['sky', 'sand', 'lavender', 'teal', 'coral']);
  });

  it('goes round again after the fifth, and never lands on green, which the cycle has no angle for', () => {
    const hues = Array.from({ length: 16 }, (_, index) => nextColumnHue(index));

    expect(hues.slice(5, 10)).toEqual(['sky', 'sand', 'lavender', 'teal', 'coral']);
    expect(hues).not.toContain('green');
  });
});

describe('rowsFromColumns', () => {
  it('lists the columns first to last with the id of their colour, populated or not', () => {
    const columns: Column[] = [
      { _id: 'b', title: 'Done', color: { _id: 'c-green', value: 'green' }, order: 1 },
      { _id: 'a', title: 'Backlog', color: 'c-sky', order: 0 },
    ];

    expect(rowsFromColumns(columns)).toEqual([
      { columnId: 'a', title: 'Backlog', color: 'c-sky' },
      { columnId: 'b', title: 'Done', color: 'c-green' },
    ]);
  });
});

describe('columnsRequest', () => {
  it('sends an id for a column that exists and none for a new one, with the names trimmed', () => {
    expect(columnsRequest([row('  Backlog ', 'a'), row('Review')])).toEqual([
      { _id: 'a', title: 'Backlog', color: 'c-sky' },
      { title: 'Review', color: 'c-sky' },
    ]);
  });
});

describe('columnsChanged', () => {
  const initial = [row('Backlog', 'a'), row('Done', 'b')];

  it('is false for the same columns, even with spaces around a name', () => {
    expect(columnsChanged(initial, [row(' Backlog ', 'a'), row('Done', 'b')])).toBe(false);
  });

  it.each([
    ['a rename', [row('Inbox', 'a'), row('Done', 'b')]],
    ['a new order', [row('Done', 'b'), row('Backlog', 'a')]],
    ['a new column', [row('Backlog', 'a'), row('Review'), row('Done', 'b')]],
    ['a removal', [row('Backlog', 'a')]],
    ['a new colour', [{ ...row('Backlog', 'a'), color: 'c-coral' }, row('Done', 'b')]],
  ])('is true for %s', (_label, rows) => {
    expect(columnsChanged(initial, rows)).toBe(true);
  });
});

describe('columnPositions', () => {
  it('offers first, between each two neighbours and last, named by the columns around them', () => {
    expect(columnPositions(['Backlog', 'Doing', 'Done'])).toEqual([
      { index: 0, label: 'First, before Backlog' },
      { index: 1, label: 'Between Backlog and Doing' },
      { index: 2, label: 'Between Doing and Done' },
      { index: 3, label: 'Last, after Done' },
    ]);
  });

  it('follows a name typed a moment ago, and says so when one is empty', () => {
    expect(columnPositions(['', 'Done']).map(position => position.label)).toEqual([
      'First, before an unnamed column',
      'Between an unnamed column and Done',
      'Last, after Done',
    ]);
  });
});

describe('columnNameProblem', () => {
  it('accepts a name of 1 to 40 characters after trimming', () => {
    expect(columnNameProblem('  a  ', [])).toBeNull();
    expect(columnNameProblem('a'.repeat(COLUMN_NAME_MAX_LENGTH), [])).toBeNull();
  });

  it('refuses an empty name, one that is only spaces and one of 41 characters', () => {
    expect(columnNameProblem('', [])).toMatch(/needs a name/);
    expect(columnNameProblem('   ', [])).toMatch(/needs a name/);
    expect(columnNameProblem('a'.repeat(COLUMN_NAME_MAX_LENGTH + 1), [])).toMatch(/at most 40/);
  });

  it('refuses a name another column has, ignoring case and the spaces around it', () => {
    expect(columnNameProblem('done', ['Backlog', 'Done'])).toMatch(/already has that name/);
    expect(columnNameProblem('  DONE ', ['Done'])).toMatch(/already has that name/);
    expect(columnNameProblem('Review', ['Backlog', 'Done'])).toBeNull();
  });
});

describe('columnRowsSchema', () => {
  const valid = [row('Backlog', 'a'), row('Done', 'b')];

  it('accepts 2 to 8 columns', () => {
    expect(columnRowsSchema.safeParse(valid).success).toBe(true);
    expect(
      columnRowsSchema.safeParse(Array.from({ length: MAX_COLUMNS }, (_, index) => row(`Column ${index}`))).success
    ).toBe(true);
  });

  it('refuses fewer than 2 and more than 8', () => {
    expect(columnRowsSchema.safeParse([row('Only')]).success).toBe(false);
    expect(
      columnRowsSchema.safeParse(Array.from({ length: MAX_COLUMNS + 1 }, (_, index) => row(`Column ${index}`))).success
    ).toBe(false);
  });

  it('trims names and refuses an empty one or one over 40 characters', () => {
    const parsed = columnRowsSchema.safeParse([row('  Backlog  '), row('Done')]);

    expect(parsed.success && parsed.data[0].title).toBe('Backlog');
    expect(columnRowsSchema.safeParse([row('   '), row('Done')]).success).toBe(false);
    expect(columnRowsSchema.safeParse([row('a'.repeat(41)), row('Done')]).success).toBe(false);
  });

  it('refuses two columns with the same name ignoring case, and points at the second', () => {
    const parsed = columnRowsSchema.safeParse([row('Done'), row('Doing'), row('DONE')]);

    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0].path).toEqual([2, 'title']);
  });

  it('can be made to accept a board that already has fewer than the minimum', () => {
    expect(columnRowsSchemaFor(0).safeParse([]).success).toBe(true);
  });
});
