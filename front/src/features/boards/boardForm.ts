import { z } from 'zod';
import { MIN_COLUMNS, columnRowsSchemaFor } from './boardColumns';

/**
 * The fields a board has in both of the forms that edit one: the dialog that
 * creates it and the dialog that changes it afterwards.
 *
 * The template is not here. It only seeds the columns at creation and has no
 * effect afterwards, so it belongs to the create form alone.
 */
export const boardFieldsSchema = z.object({
  title: z.string().trim().min(1, 'A board needs a name'),
  description: z.string().trim(),
  color: z.string().min(1, 'Choose a colour'),
});

export type BoardFieldValues = z.infer<typeof boardFieldsSchema>;

/**
 * The edit dialog's form: the shared fields and, on a board page, the columns.
 *
 * A board that was created with fewer columns than a board keeps has no minimum
 * to fall below, and is let through unchanged: otherwise its name could not be
 * edited until two columns had been added.
 */
export const editBoardSchema = (enforceMinimum: boolean) =>
  boardFieldsSchema.extend({ columns: columnRowsSchemaFor(enforceMinimum ? MIN_COLUMNS : 0).optional() });

export type EditBoardValues = z.infer<ReturnType<typeof editBoardSchema>>;
