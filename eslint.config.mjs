import { fixupConfigRules } from '@eslint/compat';
import pluginNext from '@next/eslint-plugin-next';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
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
    },
  },
];

export default eslintConfig;
