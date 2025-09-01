import api from './api.service';
import type { User } from '@/models';

export const UserService = {
  async search(query: string, excludeBoardId?: string): Promise<User[]> {
    const params = new URLSearchParams();
    params.append('q', query);

    if (excludeBoardId) {
      params.append('excludeBoardId', excludeBoardId);
    }
    const response = await api.get(`/users/search?${params.toString()}`);
    return response.data.data;
  },

  async getBoardMembers(boardId: string): Promise<User[]> {
    const params = new URLSearchParams();
    params.append('boardId', boardId);
    const response = await api.get(`/users/board-members?${params.toString()}`);
    return response.data.data;
  },

  async getById(userId: string): Promise<User> {
    const response = await api.get(`/users/${userId}`);
    return response.data.data;
  },

  // Update the user's profile
  async update(userId: string, payload: Partial<User>): Promise<User> {
    const response = await api.put(`/users/${userId}`, payload);
    return response.data.data;
  },

  // Upload avatar image (multipart/form-data)
  async uploadAvatar(userId: string, file: File): Promise<string> {
    const fd = new FormData();
    fd.append('avatar', file);

    const response = await api.post(`/users/${userId}/avatar`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data.data.avatar;
  },
};
