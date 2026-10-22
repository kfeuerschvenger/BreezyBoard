import api from './api.service';
import type { Task, ChecklistItem } from '@/models';

/** The two cards a task was dropped between. Null at either end of a column. */
export interface TaskNeighbours {
  afterId?: string | null;
  beforeId?: string | null;
}

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

  // A deleted task is kept for a week. This clears the mark and answers with
  // the task as it was, so the caller can put it back where it stood.
  async restore(id: string): Promise<Task> {
    const response = await api.post(`/tasks/${id}/restore`);
    return response.data.data;
  },

  // A move names the two cards the task was dropped between, not a position.
  // The server derives the ordering key from them, so it is the only thing
  // that ever writes one. Either neighbour may be null: no `afterId` means
  // the top of the column, no `beforeId` means the bottom.
  //
  // A 409 from this call means the neighbours have moved since this client
  // last fetched the board, which is a thing the caller can act on by
  // refetching, unlike a 400.
  //
  // `signal` lets a caller abandon a move that a newer one has overtaken.
  // Without it a slow first request can resolve after a second one and
  // undo it.
  async move(taskId: string, newStatus: string, between: TaskNeighbours = {}, signal?: AbortSignal): Promise<Task> {
    const response = await api.patch(
      `/tasks/${taskId}/move`,
      {
        status: newStatus,
        afterId: between.afterId ?? null,
        beforeId: between.beforeId ?? null,
      },
      { signal }
    );
    return response.data.data;
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
