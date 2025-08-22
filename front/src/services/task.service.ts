import api from './api.service';
import type { Task, ChecklistItem } from '@/models';

export const TaskService = {
  async getByBoard(boardId: string): Promise<Task[]> {
    const response = await api.get(`/tasks/board/${boardId}`);
    return response.data.data;
  },

  async getById(id: string): Promise<Task> {
    const response = await api.get(`/tasks/${id}`);
    return response.data.data;
  },

  async create(boardId: string, taskData: Omit<Task, '_id'>): Promise<Task> {
    const response = await api.post(`/tasks/board/${boardId}`, taskData);
    return response.data.data;
  },

  async update(id: string, taskData: Partial<Task>): Promise<Task> {
    const response = await api.put(`/tasks/${id}`, taskData);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`);
  },

  async move(taskId: string, newStatus: string, newOrder: number): Promise<Task> {
    const payload = {
      status: newStatus,
      order: newOrder,
    };
    const response = await api.patch(`/tasks/${taskId}/move`, payload);
    return response.data.data;
  },

  async updateOrders(boardId: string, updates: Array<{ id: string; order: number }>): Promise<void> {
    await api.patch(`/tasks/board/${boardId}/orders`, { updates });
  },

  async updateChecklistItem(taskId: string, itemId: string, data: Partial<ChecklistItem>): Promise<Task> {
    const response = await api.patch(`/tasks/${taskId}/checklist/${itemId}`, data);
    return response.data.data;
  },

  async deleteChecklistItem(taskId: string, itemId: string): Promise<Task> {
    const response = await api.delete(`/tasks/${taskId}/checklist/${itemId}`);
    return response.data.data;
  },
};
