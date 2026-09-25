import api from './api.service';
import type { DashboardStats } from '@/models';

export const DashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard/stats');
    return response.data.data;
  },
};
