import env from '../config/env.js';
import { purgeExpiredBoards } from '../services/board.service.js';
import logger from '../utils/logger.js';

const purgeWithConfiguredWindow = () =>
  purgeExpiredBoards({
    retentionMs: env.BOARD_RETENTION_MS,
    onError: (error, boardId) => logger.error({ err: error, boardId }, 'Failed to purge a deleted board'),
  });

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
        logger.info({ removed }, 'Purged deleted boards past retention');
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
