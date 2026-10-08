import type { User, Color, Column, Template } from '@/models';

export interface Board {
  _id: string;
  title: string;
  description: string;
  color: Color | string;
  // The board's own columns, copied from its template when it was created.
  // A task's status holds the id of one of these. The template below is kept
  // for provenance and for the icon on the dashboard, and its columns are no
  // longer what the board renders.
  columns: Column[];
  template: Template | string;
  createdBy: User | string;
  members: User[] | string[];
  taskCount: number;
  memberCount: number;
  progress: number;
  /**
   * The caller's own role on this board, set by the server on a single board
   * read only. The server decides it, so a workspace admin is an owner here
   * exactly as the owner-only routes treat them.
   */
  viewerRole?: 'owner' | 'member';
  createdAt?: string;
  updatedAt?: string;
}

/** The totals across every board the current user can see. */
export interface DashboardStats {
  totalBoards: number;
  totalMembers: number;
  totalTasks: number;
  /** A whole percentage, averaged over the boards. */
  avgProgress: number;
}
