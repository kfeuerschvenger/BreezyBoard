import api from './api.service';
import type { Template } from '@/models';

export const TemplateService = {
  async getAll(): Promise<Template[]> {
    const response = await api.get('/templates');
    return response.data.data;
  },
};
