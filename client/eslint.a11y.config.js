// Akadálymentességi lint-szabályok a JSX-re (eslint-plugin-jsx-a11y, L26): a statikusan felismerhető
// hibákat fogják meg – hiányzó alt, érvénytelen ARIA-attribútum vagy -szerep, kattintható nem
// kezelőelem, címke nélküli mező. Külön konfiguráció, hogy a fő lint-beállítás változatlan maradjon;
// a `npm run lint` mindkettőt futtatja (`lint:a11y`). A futásidejű ellenőrzés az axe-core a tesztekben,
// a kézi próba a képernyőolvasókkal.
// Forrás: eslint-plugin-jsx-a11y – Usage (flat config, `flatConfigs.recommended`),
// https://github.com/jsx-eslint/eslint-plugin-jsx-a11y#usage (adaptálva)
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [jsxA11y.flatConfigs.recommended],
    // A TypeScript-elemző, mint a fő konfigurációban (a szabályok a JSX-et nézik)
    languageOptions: { parser: tseslint.parser },
    rules: {
      // A `role` prop saját komponensen (SessionGate role="ADMIN") nem ARIA-szerep
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      // A list-style: none nélküli listát a Safari + VoiceOver nem listaként olvassa: a kiírt
      // role="list" szándékos (stílusútmutató)
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      // A vízszintesen görgethető adattábla régiója billentyűzettel is görgethető (tabindex="0" –
      // design README 1.4.10, Roselli); a tabpanel a szabály alapértelmezése
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
      // Az autoFocus csak párbeszédablak első mezőjén (WAI-ARIA APG – Dialog) és a felhasználó
      // indította visszaállítás után (ellenőrzés: „Másik kép / hash”) szerepel, oldalbetöltéskor nem
      'jsx-a11y/no-autofocus': 'off',
    },
  },
]);
