import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
// For enhanced developer experience, integrate Prettier by installing prettier, eslint-config-prettier, and eslint-plugin-prettier, and extend the configuration with plugin:prettier/recommended to run Prettier as an ESLint rule.
// This allows automatic code formatting via eslint --fix. Additionally, configure your editor (e.g., VS Code) to auto-fix on save using "editor.codeActionsOnSave": { "source.fixAll.eslint": true }.
