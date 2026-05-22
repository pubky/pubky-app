import { fixupConfigRules } from '@eslint/compat';
import pluginNext from '@next/eslint-plugin-next';
import pluginStylistic from '@stylistic/eslint-plugin';
import pluginImport from 'eslint-plugin-import';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const eslintConfig = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/__snapshots__/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'cypress/**',
      'cypress.config.ts',
      'next-env.d.ts',
      // PWA generated files (serwist)
      'public/sw.js',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: pluginReact,
      'react-hooks': pluginReactHooks,
      '@next/next': pluginNext,
      '@stylistic': pluginStylistic,
      import: pluginImport,
      'simple-import-sort': pluginSimpleImportSort,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      ...pluginReact.configs['recommended'].rules,
      ...pluginReactHooks.configs['recommended'].rules,
      ...pluginNext.configs['recommended'].rules,
      ...pluginNext.configs['core-web-vitals'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/set-state-in-effect': 'off', // Allow setState in effects
      'import/first': 'error',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
      ],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^\\u0000', '^node:', '^react(?:$|/)', '^react-dom(?:$|/)', '^next(?:$|/)', '^@?\\w', '^@/', '^', '^\\.'],
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*.test.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      '@next/next/no-img-element': 'off',
      // Tests render bare <a> elements as fixtures (e.g. inside `asChild`) to
      // verify component behavior; they are not real page navigation.
      '@next/next/no-html-link-for-pages': 'off',
      // Keep test type assertions honest: escape hatches must route through the
      // named helpers in `src/test-utils` (asInvalid, asOpaque, mockSession, ...)
      // so intent is documented and every escape is greppable.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSAsExpression[expression.type="TSAsExpression"][expression.typeAnnotation.type="TSUnknownKeyword"]',
          message:
            '`as unknown as T` is banned in test files. Use asInvalid<T>() / asOpaque<T>() or a dedicated mock helper from @/test-utils instead.',
        },
        {
          selector: 'TSAsExpression[typeAnnotation.type="TSAnyKeyword"]',
          message:
            '`as any` is banned in test files. Use asOpaque<T>() or a dedicated mock helper from @/test-utils instead.',
        },
      ],
    },
  },
  {
    // Helpers in src/test-utils are the single permitted home for the underlying
    // casts that the rule above forbids in tests. Exempt only these files.
    files: ['src/test-utils/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];

export default eslintConfig;
