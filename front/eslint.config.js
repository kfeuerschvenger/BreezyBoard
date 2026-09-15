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

/**
 * The accessibility rules that the pre-migration code cannot satisfy yet,
 * held at warn in the directories that Phase 5c is going to rewrite anyway.
 *
 * This is a ratchet, not an amnesty. Everything written from here on lives
 * under `shared/`, `features/` and `app/`, where these same rules are errors
 * from birth, so new code cannot add to the pile. Each legacy file drops out
 * of this list as it migrates, and the list is expected to reach empty and
 * be deleted.
 *
 * As of the day the gate went in: ten unassociated labels across
 * CreateBoardModal and TaskDrawer, and four elements carrying a click
 * handler with no keyboard equivalent, in TaskCard, TaskDrawer and
 * BoardDashboard. Every one of them is already written up as P4-3.
 *
 * They are warnings rather than errors for one reason worth stating: two of
 * the four click handlers are the drag handle and the owner suggestion
 * list, and rewriting those means touching the code that P0-3 and P2-6a
 * live in. That belongs in a change about drag and dropdowns, judged on its
 * own, not smuggled into the commit that installs a linter.
 */
const legacyAccessibilityDebt = {
  files: ['src/components/**/*.{ts,tsx}', 'src/pages/**/*.{ts,tsx}'],
  rules: {
    'jsx-a11y/label-has-associated-control': 'warn',
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
  },
};

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
  legacyAccessibilityDebt,
]);
