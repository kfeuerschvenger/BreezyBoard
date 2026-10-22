import env from '../config/env.js';
import { purgeExpiredBoards } from '../services/board.service.js';
import { purgeExpiredTasks } from '../services/task.service.js';
import logger from '../utils/logger.js';

// Tasks go first so that a failure on boards does not leave the task backlog
// waiting. Each purge has its own try and its own log, so a failure in one
// never skips the other, and the count the job reports is both kinds of
// removal together, counting zero for the one that failed.
const purgeWithConfiguredWindow = async () => {
  let tasks = 0;
  let boards = 0;

  try {
    tasks = await purgeExpiredTasks({ retentionMs: env.BOARD_RETENTION_MS });
  } catch (error) {
    logger.error({ err: error }, 'Failed to purge deleted tasks');
  }

  try {
    boards = await purgeExpiredBoards({
      retentionMs: env.BOARD_RETENTION_MS,
      onError: (error, boardId) => logger.error({ err: error, boardId }, 'Failed to purge a deleted board'),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to purge deleted boards');
  }

  return tasks + boards;
};

/**
 * Removes boards past the retention window, once at start and then on a
 * fixed interval. A timer in the server process rather than a MongoDB TTL
 * index, because a TTL index would delete the board document alone and leave
 * its tasks behind: the cascade needs the transaction in `purgeExpiredBoards`.
 *
 * The timer is unreferenced so it never keeps the process alive past a
 * shutdown, and a failed run is logged and retried on the next tick instead
 * of ending the schedule.
 *
 * @param {{ intervalMs?: number, purge?: () => Promise<number> }} [options]
 * @returns {() => void} stops the schedule
 */
export const startBoardPurgeJob = ({
  intervalMs = env.BOARD_PURGE_INTERVAL_MS,
  purge = purgeWithConfiguredWindow,
} = {}) => {
  const run = async () => {
    try {
      const removed = await purge();

      if (removed > 0) {
        logger.info({ removed }, 'Purged deleted boards and tasks past retention');
      }
    } catch (error) {
      logger.error({ err: error }, 'Board purge run failed');
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
};
