import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/setup.js'],
    // The whole suite shares one in-memory MongoDB instance (started in
    // globalSetup), so test files must not run concurrently against it.
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
