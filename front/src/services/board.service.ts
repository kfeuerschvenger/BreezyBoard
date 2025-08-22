import api from './api.service';
import type { Board } from '@/models';

export const BoardService = {
  async getAll(): Promise<Board[]> {
    const response = await api.get('/boards');
    return response.data.data;
  },

  async getById(id: string): Promise<Board> {
    const response = await api.get(`/boards/${id}`);
    return response.data.data;
  },

  async create(
    boardData: Omit<Board, '_id' | 'taskCount' | 'memberCount' | 'lastUpdated' | 'progress'>
  ): Promise<Board> {
    const response = await api.post('/boards', boardData);
    return response.data.data;
  },

  async update(id: string, boardData: Partial<Board>): Promise<Board> {
    const response = await api.put(`/boards/${id}`, boardData);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/boards/${id}`);
  },

  async addMembers(boardId: string, memberIds: string[]): Promise<Board> {
    const response = await api.patch(`/boards/${boardId}/members`, { members: memberIds });
    return response.data.data;
  },
};
