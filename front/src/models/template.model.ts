import type { Color } from '@/models';

export interface Column {
  _id: string;
  title: string;
  color: Color | string;
  order: number;
}

export interface Template {
  _id: string;
  name: string;
  description: string;
  columns: Column[] | string[];
  iconName: string;
  createdAt?: string;
  updatedAt?: string;
}
