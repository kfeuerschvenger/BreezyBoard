import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { describe, expect, test } from 'vitest';
import User from '../src/models/User.js';

const backDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Runs the user seed as a real process against the test database. */
const runUserSeed = password => {
  const env = { ...process.env, NODE_ENV: 'test' };

  if (password === undefined) {
    delete env.SEED_USER_PASSWORD;
  } else {
    env.SEED_USER_PASSWORD = password;
  }

  return spawnSync(process.execPath, [path.join('seeds', 'users.seed.js')], {
    cwd: backDir,
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
};

describe('seeds/users.seed.js', () => {
  test('creates the example accounts on the reserved domain with the password from the environment', async () => {
    const result = runUserSeed('Example-pass-1');

    expect(result.status).toBe(0);

    const users = await User.find().select('+password');

    expect(users.length).toBeGreaterThan(0);
    expect(users.every(user => user.email.endsWith('@breezyboard.local'))).toBe(true);
    expect(await bcrypt.compare('Example-pass-1', users[0].password)).toBe(true);
  });

  test.each([
    ['unset', undefined],
    ['empty', ''],
    ['shorter than the registration minimum', 'short'],
  ])('creates and deletes nothing when the password is %s, and says which variable to set', async (_name, value) => {
    await User.create({ firstName: 'keep', lastName: 'me', email: 'keep@breezyboard.local', password: 'hash' });

    const result = runUserSeed(value);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('SEED_USER_PASSWORD');
    expect(await User.countDocuments()).toBe(1);
    expect(await User.countDocuments({ email: 'keep@breezyboard.local' })).toBe(1);
  });

  test('keeps no password and no real address in its source', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(path.join(backDir, 'seeds', 'users.seed.js'), 'utf8');

    expect(source).not.toMatch(/password:\s*'/);
    expect(source).not.toMatch(/@gmail\.com/);
  });
});
