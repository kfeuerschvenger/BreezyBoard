import js from '@eslint/js';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

/**
 * Lint for the backend: ESM on Node, the ESLint recommended rules and
 * nothing that is specific to the browser or to React.
 *
 * The test directory is linted with the same rules as the source. The
 * suite runs on Vitest with explicit imports (no globals), so no test
 * globals are declared and a missing import is reported as an undefined
 * name rather than hidden.
 */
export default [
  globalIgnores(['node_modules', 'uploads', 'coverage']),
  {
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
];
