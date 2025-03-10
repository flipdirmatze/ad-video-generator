import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Add Next.js plugin
    plugins: {
      '@next/next': nextPlugin,
    },
    // Add rules from Next.js
    rules: {
      ...nextPlugin.configs.recommended.rules,
      // Deaktiviere die Regel für unbenutzte Variablen im Produktionsbuild
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // Warnungen, die das Deployment nicht blockieren sollten
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-var': 'warn',
      '@next/next/no-img-element': 'warn',
      'prefer-const': 'warn'
    },
  },
  {
    // Set parser options without project reference for Vercel compatibility
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
  }
);
