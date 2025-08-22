import type { User, Color, Template } from '@/models';

export interface Board {
  _id: string;
  title: string;
  description: string;
  color: Color | string;
  template: Template | string;
  createdBy: User | string;
  members: User[] | string[];
  taskCount: number;
  memberCount: number;
  progress: number;
  createdAt?: string;
  updatedAt?: string;
}
