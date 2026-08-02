import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

/**
 * Lint is where the project's non-negotiables are mechanically enforced.
 * See CLAUDE.md § Non-negotiables and docs/adr/0006-pure-domain-layer.md.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'prototype/**',
      'next-env.d.ts',
      'supabase/.temp/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  /* ==========================================================================
     ADR-0006 — the training domain is a pure functional core.
     No I/O, no ambient time, no ambient randomness. The current date is a
     parameter; randomness is a seeded generator passed in. A stray `new Date()`
     silently breaks determinism, which is why this is lint-enforced rather
     than left as a convention.
     ========================================================================== */
  {
    files: ['lib/training/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/supabase*',
                '@/app/*',
                '@/components/*',
                'next/*',
                'react',
                '@supabase/*',
                'node:*',
                'fs',
                'path',
                'crypto',
              ],
              message:
                'lib/training must stay pure — no I/O, no framework. Pass data in as plain objects. See docs/adr/0006-pure-domain-layer.md',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'lib/training must not perform I/O (ADR-0006).' },
        { name: 'localStorage', message: 'lib/training must not perform I/O (ADR-0006).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Ambient time breaks determinism. Take the current date as a parameter (ADR-0006).',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            'Ambient time breaks determinism. Take the current date as a parameter (ADR-0006).',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            'Ambient randomness breaks determinism. Pass in a seeded generator (ADR-0006).',
        },
      ],
    },
  },

  /* ==========================================================================
     The service-role key bypasses RLS. It may be read in exactly one module.
     ========================================================================== */
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['lib/supabase/admin.ts', 'tests/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read environment variables through lib/env.ts so they are validated at boot.',
        },
      ],
    },
  },

  /* Config files sit outside the TS project — lint them without type info. */
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  /* Next requires `headers()` to be async even when it returns synchronously. */
  {
    files: ['next.config.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  /* Tests may do anything the runtime allows. */
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
      'no-console': 'off',
    },
  },
);
