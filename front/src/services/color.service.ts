import api from './api.service';
import type { Color } from '@/models';

export const ColorService = {
  async getByType(type: 'board' | 'task' | 'column'): Promise<Color[]> {
    const response = await api.get(`/colors?type=${type}`);
    return response.data.data;
  },

  async getById(id: string): Promise<Color> {
    const response = await api.get(`/colors/${id}`);
    return response.data.data;
  },
};
