import { z } from 'zod';

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
