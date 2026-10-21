import { afterEach, describe, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const SECRET = 'a-test-secret-of-at-least-32-chars';

const PRODUCTION = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://bb:p4ssw0rd@db.example:27017/boards-db?authSource=admin',
  JWT_SECRET: SECRET,
  CORS_ORIGINS: 'https://breezyboard.example',
  FRONTEND_URL: 'https://breezyboard.example',
  SMTP_HOST: 'smtp.example.com',
  MAIL_FROM: 'BreezyBoard <no-reply@breezyboard.example>',
};

// env.js reads process.env once, when it is first evaluated, so each case
// stubs the whole environment and imports a fresh copy. Anything a case does
// not name is blank, which the module treats as unset.
const ALL_NAMES = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'JWT_SECRET',
  'SALT',
  'CORS_ORIGINS',
  'TRUST_PROXY_HOPS',
  'JWT_INACTIVITY_TTL_MS',
  'JWT_ABSOLUTE_TTL_MS',
  'REGISTRATION_LIMIT_PER_HOUR',
  'FRONTEND_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_ALLOW_PLAINTEXT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'MAIL_FROM',
  'PASSWORD_RESET_TTL_MS',
  'PASSWORD_RESET_MAX_OUTSTANDING',
  'PASSWORD_RESET_COOLDOWN_MS',
  'PASSWORD_RECOVERY_LIMIT_PER_15_MIN',
  'BOARD_RETENTION_MS',
  'BOARD_PURGE_INTERVAL_MS',
];

const loadEnv = async settings => {
  vi.resetModules();
  vi.unstubAllEnvs();

  for (const name of ALL_NAMES) {
    vi.stubEnv(name, '');
  }

  for (const [name, value] of Object.entries(settings)) {
    vi.stubEnv(name, value);
  }

  return (await import('../src/config/env.js')).default;
};

const production = overrides => loadEnv({ ...PRODUCTION, ...overrides });

describe('NODE_ENV', () => {
  test.each(['development', 'test', 'production'])('accepts %s', async value => {
    const env = await loadEnv(value === 'production' ? PRODUCTION : { NODE_ENV: value });

    expect(env.NODE_ENV).toBe(value);
  });

  test('is development when unset', async () => {
    expect((await loadEnv({})).NODE_ENV).toBe('development');
  });

  test.each(['prod', 'Production', 'staging', 'dev'])('refuses %s, which would read as not production', async value => {
    await expect(loadEnv({ ...PRODUCTION, NODE_ENV: value })).rejects.toThrow(
      'NODE_ENV must be one of development, test, production'
    );
  });
});

describe('MONGODB_URI', () => {
  test('is required in production, with no fallback to a local database', async () => {
    await expect(production({ MONGODB_URI: '' })).rejects.toThrow('MONGODB_URI is required in production');
  });

  test('falls back to a local database in development', async () => {
    expect((await loadEnv({})).MONGODB_URI).toBe('mongodb://localhost/boards-db');
  });

  test.each(['mongodb://localhost/db', 'mongodb+srv://cluster.example/db'])('accepts %s', async uri => {
    expect((await production({ MONGODB_URI: uri })).MONGODB_URI).toBe(uri);
  });

  test('refuses a value that is not a MongoDB connection string, without printing it', async () => {
    const uri = 'postgres://bb:hunter2@db.example/boards';

    const failure = await production({ MONGODB_URI: uri }).catch(error => error);

    expect(failure.message).toContain('MONGODB_URI must be a MongoDB connection string');
    expect(failure.message).not.toContain('hunter2');
  });
});

describe('JWT_SECRET', () => {
  test('is required in production', async () => {
    await expect(production({ JWT_SECRET: '' })).rejects.toThrow('JWT_SECRET is required in production');
  });

  test('has to be 32 characters in production, the floor for an HS256 key', async () => {
    await expect(production({ JWT_SECRET: 'x'.repeat(31) })).rejects.toThrow(
      'JWT_SECRET must be at least 32 characters long in production'
    );
    expect((await production({ JWT_SECRET: 'x'.repeat(32) })).JWT_SECRET).toBe('x'.repeat(32));
  });

  test('never appears in the refusal', async () => {
    const failure = await production({ JWT_SECRET: 'too-short-to-use' }).catch(error => error);

    expect(failure.message).toContain('JWT_SECRET');
    expect(failure.message).not.toContain('too-short-to-use');
  });

  test('may be short, or unset, outside production', async () => {
    expect((await loadEnv({ JWT_SECRET: 'short' })).JWT_SECRET).toBe('short');
    expect((await loadEnv({ NODE_ENV: 'test' })).JWT_SECRET).toBe('insecure-development-secret');
  });
});

describe('PORT and SALT', () => {
  test('default to 5000 and 10', async () => {
    const env = await loadEnv({});

    expect(env.PORT).toBe(5000);
    expect(env.SALT).toBe(10);
  });

  test('are read as numbers', async () => {
    const env = await production({ PORT: '8080', SALT: '12' });

    expect(env.PORT).toBe(8080);
    expect(env.SALT).toBe(12);
  });

  test.each(['0', '65536', '80a', '-1', '1.5'])('refuses PORT %s', async value => {
    await expect(loadEnv({ PORT: value })).rejects.toThrow('PORT must be a whole number from 1 to 65535');
  });

  test.each(['3', '32', 'abc', '0', '-1', '10.5'])('refuses SALT %s instead of letting bcrypt clamp it', async value => {
    await expect(loadEnv({ SALT: value })).rejects.toThrow('SALT must be a whole number from 4 to 31');
  });
});

describe('SMTP flags', () => {
  test.each(['yes', '1', 'on'])('refuses %s instead of reading it as false', async value => {
    await expect(loadEnv({ SMTP_SECURE: value })).rejects.toThrow('SMTP_SECURE must be true or false');
    await expect(loadEnv({ SMTP_ALLOW_PLAINTEXT: value })).rejects.toThrow('SMTP_ALLOW_PLAINTEXT must be true or false');
  });

  test('reads true and false in any case, and is false when unset', async () => {
    expect((await loadEnv({ SMTP_SECURE: 'TRUE' })).SMTP_SECURE).toBe(true);
    expect((await loadEnv({ SMTP_SECURE: 'false' })).SMTP_SECURE).toBe(false);
    expect((await loadEnv({})).SMTP_SECURE).toBe(false);
  });
});

describe('CORS_ORIGINS', () => {
  test('is required in production', async () => {
    await expect(production({ CORS_ORIGINS: '' })).rejects.toThrow('CORS_ORIGINS is required in production');
  });

  test('is a list of origins, each trimmed and kept as an origin', async () => {
    const env = await loadEnv({ CORS_ORIGINS: ' https://breezyboard.example/ , http://localhost:5173' });

    expect(env.CORS_ORIGINS).toEqual(['https://breezyboard.example', 'http://localhost:5173']);
  });

  test('is empty in development, which reflects any origin', async () => {
    expect((await loadEnv({})).CORS_ORIGINS).toEqual([]);
  });

  test.each([
    ['https://example.com:443', 'https://example.com'],
    ['https://Example.com', 'https://example.com'],
    ['http://localhost:80/', 'http://localhost'],
    ['HTTPS://EXAMPLE.COM:8443', 'https://example.com:8443'],
  ])('accepts %s and stores the origin the browser sends, %s', async (value, expected) => {
    expect((await loadEnv({ CORS_ORIGINS: value })).CORS_ORIGINS).toEqual([expected]);
  });

  test.each([
    ['breezyboard.example', 'is not a valid URL'],
    ['*', 'is not a valid URL'],
    ['ftp://breezyboard.example', 'does not use http or https'],
    ['https://breezyboard.example/app', 'has a path'],
    ['https://breezyboard.example?x=1', 'has a query string'],
    ['https://breezyboard.example/#top', 'has a fragment'],
    ['https://bb:hunter2@breezyboard.example', 'has credentials'],
  ])('refuses %s, which can never equal a request Origin header, and says why', async (value, reason) => {
    const failure = await loadEnv({ CORS_ORIGINS: value }).catch(error => error);

    expect(failure.message).toContain('CORS_ORIGINS must list origins');
    expect(failure.message).toContain(`an entry ${reason}`);
    expect(failure.message).not.toContain('hunter2');
  });
});

describe('SMTP_PASSWORD', () => {
  test('a password of nothing but spaces is unset, like every other variable', async () => {
    const env = await loadEnv({ SMTP_PASSWORD: '   ' });

    expect(env.SMTP_PASSWORD).toBe('');
  });

  test('a password of spaces beside a user is refused as half of a pair', async () => {
    await expect(loadEnv({ SMTP_USER: 'mailer', SMTP_PASSWORD: '   ' })).rejects.toThrow(
      'SMTP_USER and SMTP_PASSWORD must be set together or not at all'
    );
  });

  test('a real password keeps its spaces', async () => {
    const env = await loadEnv({ SMTP_USER: 'mailer', SMTP_PASSWORD: ' pa ss ' });

    expect(env.SMTP_PASSWORD).toBe(' pa ss ');
  });
});

describe('numeric windows and limits', () => {
  test('are refused in production when they are wrong', async () => {
    await expect(production({ JWT_INACTIVITY_TTL_MS: 'soon' })).rejects.toThrow(
      'JWT_INACTIVITY_TTL_MS must be a number greater than zero'
    );
    await expect(production({ REGISTRATION_LIMIT_PER_HOUR: '2.5' })).rejects.toThrow(
      'REGISTRATION_LIMIT_PER_HOUR must be a whole number greater than zero'
    );
    await expect(production({ TRUST_PROXY_HOPS: '-1' })).rejects.toThrow(
      'TRUST_PROXY_HOPS must be a whole number of zero or more'
    );
  });

  test('fall back to their defaults outside production', async () => {
    const env = await loadEnv({ JWT_INACTIVITY_TTL_MS: 'soon', REGISTRATION_LIMIT_PER_HOUR: '2.5' });

    expect(env.JWT_INACTIVITY_TTL_MS).toBe(15 * 60 * 1000);
    expect(env.REGISTRATION_LIMIT_PER_HOUR).toBe(20);
  });

  test('take effect when valid, tiny values included', async () => {
    const env = await production({ JWT_ABSOLUTE_TTL_MS: '500', PASSWORD_RESET_COOLDOWN_MS: '1' });

    expect(env.JWT_ABSOLUTE_TTL_MS).toBe(500);
    expect(env.PASSWORD_RESET_COOLDOWN_MS).toBe(1);
  });
});

describe('the refusal', () => {
  test('names every problem at once, so one restart fixes them all', async () => {
    const failure = await production({ MONGODB_URI: '', JWT_SECRET: 'short', SALT: '99', CORS_ORIGINS: '' }).catch(
      error => error
    );

    for (const name of ['MONGODB_URI', 'JWT_SECRET', 'SALT', 'CORS_ORIGINS']) {
      expect(failure.message).toContain(name);
    }
  });

  test('carries no value of any variable', async () => {
    const failure = await production({
      JWT_SECRET: 'sentinel-secret',
      MONGODB_URI: 'nope://sentinel-user:sentinel-pass@host/db',
      SMTP_PASSWORD: 'sentinel-smtp',
      SMTP_USER: '',
    }).catch(error => error);

    expect(failure.message).toContain('Refusing to start');
    expect(failure.message).not.toContain('sentinel');
  });
});
