import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { DRAFT_THROTTLE_MS } from '@/shared/hooks/useDraft';

/**
 * Runs the trailing write that useDraft schedules after a burst of changes.
 *
 * useDraft stores the first change at once and holds every later one back for
 * up to DRAFT_THROTTLE_MS, so the value a test just typed reaches storage on a
 * timer rather than on the keystroke. Waiting for that with the default
 * waitFor budget ties the assertion to the speed of the machine. Advancing the
 * clock past the throttle makes the write happen when the test says so.
 *
 * Needs fake timers: call vi.useFakeTimers({ shouldAdvanceTime: true }) first,
 * so waitFor and user-event keep working, and vi.useRealTimers() afterwards.
 */
export const flushDraft = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(DRAFT_THROTTLE_MS);
  });
