import * as dashboardService from '../services/dashboard.service.js';
import responseHandler from '../utils/responseHandler.js';

export const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getDashboardStats(req.user.id);
    responseHandler(res, 200, stats);
  } catch (error) {
    next(error);
  }
};
