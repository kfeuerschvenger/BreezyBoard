import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createTestQueryClient } from '@/test/renderWithQuery';
import { ColorService } from '@/services';
import { useColors } from './queries';
import type { Color } from '@/models';

vi.mock('@/services', () => ({
  ColorService: { getByType: vi.fn() },
}));

const mockedColorService = vi.mocked(ColorService);

const TASK_COLORS: Color[] = [{ _id: 'task-blue', name: 'Blue', value: '#3B82F6' }];
const BOARD_COLORS: Color[] = [{ _id: 'board-green', name: 'Green', value: '#10B981' }];

/**
 * One client shared by every hook a test renders, which is the opposite of
 * what `renderWithQuery` does and is the point here: these tests are about
 * what two consumers of the same cache see, so giving each its own cache
 * would make every one of them pass for the wrong reason.
 */
const withSharedCache = () => {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return wrapper;
};

describe('useColors', () => {
  beforeEach(() => {
    mockedColorService.getByType.mockReset().mockImplementation(async type => {
      if (type === 'board') return BOARD_COLORS;
      return TASK_COLORS;
    });
  });

  it('reads the palette of the type it was asked for', async () => {
    const { result } = renderHook(() => useColors('task'), { wrapper: withSharedCache() });

    await waitFor(() => expect(result.current.data).toEqual(TASK_COLORS));
    expect(mockedColorService.getByType).toHaveBeenCalledWith('task');
  });

  // The failure this guards against is a key that ignores its argument, which
  // does not look like a bug from one call site. It shows up the first time a
  // second type is asked for and is handed the first one's palette.
  it('keeps two colour types in separate cache entries', async () => {
    const wrapper = withSharedCache();

    const task = renderHook(() => useColors('task'), { wrapper });
    const board = renderHook(() => useColors('board'), { wrapper });

    await waitFor(() => expect(task.result.current.data).toEqual(TASK_COLORS));
    await waitFor(() => expect(board.result.current.data).toEqual(BOARD_COLORS));
  });

  it('asks for one type only once however many consumers read it', async () => {
    const wrapper = withSharedCache();

    const first = renderHook(() => useColors('task'), { wrapper });
    const second = renderHook(() => useColors('task'), { wrapper });

    await waitFor(() => expect(first.result.current.data).toEqual(TASK_COLORS));
    await waitFor(() => expect(second.result.current.data).toEqual(TASK_COLORS));

    expect(mockedColorService.getByType).toHaveBeenCalledTimes(1);
  });
});
