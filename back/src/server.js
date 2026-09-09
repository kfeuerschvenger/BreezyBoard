import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';

const start = async () => {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });

  const shutdown = signal => {
    console.log(`Received ${signal}, shutting down gracefully`);

    server.close(async () => {
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
      } catch (error) {
        console.error('Error while closing MongoDB connection:', error);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start();
