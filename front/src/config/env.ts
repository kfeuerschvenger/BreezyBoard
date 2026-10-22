import { z } from 'zod';

/** What the application reads from the build environment, after it is checked. */
export interface FrontendEnv {
  /** The base URL of every API request. An empty string is the origin of the page. */
  apiUrl: string;
  /** Whether React StrictMode wraps the application. */
  strictMode: boolean;
}

const API_URL_RULE =
  'VITE_API_URL must be an absolute http or https URL, or a path that starts with one slash, such as /api/v1';

/** Treats a variable that is set to nothing but spaces as not set. */
const blankAsUnset = (value: unknown): unknown => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const isApiLocation = (value: string): boolean => {
  if (value.startsWith('/')) {
    // `//host/path` is a protocol relative URL to another origin, not a path on this one.
    return !value.startsWith('//');
  }

  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Checks the `VITE_` variables and returns them in the shape the application
 * uses. Vite inlines them into the bundle when the page is built, so a wrong
 * value is fixed for the life of that build and has to be caught before a page
 * is served from it. The page throws at start rather than guess.
 *
 * `VITE_API_URL` is required in a production build. Left unset, the base URL
 * silently becomes the origin of the page and every request goes to a path the
 * server does not have. The development server and the tests may leave it
 * unset. A refusal names the variable and never prints its value.
 */
export const parseFrontendEnv = (raw: Record<string, unknown>, isProduction: boolean): FrontendEnv => {
  const schema = z.object({
    VITE_API_URL: z.preprocess(
      blankAsUnset,
      z.string().trim().refine(isApiLocation, API_URL_RULE).optional()
    ),
    VITE_USE_STRICT_MODE: z.preprocess(
      blankAsUnset,
      z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.enum(['true', 'false'], { error: 'VITE_USE_STRICT_MODE must be true or false' }))
        .optional()
    ),
  });

  const result = schema.safeParse(raw);

  if (!result.success) {
    const lines = result.error.issues.map(issue => `- ${issue.message}`);
    throw new Error(`Invalid frontend environment configuration:\n${lines.join('\n')}`);
  }

  const { VITE_API_URL: apiUrl, VITE_USE_STRICT_MODE: strictMode } = result.data;

  if (isProduction && apiUrl === undefined) {
    throw new Error('Invalid frontend environment configuration:\n- VITE_API_URL is required in a production build and was not set');
  }

  return { apiUrl: apiUrl ?? '', strictMode: strictMode === 'true' };
};

export const frontendEnv: FrontendEnv = parseFrontendEnv(import.meta.env, import.meta.env.PROD);
