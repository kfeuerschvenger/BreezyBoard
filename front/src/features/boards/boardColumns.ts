import { z } from 'zod';
import type { Column } from '@/models';
import { HUES, HUE_ANGLE } from '@/shared/ui';
import type { Hue } from '@/shared/ui';

/** The most columns a board has, and the fewest: the server enforces both. */
export const MAX_COLUMNS = 8;
export const MIN_COLUMNS = 2;
export const COLUMN_NAME_MAX_LENGTH = 40;

/** What the dialog says when a changed list has fewer columns than a board keeps. */
export const MIN_COLUMNS_MESSAGE = `A board needs at least ${MIN_COLUMNS} columns; add one before saving.`;

/**
 * The hue angles of the reference design's column cycle, in its order. They are
 * turned into hues through the token layer's own angles, so the cycle is a
 * statement about the design system and not a second list of colour names.
 */
const COLUMN_CYCLE_ANGLES = [232, 82, 300, 192, 38] as const;

const COLUMN_HUE_CYCLE: readonly Hue[] = COLUMN_CYCLE_ANGLES.flatMap(angle => {
  const hue = HUES.find(candidate => HUE_ANGLE[candidate] === angle);
  return hue ? [hue] : [];
});

/**
 * The hue a new column starts on: the one the cycle holds at the column's
 * position, going round again after the fifth. It is only a starting point.
 * The colour is stored and the owner can change it, so adding or removing a
 * column never recolours the others.
 */
export const nextColumnHue = (existingCount: number): Hue => COLUMN_HUE_CYCLE[existingCount % COLUMN_HUE_CYCLE.length];

/** One column in the edit dialog: the board's own, or one added there. */
export interface ColumnRow {
  /** The column's id. Absent on a column added in the dialog, which the server gives one. */
  columnId?: string;
  title: string;
  /** The id of the palette entry for the column's hue. */
  color: string;
}

/** A column as the update request carries it. */
export interface ColumnChange {
  _id?: string;
  title: string;
  color: string;
}

const columnRowSchema = z.object({
  columnId: z.string().optional(),
  title: z
    .string()
    .trim()
    .min(1, 'A column needs a name')
    .max(COLUMN_NAME_MAX_LENGTH, `A column name is at most ${COLUMN_NAME_MAX_LENGTH} characters`),
  color: z.string().min(1, 'Choose a colour'),
});

/**
 * The columns of a board as the dialog holds them. Names are compared ignoring
 * case because the task modal's move buttons, the positions in this dialog and
 * the toast that says where a card landed all name a column by its title.
 */
export const columnRowsSchemaFor = (minimum: number) =>
  z
    .array(columnRowSchema)
    .min(minimum, `A board keeps at least ${MIN_COLUMNS} columns`)
    .max(MAX_COLUMNS, `A board has at most ${MAX_COLUMNS} columns`)
    .superRefine((rows, context) => {
      const seen = new Set<string>();

      rows.forEach((row, index) => {
        const key = row.title.toLowerCase();

        if (key && seen.has(key)) {
          context.addIssue({ code: 'custom', path: [index, 'title'], message: 'Two columns cannot have the same name' });
        }
        seen.add(key);
      });
    });

export const columnRowsSchema = columnRowsSchemaFor(MIN_COLUMNS);

const colorIdOf = (color: Column['color']): string => (typeof color === 'string' ? color : (color?._id ?? ''));

/** A board's columns as dialog rows, first to last. */
export const rowsFromColumns = (columns: readonly Column[]): ColumnRow[] =>
  [...columns]
    .sort((a, b) => a.order - b.order)
    .map(column => ({ columnId: column._id, title: column.title, color: colorIdOf(column.color) }));

/** The rows as the request carries them: ids on the columns that exist, none on the new ones. */
export const columnsRequest = (rows: readonly ColumnRow[]): ColumnChange[] =>
  rows.map(row => ({ ...(row.columnId && { _id: row.columnId }), title: row.title.trim(), color: row.color }));

/** Whether the rows differ from the columns they were taken from, in names, hues, order or membership. */
export const columnsChanged = (initial: readonly ColumnRow[], rows: readonly ColumnRow[]): boolean =>
  initial.length !== rows.length ||
  rows.some((row, index) => {
    const before = initial[index];
    return before.columnId !== row.columnId || before.title !== row.title.trim() || before.color !== row.color;
  });

/** One place a new column can go, as the position list offers it. */
export interface ColumnPosition {
  /** The index the column takes among the others. */
  index: number;
  label: string;
}

/**
 * The places a new column can take, named by the columns around it: first,
 * between each two neighbours, and last. Names are the draft's own, so the
 * list follows a rename made a moment ago in the same dialog.
 */
export const columnPositions = (titles: readonly string[]): ColumnPosition[] => {
  const label = (title: string) => title.trim() || 'an unnamed column';

  return [
    { index: 0, label: titles.length > 0 ? `First, before ${label(titles[0])}` : 'First' },
    ...titles.slice(1).map((title, offset) => ({
      index: offset + 1,
      label: `Between ${label(titles[offset])} and ${label(title)}`,
    })),
    ...(titles.length > 0 ? [{ index: titles.length, label: `Last, after ${label(titles[titles.length - 1])}` }] : []),
  ];
};

/**
 * Whether a name may be given to a column: the reason it may not, or null.
 * `others` are the names of the board's other columns.
 */
export const columnNameProblem = (name: string, others: readonly string[]): string | null => {
  const trimmed = name.trim();

  if (!trimmed) return 'A column needs a name';
  if (trimmed.length > COLUMN_NAME_MAX_LENGTH) return `A column name is at most ${COLUMN_NAME_MAX_LENGTH} characters`;
  if (others.some(other => other.trim().toLowerCase() === trimmed.toLowerCase())) {
    return 'Another column already has that name';
  }

  return null;
};
