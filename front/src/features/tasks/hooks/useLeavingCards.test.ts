import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@/models';
import { useLeavingCards } from './useLeavingCards';

const task = (id: string): Task => ({
  _id: id,
  title: `Task ${id}`,
  status: 'col-todo',
  priority: 'medium',
  color: '#3B82F6',
  owner: '',
  boardId: 'board-1',
  checklist: [],
  order: 'a0',
});

describe('useLeavingCards', () => {
  it('holds a card from the moment it leaves until its exit ends', () => {
    const { result } = renderHook(() => useLeavingCards());
    expect(result.current.leaving).toEqual([]);

    act(() => result.current.leave({ task: task('a'), beforeId: 'b' }));
    expect(result.current.leaving).toEqual([{ task: task('a'), beforeId: 'b' }]);

    act(() => result.current.end('a'));
    expect(result.current.leaving).toEqual([]);
  });

  it('holds several at once and lets go of only the one that finished', () => {
    const { result } = renderHook(() => useLeavingCards());

    act(() => {
      result.current.leave({ task: task('a'), beforeId: null });
      result.current.leave({ task: task('b'), beforeId: null });
    });
    act(() => result.current.end('a'));

    expect(result.current.leaving.map(card => card.task._id)).toEqual(['b']);
  });

  it('holds a card once, however many times it is told it left', () => {
    const { result } = renderHook(() => useLeavingCards());

    act(() => {
      result.current.leave({ task: task('a'), beforeId: 'b' });
      result.current.leave({ task: task('a'), beforeId: 'c' });
    });

    expect(result.current.leaving).toEqual([{ task: task('a'), beforeId: 'c' }]);
  });

  it('gives callers functions that stay the same, so an effect keyed on them does not run again', () => {
    const { result, rerender } = renderHook(() => useLeavingCards());
    const { leave, end } = result.current;

    act(() => result.current.leave({ task: task('a'), beforeId: null }));
    rerender();

    expect(result.current.leave).toBe(leave);
    expect(result.current.end).toBe(end);
  });
});
