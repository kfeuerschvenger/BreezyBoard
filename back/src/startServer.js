import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';
import { startBoardPurgeJob } from './jobs/boardPurge.job.js';
import logger from './utils/logger.js';

/**
 * Connects the database, starts listening, starts the board purge job and
 * wires the shutdown on SIGINT and SIGTERM. Everything it touches is a
 * parameter with the real thing as its default, so a test can run the whole
 * sequence without a socket, a database connection or ending the process.
 *
 * Shutdown stops the purge schedule first, so no run begins while the
 * connection is closing, then lets the server drain before closing MongoDB.
 *
 * @param {{
 *   application?: { listen: Function },
 *   port?: number | string,
 *   connect?: () => Promise<unknown>,
 *   startPurge?: () => () => void,
 *   closeDatabase?: () => Promise<unknown>,
 *   exit?: (code: number) => void,
 *   signals?: { on: (signal: string, handler: () => void) => unknown },
 * }} [options]
 */
export const startServer = async ({
  application = app,
  port = env.PORT,
  connect = connectDB,
  startPurge = startBoardPurgeJob,
  closeDatabase = () => mongoose.connection.close(),
  exit = code => process.exit(code),
  signals = process,
} = {}) => {
  await connect();

  const server = application.listen(port, () => {
    logger.info(`Server running in ${env.NODE_ENV} mode on port ${port}`);
  });

  const stopBoardPurge = startPurge();

  const shutdown = signal => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    stopBoardPurge();

    server.close(async () => {
      try {
        await closeDatabase();
        logger.info('MongoDB connection closed');
      } catch (error) {
        logger.error({ err: error }, 'Error while closing MongoDB connection');
      } finally {
        exit(0);
      }
    });
  };

  signals.on('SIGINT', () => shutdown('SIGINT'));
  signals.on('SIGTERM', () => shutdown('SIGTERM'));

  return { server, shutdown };
};
