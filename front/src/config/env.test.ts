import { describe, expect, it } from 'vitest';
import { parseFrontendEnv } from './env';

describe('parseFrontendEnv', () => {
  it('reads the API location and the strict mode flag', () => {
    expect(parseFrontendEnv({ VITE_API_URL: 'http://localhost:5000/api/v1', VITE_USE_STRICT_MODE: 'true' }, true)).toEqual({
      apiUrl: 'http://localhost:5000/api/v1',
      strictMode: true,
    });
  });

  it.each(['/api/v1', 'https://api.example.com/v1', ' /api/v1 '])('accepts the API location %j', value => {
    expect(parseFrontendEnv({ VITE_API_URL: value }, true).apiUrl).toBe(value.trim());
  });

  it('may leave the API location unset outside a production build, which is the origin of the page', () => {
    expect(parseFrontendEnv({}, false)).toEqual({ apiUrl: '', strictMode: false });
    expect(parseFrontendEnv({ VITE_API_URL: '  ' }, false).apiUrl).toBe('');
  });

  it('refuses a production build without an API location', () => {
    expect(() => parseFrontendEnv({}, true)).toThrow('VITE_API_URL is required in a production build');
    expect(() => parseFrontendEnv({ VITE_API_URL: '' }, true)).toThrow('VITE_API_URL is required in a production build');
  });

  it.each(['api/v1', '//other.example/api', 'ftp://example.com', 'localhost:5000'])(
    'refuses the API location %j',
    value => {
      expect(() => parseFrontendEnv({ VITE_API_URL: value }, false)).toThrow('VITE_API_URL must be an absolute http');
    }
  );

  it('reads the strict mode flag in any case and is false when unset', () => {
    expect(parseFrontendEnv({ VITE_USE_STRICT_MODE: 'TRUE' }, false).strictMode).toBe(true);
    expect(parseFrontendEnv({ VITE_USE_STRICT_MODE: 'false' }, false).strictMode).toBe(false);
    expect(parseFrontendEnv({}, false).strictMode).toBe(false);
  });

  it.each(['yes', '1'])('refuses the strict mode flag %j instead of reading it as false', value => {
    expect(() => parseFrontendEnv({ VITE_USE_STRICT_MODE: value }, false)).toThrow(
      'VITE_USE_STRICT_MODE must be true or false'
    );
  });

  it('names every problem and never prints a value', () => {
    const attempt = () => parseFrontendEnv({ VITE_API_URL: 'sentinel-value', VITE_USE_STRICT_MODE: 'sentinel-flag' }, false);

    expect(attempt).toThrow('VITE_API_URL');
    expect(attempt).toThrow('VITE_USE_STRICT_MODE');
    expect(attempt).not.toThrow('sentinel');
  });
});
