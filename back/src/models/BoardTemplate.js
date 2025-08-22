import mongoose from 'mongoose';

const columnSchema = new mongoose.Schema({
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
