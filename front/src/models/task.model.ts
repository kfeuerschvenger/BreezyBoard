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
  // A fractional index minted by the server, not a position. It sorts
  // lexicographically, so comparing two of them is a string comparison and
  // never arithmetic.
  order: string;
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
