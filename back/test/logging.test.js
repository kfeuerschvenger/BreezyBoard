import express from 'express';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { createHttpLogger } from '../src/middleware/logging.middleware.js';
import { createLogger } from '../src/utils/logger.js';

const SESSION_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.session-token-in-the-request.signature';
const RENEWED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.renewed-token-in-the-response.signature';
const COOKIE_VALUE = 'sid=cookie-secret-value';
const SET_COOKIE_VALUE = 'sid=set-cookie-secret-value; HttpOnly';

/** An app wired with the real request logger, writing to memory instead of stdout. */
const loggedApp = () => {
  const lines = [];
  const destination = { write: chunk => lines.push(chunk) };
  const app = express();

  app.use(createHttpLogger(createLogger({ level: 'info', destination })));
  app.get('/probe', (_req, res) => {
    res.set('X-Auth-Token', RENEWED_TOKEN);
    res.set('Set-Cookie', SET_COOKIE_VALUE);
    res.json({ ok: true });
  });

  return { app, lines };
};

describe('request logging', () => {
  test('no credential header value reaches a log line', async () => {
    const { app, lines } = loggedApp();

    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${SESSION_TOKEN}`)
      .set('Proxy-Authorization', 'Basic proxy-secret-value')
      .set('Cookie', COOKIE_VALUE);

    await new Promise(resolve => setTimeout(resolve, 20));
    const output = lines.join('');

    expect(output).not.toBe('');

    for (const secret of [
      SESSION_TOKEN,
      RENEWED_TOKEN,
      COOKIE_VALUE,
      SET_COOKIE_VALUE,
      'proxy-secret-value',
      'cookie-secret-value',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  test('the line still says what happened, with the credential headers present but censored', async () => {
    const { app, lines } = loggedApp();

    await request(app).get('/probe').set('Authorization', `Bearer ${SESSION_TOKEN}`);
    await new Promise(resolve => setTimeout(resolve, 20));

    const entry = JSON.parse(lines.at(-1));

    expect(entry.req.method).toBe('GET');
    expect(entry.req.url).toBe('/probe');
    expect(entry.res.statusCode).toBe(200);
    expect(entry.req.headers.authorization).toBe('[Redacted]');
    expect(entry.res.headers['x-auth-token']).toBe('[Redacted]');
    expect(entry.req.id).toBeTruthy();
  });
});
