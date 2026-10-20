// Az adatbázis-tesztek előkészítése – egyszer fut, a tesztfájlok előtt: ellenőrzi a tesztadatbázis
// URL-jét, és a Prisma-migrációkat lefuttatja rajta (`prisma migrate deploy`). A tesztek a fejlesztői
// adatbázistól külön, „_test” végű adatbázist használnak, mert minden teszt előtt kiürítik.
// Forrás: Vitest – globalSetup, provide/inject, https://vitest.dev/config/globalsetup (adaptálva)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import type { TestProject } from 'vitest/node';

const SERVER_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRISMA_CLI = join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js');

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

function readTestDatabaseUrl(): string {
  const envFile = join(SERVER_ROOT, '.env');
  // A .env-et csak kiolvassuk, a process.env-be nem töltjük be: a többi teszt környezete nem változik
  const fileEnv: Record<string, string | undefined> = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8'))
    : {};
  const url = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('A TEST_DATABASE_URL nincs beállítva (server/.env – lásd server/.env.example)');
  }
  // A `new URL()` hibája magát az URL-t (a jelszóval együtt) is tartalmazná, ezért előbb ellenőrzünk
  if (!URL.canParse(url)) {
    throw new Error(
      'A TEST_DATABASE_URL nem érvényes URL (az értékét a jelszó miatt nem írjuk ki) – ' +
        'a jelszóban lévő különleges karaktereket (#, /, @) URL-kódolni kell',
    );
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `A tesztadatbázis neve „_test” végű kell legyen (most: „${databaseName}”), ` +
        'mert a tesztek minden futáskor kiürítik',
    );
  }
  return url;
}

/** A hibaüzenetből kitakarja az adatbázis jelszavát (URL-kódolt és nyers alakban is) – a napló a CI-ban is látszik. */
function maskPassword(text: string, databaseUrl: string): string {
  const { password } = new URL(databaseUrl);
  if (!password) return text;
  let decoded = password;
  try {
    decoded = decodeURIComponent(password);
  } catch {
    // Hibás %-kódolás: csak a nyers alakot takarjuk ki
  }
  return text.replaceAll(password, '[REJTETT]').replaceAll(decoded, '[REJTETT]');
}

function migrate(databaseUrl: string): void {
  const result = spawnSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
    cwd: SERVER_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      'A tesztadatbázis migrációja nem sikerült – fut a PostgreSQL-konténer (docker compose up -d)?\n' +
        maskPassword(result.stderr || String(result.error ?? ''), databaseUrl),
    );
  }
}

export default function setup(project: TestProject): void {
  const databaseUrl = readTestDatabaseUrl();
  migrate(databaseUrl);
  project.provide('testDatabaseUrl', databaseUrl);
}
