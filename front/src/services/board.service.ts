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

  // createdBy and members are set server-side (creator injected, membership
  // defaulted), so the client only ever supplies these four fields.
  async create(boardData: Pick<Board, 'title' | 'description' | 'color' | 'template'>): Promise<Board> {
    const response = await api.post('/boards', boardData);
    return response.data.data;
  },

  async update(id: string, boardData: Partial<Board>): Promise<Board> {
    const response = await api.put(`/boards/${id}`, boardData);
    return response.data.data;
  },

  // A soft delete: the board stays on the server, restorable, until the
  // purge removes it.
  async delete(id: string): Promise<void> {
    await api.delete(`/boards/${id}`);
  },

  async restore(id: string): Promise<Board> {
    const response = await api.post(`/boards/${id}/restore`);
    return response.data.data;
  },

  async addMembers(boardId: string, memberIds: string[]): Promise<Board> {
    const response = await api.patch(`/boards/${boardId}/members`, { members: memberIds });
    return response.data.data;
  },
};
