import type { Color, User } from '@/models';

export interface Task {
  _id: string;
  title: string;
  description: string;
  status: string;
  priority: 'low' | 'medium' | 'high';
  color: Color | string;
  owner: User | string;
  boardId: string;
  checklist: ChecklistItem[];
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChecklistItem {
  _id: string;
  text: string;
  completed: boolean;
}
