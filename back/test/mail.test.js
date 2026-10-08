import nodemailer from 'nodemailer';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildTransport, sendMail, setMailTransport, smtpOptions } from '../src/services/mail.service.js';

afterEach(() => {
  setMailTransport(null);
  vi.unstubAllEnvs();
  vi.resetModules();
});

// env.js reads process.env once, when it is first evaluated, so each case
// stubs the environment and imports a fresh copy.
const loadEnv = async overrides => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'a-secret-for-this-test');
  vi.stubEnv('CORS_ORIGINS', 'https://breezyboard.example');
  vi.stubEnv('FRONTEND_URL', 'https://breezyboard.example');
  vi.stubEnv('SMTP_HOST', 'smtp.example.com');
  vi.stubEnv('MAIL_FROM', 'BreezyBoard <no-reply@breezyboard.example>');

  for (const [name, value] of Object.entries(overrides)) {
    vi.stubEnv(name, value);
  }

  return (await import('../src/config/env.js')).default;
};

describe('mail transport', () => {
  test('sendMail hands the message to the installed transport with the configured sender', async () => {
    const sent = [];
    setMailTransport({ sendMail: async message => sent.push(message) });

    await sendMail({ to: 'person@example.com', subject: 'Hello', text: 'Body' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'person@example.com', subject: 'Hello', text: 'Body' });
    expect(sent[0].from).toContain('no-reply@');
  });

  test('without an installed transport the test environment serialises the message instead of sending it', async () => {
    const info = await sendMail({ to: 'person@example.com', subject: 'Hello', text: 'Body' });

    expect(JSON.parse(info.message).subject).toBe('Hello');
  });
});

describe('mail configuration in production', () => {
  test('a complete configuration loads', async () => {
    const env = await loadEnv({});

    expect(env.SMTP_HOST).toBe('smtp.example.com');
    expect(env.FRONTEND_URL).toBe('https://breezyboard.example');
  });

  test.each(['FRONTEND_URL', 'SMTP_HOST', 'MAIL_FROM'])('refuses to start without %s', async name => {
    await expect(loadEnv({ [name]: '' })).rejects.toThrow(`${name} is required in production`);
  });

  test('refuses a frontend address that is not an http or https URL', async () => {
    await expect(loadEnv({ FRONTEND_URL: 'breezyboard.example' })).rejects.toThrow('FRONTEND_URL must be an absolute URL');
    await expect(loadEnv({ FRONTEND_URL: 'ftp://breezyboard.example' })).rejects.toThrow('FRONTEND_URL must use http or https');
  });

  test('keeps only the origin of the frontend address', async () => {
    const env = await loadEnv({ FRONTEND_URL: 'https://breezyboard.example/app/' });

    expect(env.FRONTEND_URL).toBe('https://breezyboard.example');
  });

  test('refuses a user without a password and a password without a user', async () => {
    await expect(loadEnv({ SMTP_USER: 'mailer' })).rejects.toThrow('SMTP_USER and SMTP_PASSWORD must be set together');
    await expect(loadEnv({ SMTP_PASSWORD: 'secret' })).rejects.toThrow('SMTP_USER and SMTP_PASSWORD must be set together');
  });
});

describe('SMTP transport security', () => {
  const relay = { SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_ALLOW_PLAINTEXT: false };

  test('requires STARTTLS on a connection that is not encrypted from the start', () => {
    expect(smtpOptions(relay)).toMatchObject({ secure: false, requireTLS: true });
  });

  test('an implicit TLS connection needs no upgrade', () => {
    expect(smtpOptions({ ...relay, SMTP_PORT: 465, SMTP_SECURE: true })).toMatchObject({ secure: true, requireTLS: false });
  });

  test('the explicit plain text opt-out drops the requirement', () => {
    expect(smtpOptions({ ...relay, SMTP_ALLOW_PLAINTEXT: true })).toMatchObject({ secure: false, requireTLS: false });
  });

  test('credentials are passed only when configured', () => {
    expect(smtpOptions(relay).auth).toBeUndefined();
    expect(smtpOptions({ ...relay, SMTP_USER: 'mailer', SMTP_PASSWORD: 'secret' }).auth).toEqual({
      user: 'mailer',
      pass: 'secret',
    });
  });

  test('the transport outside test is built from those options', () => {
    const create = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({});

    buildTransport({ ...relay, NODE_ENV: 'production' });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com', requireTLS: true }));
    create.mockRestore();
  });

  test('is never plain text by default', async () => {
    const env = await loadEnv({});

    expect(env.SMTP_ALLOW_PLAINTEXT).toBe(false);
  });

  test('production refuses to start with the plain text opt-out', async () => {
    await expect(loadEnv({ SMTP_ALLOW_PLAINTEXT: 'true' })).rejects.toThrow('SMTP_ALLOW_PLAINTEXT is not allowed in production');
  });

  test('outside production the opt-out is honoured', async () => {
    const env = await loadEnv({ NODE_ENV: 'development', SMTP_ALLOW_PLAINTEXT: 'true' });

    expect(env.SMTP_ALLOW_PLAINTEXT).toBe(true);
  });
});
