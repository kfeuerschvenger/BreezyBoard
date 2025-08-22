import mongoose from 'mongoose';

const colorPaletteSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ['board', 'task', 'column'],
      default: 'board',
    },
  },
  { timestamps: true }
);

const ColorPalette = mongoose.model('ColorPalette', colorPaletteSchema);

export default ColorPalette;
