import mongoose from 'mongoose';

/**
 * A column of a kanban board: a title, a colour and a position.
 *
 * Shared by `BoardTemplate` and `Board`, and that sharing is the point. A
 * template's columns are a mould; a board's columns are the real thing,
 * copied out of the mould when the board is created. They have to be the
 * same shape for the copy to be a copy, and defining the shape twice is how
 * they would quietly stop being.
 *
 * Copying rather than referencing is what lets a board rename, add or remove
 * a column without touching any other board. While columns lived only on the
 * template, two boards created from one template shared the same column
 * subdocument ids, so renaming a column on either renamed it on both. A
 * task's `status` holds one of these ids, which is why the ids must be
 * unique per board before anything else is built on them.
 *
 * @returns {mongoose.Schema} a fresh schema instance
 */
export const createColumnSchema = () =>
  new mongoose.Schema({
    title: {
      type: String,
      required: true,
    },
    color: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ColorPalette',
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
  });
