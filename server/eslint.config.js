// ESLint (flat config) a typescript-eslint ajánlott szabályaival. A formázást a Prettier végzi.
// Forrás: typescript-eslint – Getting Started, https://typescript-eslint.io/getting-started/ (adaptálva)
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'src/generated/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // Az aláhúzással kezdődő paraméter szándékosan nincs használva (pl. az Express hibakezelő 4.
      // paramétere kötelező, de nem kell).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
