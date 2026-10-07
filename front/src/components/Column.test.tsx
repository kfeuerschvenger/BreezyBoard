import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import Column from './Column';
import type { Column as ColumnModel, Task } from '@/models';

const column: ColumnModel = {
  _id: 'col-todo',
  title: 'To Do',
  color: { _id: 'c1', value: '#3B82F6' },
  order: 0,
};

const makeTask = (id: string, title: string): Task => ({
  _id: id,
  title,
  description: '',
  status: column._id,
  priority: 'low',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
});

const renderColumn = (tasks: Task[], onTaskClick = vi.fn()) =>
  render(
    <DndContext>
      <Column column={column} tasks={tasks} onTaskClick={onTaskClick} colorOf={() => '#3B82F6'} />
    </DndContext>
  );

describe('Column', () => {
  it('says so when it holds no tasks, and shows a zero count', () => {
    renderColumn([]);

    expect(screen.getByRole('heading', { name: 'To Do' })).toBeInTheDocument();
    expect(screen.getByText(/no tasks here yet/i)).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows no empty hint once it holds a task', () => {
    renderColumn([makeTask('t1', 'Write the spec')]);

    expect(screen.getByText('Write the spec')).toBeInTheDocument();
    expect(screen.queryByText(/no tasks here yet/i)).not.toBeInTheDocument();
  });

  it('opens a task when its card is clicked', async () => {
    const onTaskClick = vi.fn();
    renderColumn([makeTask('t1', 'Write the spec')], onTaskClick);

    await userEvent.click(screen.getByText('Write the spec'));

    expect(onTaskClick).toHaveBeenCalledWith(expect.objectContaining({ _id: 't1' }));
  });

  // jsdom loads no stylesheet, so this only pins the class that does the work.
  // The behaviour itself, a header that stays put while the body scrolls, is
  // measured in a real browser by e2e/verify/board-layout.mjs.
  it('keeps the header out of the scrolling body', () => {
    renderColumn([makeTask('t1', 'Write the spec')]);

    const header = screen.getByRole('heading', { name: 'To Do' }).parentElement as HTMLElement;
    const body = screen.getByText('Write the spec').closest('.overflow-y-auto') as HTMLElement;

    expect(body).not.toBeNull();
    expect(body.contains(header)).toBe(false);
    expect(header).toHaveClass('shrink-0');
  });
});
