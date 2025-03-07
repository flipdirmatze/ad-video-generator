import path from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

const __filename = fileURLToPath(import.meta.url);
const __path.dirname = path.dirname(__filename);


const compat = new FlatCompat({
  baseDirectory: __path.dirname,
  recommendedConfig: eslint.configs.recommended,
});

export default [
  ...compat.config({
    extends: [
      'next/core-web-vitals',
      'plugin:@typescript-eslint/recommended'
    ],
  }),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off'
    }
  },
  {
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
      '@next/next/no-html-link-for-pages': 'off'
    }
  }
];
