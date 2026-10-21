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
const runSeed = (script, nodeEnv, { mongoUri, args = [] } = {}) => {
  const env = { ...process.env };

  if (nodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = nodeEnv;
  }

  if (mongoUri !== undefined) {
    env.MONGODB_URI = mongoUri;
  }

  return spawnSync(process.execPath, [path.join('seeds', script), ...args], {
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

describe('seedRefusal and the database host', () => {
  const allowed = nodeEnv => uri => seedRefusal(nodeEnv, { mongoUri: uri });

  test.each([
    'mongodb://localhost/boards-db',
    'mongodb://LOCALHOST:27017/boards-db?replicaSet=rs0',
    'mongodb://127.0.0.1:27017/boards-db?directConnection=true',
    'mongodb://[::1]:27017/boards-db',
    'mongodb://mongo:27017/boards-db?replicaSet=rs0',
    'mongodb://user:p%40ss@localhost:27017,mongo:27017/boards-db',
    undefined,
  ])('allows the local database %s', uri => {
    expect(allowed('development')(uri)).toBeNull();
    expect(allowed('test')(uri)).toBeNull();
  });

  test.each([
    ['mongodb://db.example.com/boards-db', 'db.example.com'],
    ['mongodb://10.0.0.5:27017/boards-db', '10.0.0.5'],
    ['mongodb://localhost.example.com/boards-db', 'localhost.example.com'],
    ['mongodb://localhost:27017,db.example.com:27017/boards-db', 'db.example.com'],
    ['mongodb+srv://cluster0.abcde.mongodb.net/boards-db', 'cluster0.abcde.mongodb.net'],
    ['mongodb+srv://localhost/boards-db', 'localhost'],
    ['mongodb://localhost@db.example.com/boards-db', 'db.example.com'],
  ])('refuses %s in development and names the host %s', (uri, host) => {
    const refusal = allowed('development')(uri);

    expect(refusal).toMatch(/^Refusing to seed: MONGODB_URI points at a database that is not local/);
    expect(refusal).toContain(host);
    expect(refusal).toContain('--allow-remote');
  });

  test('never prints the credentials of the connection string', () => {
    const refusal = allowed('development')('mongodb://sentinel-user:sentinel-pass@db.example.com:27017/boards-db');

    expect(refusal).toContain('db.example.com');
    expect(refusal).not.toContain('sentinel-user');
    expect(refusal).not.toContain('sentinel-pass');
    expect(refusal).not.toContain('mongodb://');
  });

  test('--allow-remote lets a remote database through', () => {
    expect(seedRefusal('development', { mongoUri: 'mongodb://db.example.com/boards-db', allowRemote: true })).toBeNull();
    expect(
      seedRefusal('test', { mongoUri: 'mongodb+srv://cluster0.abcde.mongodb.net/boards-db', allowRemote: true })
    ).toBeNull();
  });

  test('--allow-remote never overrides the NODE_ENV check', () => {
    expect(seedRefusal('production', { mongoUri: 'mongodb://localhost/boards-db', allowRemote: true })).toMatch(
      /NODE_ENV is "production"/
    );
    expect(seedRefusal(undefined, { allowRemote: true })).toMatch(/NODE_ENV is not set/);
  });
});

describe('seeds against a database that is not local', () => {
  const REMOTE = 'mongodb://sentinel-user:sentinel-pass@db.remote.example:27017/boards-db';

  describe.each(['users.seed.js', 'templates_and_colors.js'])('seeds/%s', script => {
    test.each(['development', 'test'])(
      'exits non-zero, names the host and touches nothing when NODE_ENV is %s',
      async nodeEnv => {
        await ColorPalette.create({ name: 'Sentinel', value: '#123456', type: 'task' });

        const result = runSeed(script, nodeEnv, { mongoUri: REMOTE });

        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/not local/);
        expect(result.stderr).toContain('db.remote.example');
        expect(result.stderr).not.toContain('sentinel-pass');
        expect(result.stdout).not.toMatch(/connected|seeded/i);
        expect(await ColorPalette.countDocuments({ value: '#123456' })).toBe(1);
      },
      90_000
    );

    test('--allow-remote does not open the production gate', () => {
      const result = runSeed(script, 'production', { mongoUri: REMOTE, args: ['--allow-remote'] });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/NODE_ENV is "production"/);
    }, 90_000);
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
