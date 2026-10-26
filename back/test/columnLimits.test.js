import fs from 'fs';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { COLUMN_NAME_MAX_LENGTH, MAX_COLUMNS, MIN_COLUMNS } from '../src/validation/board.validation.js';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

// The limits on columns are written twice, once in the Zod schemas that the
// server enforces and that the API document is generated from, and once in the
// constants the edit dialog validates with. They have to agree, or the dialog
// lets through a list the server refuses, or refuses one the server accepts.
describe('the limits on a board columns', () => {
  const document = parse(read('../../docs/openapi.yaml'));
  const columns = document.components.schemas.UpdateBoardRequest.properties.columns;
  const rename = document.components.schemas.RenameColumnRequest.properties.title;

  const frontLimit = name => {
    const source = read('../../front/src/features/boards/boardColumns.ts');
    const match = source.match(new RegExp(`export const ${name} = (\\d+);`));

    if (!match) {
      throw new Error(`front/src/features/boards/boardColumns.ts no longer declares ${name} as a number`);
    }

    return Number(match[1]);
  };

  test('the API document carries the limits of the schemas', () => {
    expect(columns.minItems).toBe(MIN_COLUMNS);
    expect(columns.maxItems).toBe(MAX_COLUMNS);
    expect(columns.items.properties.title.maxLength).toBe(COLUMN_NAME_MAX_LENGTH);
    expect(rename.maxLength).toBe(COLUMN_NAME_MAX_LENGTH);
  });

  test('the edit dialog enforces the same minimum, maximum and name length as the API document', () => {
    expect(frontLimit('MIN_COLUMNS')).toBe(columns.minItems);
    expect(frontLimit('MAX_COLUMNS')).toBe(columns.maxItems);
    expect(frontLimit('COLUMN_NAME_MAX_LENGTH')).toBe(columns.items.properties.title.maxLength);
  });
});
