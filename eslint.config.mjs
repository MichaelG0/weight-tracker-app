// @ts-check
import angular from '@angular-eslint/eslint-plugin';
import templatePlugin from '@angular-eslint/eslint-plugin-template';
import templateParser from '@angular-eslint/template-parser';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['projects/**/*'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
        createDefaultProgram: true,
      },
    },
    plugins: {
      '@angular-eslint': angular,
    },
    processor: templatePlugin.processors['extract-inline-html'],
    rules: {
      ...angular.configs.recommended.rules,
      '@angular-eslint/component-class-suffix': [
        'error',
        {
          suffixes: ['Page', 'Component'],
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      'no-console': 'error',
    },
  },
  {
    files: ['**/log.service.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: {
      parser: templateParser,
    },
    plugins: {
      '@angular-eslint/template': templatePlugin,
    },
    rules: {
      ...templatePlugin.configs.recommended.rules,
    },
  },
];
