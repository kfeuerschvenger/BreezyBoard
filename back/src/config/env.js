import dotenv from 'dotenv';

// Load environment variables before anything else
dotenv.config();

const env = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost/boards-db',
  JWT_SECRET: process.env.JWT_SECRET || 'secret-key',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SALT: process.env.SALT || 10,
};

export default env;
