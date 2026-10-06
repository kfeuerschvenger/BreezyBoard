import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

/**
 * The dependency direction from section 12.3 of the revival plan, as rules
 * rather than as a convention.
 *
 * A structure that cannot be verified automatically is a convention, and
 * this codebase is the evidence of what happens to those. The rules go in
 * while the graph is still small enough that they pass, rather than after
 * the migration, when turning them on would mean fixing a hundred
 * violations at once.
 *
 * pages -> features -> shared, and never the other way. One feature reaches
 * another only through its public index.ts.
 */
const layerBoundaries = [
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/pages/*', '**/features/*', '**/pages/*'],
              message:
                'shared/ must not know about features or pages. Anything it needs from them belongs in shared/, or the code belongs in the feature.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/pages/*', '**/pages/*'],
              message: 'features/ must not import from pages/. Pages compose features, not the other way round.',
            },
            {
              // Alias form only, deliberately. The obvious relative
              // equivalent, '../*/services/*', also matches
              // '../../services/*', because a glob star matches the literal
              // '..' segment, and that is the legacy top level services
              // directory rather than another feature. Written that way the
              // rule flagged three correct imports on the day it went in.
              group: ['@/features/*/*'],
              message: 'Reach another feature through its public index.ts, never into its internals.',
            },
          ],
        },
      ],
    },
  },
  {
    // A component renders; it does not fetch. Data access lives in the
    // feature's hooks. This is what survives of the container and
    // presentational split now that hooks do the separating: the rule, not
    // a TaskDrawerContainer plus TaskDrawerView file pair at every level.
    files: ['src/shared/ui/**/*.{ts,tsx}', 'src/features/*/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/services/*', '**/services/*'],
              message: 'A component may not reach the network. Put the call in the feature hook that renders it.',
            },
          ],
        },
      ],
    },
  },
];


export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
      // The static layer of the accessibility gate in section 10.2. It
      // catches the class of defect that P4-3 is made of: labels with no
      // associated control, click handlers with no keyboard equivalent,
      // aria-hidden over real information, invalid ARIA.
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  ...layerBoundaries,
]);
