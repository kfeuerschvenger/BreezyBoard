import { MongoMemoryServer } from 'mongodb-memory-server';

// Runs once for the whole test run, before any test file is loaded.
// It boots a single in-memory MongoDB instance and publishes its
// connection string via an environment variable so every test file
// (each gets its own module registry) connects to the same instance.
export default async function setup() {
  const mongod = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongod.getUri('breezyboard-test');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
  process.env.NODE_ENV = 'test';

  return async () => {
    await mongod.stop();
  };
}
