import mongoose from 'mongoose';
import env from '../src/config/env.js';
import { migrateColumnHues } from '../src/migrations/columnHues.js';

// Moves the columns of an existing database onto the six design hues. Safe to
// run more than once, see src/migrations/columnHues.js.
const run = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    const result = await migrateColumnHues();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
