import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { describe, expect, test } from 'vitest';
import ColorPalette from '../src/models/ColorPalette.js';
import User from '../src/models/User.js';
import { seedRefusal } from '../seeds/seedGuard.js';

const backDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Runs a seed script as a real process, the way `npm run seed:*` does, against the test database. */
const runSeed = (script, nodeEnv) => {
  const env = { ...process.env };

  if (nodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = nodeEnv;
  }

  return spawnSync(process.execPath, [path.join('seeds', script)], {
    cwd: backDir,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
};

describe('seedRefusal', () => {
  test.each(['development', 'test'])('allows %s', nodeEnv => {
    expect(seedRefusal(nodeEnv)).toBeNull();
  });

  test.each(['production', 'staging', 'Development', ''])('refuses "%s" and says which value it saw', nodeEnv => {
    const refusal = seedRefusal(nodeEnv);

    expect(refusal).toMatch(/^Refusing to seed/);
    expect(refusal).toContain('"development" or "test"');
  });

  test('refuses an unset NODE_ENV, although the application reads it as development', () => {
    expect(seedRefusal(undefined)).toMatch(/NODE_ENV is not set/);
  });
});

describe.each(['users.seed.js', 'templates_and_colors.js'])('seeds/%s as a process', script => {
  test.each(['production', 'staging', undefined])(
    'exits non-zero with the reason and touches nothing when NODE_ENV is %s',
    async nodeEnv => {
      await ColorPalette.create({ name: 'Sentinel', value: '#123456', type: 'task' });
      await User.collection.insertOne({ email: 'sentinel@example.test' });

      const result = runSeed(script, nodeEnv);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Refusing to seed/);
      expect(result.stdout).not.toMatch(/connected|seeded/i);
      expect(await ColorPalette.countDocuments({ value: '#123456' })).toBe(1);
      expect(await User.collection.countDocuments({ email: 'sentinel@example.test' })).toBe(1);
    },
    90_000
  );
});

describe('seeds when NODE_ENV allows them', () => {
  test('the template seed runs under test and replaces the palette', async () => {
    await ColorPalette.create({ name: 'Sentinel', value: '#123456', type: 'task' });

    const result = runSeed('templates_and_colors.js', 'test');

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/seeded successfully/);
    expect(await ColorPalette.countDocuments({ value: '#123456' })).toBe(0);
    expect(await ColorPalette.countDocuments()).toBeGreaterThan(1);
  }, 90_000);

  test('the user seed runs under development and creates the accounts', async () => {
    const result = runSeed('users.seed.js', 'development');

    expect(result.status).toBe(0);
    expect(await mongoose.connection.collection('users').countDocuments()).toBeGreaterThan(1);
  }, 90_000);
});
