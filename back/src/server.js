import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';
import { startBoardPurgeJob } from './jobs/boardPurge.job.js';
import logger from './utils/logger.js';

const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });

  const stopBoardPurge = startBoardPurgeJob();

  const shutdown = signal => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    stopBoardPurge();

    server.close(async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (error) {
        logger.error({ err: error }, 'Error while closing MongoDB connection');
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start();
