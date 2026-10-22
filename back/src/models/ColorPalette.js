import mongoose from 'mongoose';
import { isBoardHue } from '../constants/boardHues.js';

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

// A board colour is one of the six design hues and its `value` is the hue key
// (`sky`, `teal`, ...), not a hex string. The task and column palettes keep
// hex values. Refusing anything else here means no code path, the seeds
// included, can put a seventh board colour in the palette.
colorPaletteSchema.path('value').validate(function (value) {
  return this.type !== 'board' || isBoardHue(value);
}, 'A board colour must be one of the six design hues');

const ColorPalette = mongoose.model('ColorPalette', colorPaletteSchema);

export default ColorPalette;
