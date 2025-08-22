import BoardTemplate from '../models/BoardTemplate.js';
import responseHandler from '../utils/responseHandler.js';

export const getTemplates = async (req, res, next) => {
  try {
    const templates = await BoardTemplate.find().sort({ createdAt: 1 });
    responseHandler(res, 200, templates);
  } catch (error) {
    next(error);
  }
};
