import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Runs once per test file. Each test file gets its own module registry
// (and therefore its own mongoose instance), so each file opens its own
// connection to the shared in-memory MongoDB instance started in
// globalSetup, and closes it when the file is done.
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});

// Give every test a clean database instead of restarting mongod or the
// app between test files.
afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map(collection => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
