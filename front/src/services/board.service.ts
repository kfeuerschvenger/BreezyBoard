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

  // `columns` is the complete ordered list of the board's columns as the
  // request carries them: an `_id` on each existing one, none on a new one, and
  // a colour that is the id of a palette entry, not the populated entry a read
  // returns. It travels with `columnsVersion`, the version of the columns the
  // list was built on, which the server requires and checks.
  async update(
    id: string,
    boardData: Partial<Omit<Board, 'columns' | 'color'>> & {
      color?: string;
      columns?: { _id?: string; title: string; color: string }[];
    }
  ): Promise<Board> {
    const response = await api.put(`/boards/${id}`, boardData);
    return response.data.data;
  },

  // Changes the name of one column and nothing else, so it can never send, and
  // so overwrite, the rest of the list.
  async renameColumn(boardId: string, columnId: string, title: string): Promise<Board> {
    const response = await api.patch(`/boards/${boardId}/columns/${columnId}`, { title });
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
