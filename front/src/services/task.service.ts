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

  // The API only truly requires title, status, and color (mongoose Task
  // schema); boardId is set server-side from the route param and other
  // fields have server defaults, so callers only have a Partial<Task> at
  // this point.
  async create(boardId: string, taskData: Partial<Task>): Promise<Task> {
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

  // newOrder is optional: some callers only change status and leave order untouched
  // (the backend ignores an undefined order field on the update).
  async move(taskId: string, newStatus: string, newOrder?: number): Promise<Task> {
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
