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
  // A checklist item only gets an _id once the backend persists it (mongoose
  // assigns it to the subdocument). A newly created item, not yet saved, has
  // none.
  _id?: string;
  text: string;
  completed: boolean;
}
