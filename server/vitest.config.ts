// Vitest-konfiguráció három projekttel:
// - unit: unit tesztek a forrás mellett (src/**/*.test.ts) és végponttesztek (tests/integration) –
//   adatbázis nélkül;
// - db: adatbázis-tesztek (tests/db) a PostgreSQL-tesztadatbázison. A fájlok egymás után futnak, mert
//   ugyanazt az adatbázist ürítik ki; a globalSetup előtte lefuttatja a migrációkat;
// - chain: a blokklánc-szolgáltatás integrációs tesztjei (tests/chain) egy lokális Hardhat-hálózaton,
//   amelyet a globalSetup indít el egy szabad porton, és a végén leállít.
// Forrás: Vitest dokumentáció – Configuration, Coverage, Projects, https://vitest.dev/config/ (adaptálva)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Mint a server.ts első importja: a libvips nagy képet se bontson ideiglenes fájlba (a küszöböt
    // a sharp első használata előtt kell beállítani)
    setupFiles: ['./src/config/imageMemory.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // A server.ts csak összerakja és elindítja az alkalmazást (belépési pont, nincs üzleti logika);
      // a generated/ a Prisma által generált kliens; a .d.ts fájlokban csak típusok vannak.
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/server.ts', 'src/generated/**'],
      // A teljesen lefedett fájlok is jelenjenek meg a táblázatban (alapból kimaradnak)
      reporter: [['text', { skipFull: false }], 'html'],
      // Bukó teszt mellett is készüljön jelentés: a CI mellékletként így is megőrzi (L27)
      reportOnFailure: true,
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          // A képfeldolgozó tesztek (vízjel-szöveg, több kép) lassabb futtatón (CI, lefedettség)
          // túlléphetik az 5 másodperces alapértelmezést (L27)
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          globalSetup: ['tests/db/globalSetup.ts'],
          fileParallelism: false,
          // A bcrypt szándékosan lassú (12-es költség): a seed-tesztek több hash-t is számolnak
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'chain',
          include: ['tests/chain/**/*.test.ts'],
          globalSetup: ['tests/chain/globalSetup.ts'],
          // Egy közös Hardhat-hálózat: a tesztek (pl. a bányászás ki-bekapcsolása) egymás után futnak
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
