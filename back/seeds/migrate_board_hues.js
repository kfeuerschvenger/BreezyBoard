import mongoose from 'mongoose';
import env from '../src/config/env.js';
import { migrateBoardHues } from '../src/migrations/boardHues.js';

// Moves the boards of an existing database onto the six design hues. Safe to
// run more than once, see src/migrations/boardHues.js.
const run = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    const result = await migrateBoardHues();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
