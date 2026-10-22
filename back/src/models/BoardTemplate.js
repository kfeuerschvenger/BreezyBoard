import mongoose from 'mongoose';
import { createColumnSchema } from './column.schema.js';

// A template's columns are a mould, not a live reference. Creating a board
// copies them onto the board, which then owns them outright. Editing a
// template from here on changes what future boards start with and nothing
// about the boards already created from it.
const columnSchema = createColumnSchema();

const boardTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: String,
    columns: [columnSchema],
    iconName: String,
  },
  { timestamps: true }
);

const BoardTemplate = mongoose.model('BoardTemplate', boardTemplateSchema);

export default BoardTemplate;
