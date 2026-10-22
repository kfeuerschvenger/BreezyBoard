import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Runs once for the whole test run, before any test file is loaded.
// It boots one in-memory MongoDB instance and publishes its connection
// string via an environment variable so every test file (each gets its
// own module registry) connects to the same instance.
//
// A replica set of one rather than a standalone instance, matching what
// docker-compose runs. Multi document transactions exist only on a replica
// set, so a standalone here would make the transactional board delete
// untestable: it would throw on the test harness while working in every
// real environment, which is the worst of both.
export default async function setup() {
  const mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  process.env.MONGODB_URI = mongod.getUri('breezyboard-test');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
  process.env.NODE_ENV = 'test';
  process.env.PASSWORD_RESET_COOLDOWN_MS = '1';
  // The production topology, so the limiter tests run through the same hop
  // count the deployed application uses.
  process.env.TRUST_PROXY_HOPS = '1';

  return async () => {
    await mongod.stop();
  };
}
