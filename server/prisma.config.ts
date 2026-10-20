// A Prisma CLI konfigurációja (Prisma 7): a séma, a migrációk és a seed helye, az adatbázis URL-je.
// A Prisma 7 a .env fájlt már nem tölti be magától; a Node beépített függvényével töltjük be, amely a
// már beállított változókat nem írja felül (így a tesztek a saját adatbázis-URL-jüket adhatják át).
// Forrás: Prisma ORM v7 – Prisma Config reference,
// https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference (adaptálva)
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'prisma/config';

const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // A `prisma generate`-hez nem kell adatbázis (pl. `npm install` után egy friss klónban), ezért nem az
  // env() segédfüggvényt használjuk: az hiányzó változónál a generálást is megakasztaná.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
