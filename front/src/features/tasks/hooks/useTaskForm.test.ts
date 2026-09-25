import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useTaskForm, type TaskColorOption } from './useTaskForm';
import type { User } from '@/models';

afterEach(() => {
  window.localStorage.clear();
});

const COLORS: TaskColorOption[] = [
  { _id: 'color-blue', name: 'Blue', value: '#3B82F6' },
  { _id: 'color-red', name: 'Red', value: '#EF4444' },
];

const ADA: User = {
  _id: 'user-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  avatar: '',
};

// Hoisted so its identity is stable across rerenders. The form rebuilds when
// the task changes, and a literal declared inside the render is a new task on
// every pass.
const EXISTING_TASK = { _id: 'task-1', boardId: 'board-1', color: 'color-blue' };

const setup = (overrides: Partial<Parameters<typeof useTaskForm>[0]> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onSaved = vi.fn();
  const view = renderHook(() =>
    useTaskForm({ open: true, task: null, colors: [], members: [], onSave, onSaved, ...overrides })
  );
  return { ...view, onSave, onSaved };
};

describe('useTaskForm', () => {
  // This is P0-1, which made task creation impossible for a year. Clearing an
  // error writes `undefined` under a key that stays in the object, so a gate
  // counting keys is closed by the very act of fixing the field it complained
  // about. Choosing an owner is what creates that key, so a gate written the
  // wrong way refuses every form the moment it becomes complete.
  it('stays submittable after an error is cleared, because a cleared error keeps its key', async () => {
    const { result } = setup();

    act(() => {
      result.current.setField('title', 'Write the migration');
      result.current.setField('description', 'Backfill the order column');
      result.current.setField('color', 'color-blue');
    });
    act(() => {
      result.current.setField('owner', ADA._id);
    });

    await waitFor(() => expect(result.current.isValid).toBe(true));
    expect(Object.keys(result.current.errors)).toContain('owner');
    expect(result.current.errors.owner).toBeUndefined();
  });

  // One field at a time, with every other field genuinely filled. Asserting
  // on a form where several are blank passes even when only one of the checks
  // survives, which is a test that cannot tell the difference.
  it.each(['title', 'description'] as const)('refuses a form whose %s holds only whitespace', field => {
    const { result } = setup();

    act(() => {
      result.current.setField('title', 'Write the migration');
      result.current.setField('description', 'Backfill the order column');
      result.current.setField('owner', ADA._id);
      result.current.setField('color', 'color-blue');
    });
    act(() => {
      result.current.setField(field, '   ');
    });

    expect(result.current.isValid).toBe(false);
  });

  it('names every missing field when a submit is attempted', async () => {
    const { result, onSave } = setup();

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as never);
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({
      title: 'Title is required',
      description: 'Description is required',
      owner: 'Owner is required',
      color: 'Color is required',
    });
  });

  it('chooses the only possible owner rather than asking for a decision', async () => {
    const { result } = setup({ members: [ADA] });

    await waitFor(() => expect(result.current.values.owner).toBe(ADA._id));
  });

  it('leaves the owner alone when the board has more than one member', async () => {
    const second: User = { ...ADA, _id: 'user-grace', firstName: 'Grace', lastName: 'Hopper' };
    const { result } = setup({ members: [ADA, second] });

    await waitFor(() => expect(result.current.values.owner).toBe(''));
  });

  it('preselects the first colour for a form opened with no task', async () => {
    const { result } = setup({ colors: COLORS });

    await waitFor(() => expect(result.current.values.color).toBe('color-blue'));
  });

  // The colours arrive after the form is already usable, so the patch that
  // resolves them runs over a form somebody may have already touched. It must
  // leave a valid choice alone, and the only way to see that is to let the
  // colours arrive after the choice was made.
  it('does not overwrite a colour that was chosen by hand before the colours arrived', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ colors }) =>
        useTaskForm({ open: true, task: EXISTING_TASK, colors, members: [], onSave, onSaved: vi.fn() }),
      { initialProps: { colors: [] as TaskColorOption[] } }
    );

    act(() => {
      result.current.setField('color', 'color-red');
    });

    rerender({ colors: COLORS });

    await waitFor(() => expect(result.current.values.color).toBe('color-red'));
  });

  it('resolves the colour the task was stored with once the colours arrive', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ colors }) =>
        useTaskForm({ open: true, task: EXISTING_TASK, colors, members: [], onSave, onSaved: vi.fn() }),
      { initialProps: { colors: [] as TaskColorOption[] } }
    );

    rerender({ colors: COLORS });

    await waitFor(() => expect(result.current.values.color).toBe('color-blue'));
  });

  it('reports a failed save instead of leaving the form looking idle', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network down'));
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useTaskForm({ open: true, task: null, colors: [], members: [], onSave, onSaved })
    );

    act(() => {
      result.current.setField('title', 'Write the migration');
      result.current.setField('description', 'Backfill the order column');
      result.current.setField('owner', ADA._id);
      result.current.setField('color', 'color-blue');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as never);
    });

    expect(result.current.submitError).toMatch(/could not be saved/i);
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });
});
