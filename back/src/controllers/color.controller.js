import ColorPalette from '../models/ColorPalette.js';
import responseHandler from '../utils/responseHandler.js';
import ApiError from '../utils/apiError.js';

export const getColors = async (req, res, next) => {
  try {
    const { type } = req.query;
    const filter = type ? { type } : {};
    const colors = await ColorPalette.find(filter);
    responseHandler(res, 200, colors);
  } catch (error) {
    next(error);
  }
};

export const getColorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const color = await ColorPalette.findById(id);
    if (!color) {
      throw new ApiError(404, 'Color not found');
    }
    responseHandler(res, 200, color);
  } catch (error) {
    next(error);
  }
};
