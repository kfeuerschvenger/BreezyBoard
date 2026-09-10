import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB Connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB Connection Error');
    process.exit(1);
  }
};

export default connectDB;
