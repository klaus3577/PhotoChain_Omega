// Az E2E-környezet állandói (útvonalak, portok, címek) és a szerver .env-jének beolvasása – csak az
// a két adat kell belőle, hogy melyik a tesztadatbázis, és mi a Stripe-tesztkulcs (az elfogadását a
// stripeKey.ts ellenőrzi); értéket egyik sem ír ki. A többi beállítást (JWT-titok, webhook-titok, a lánc kulcsa) a környezet maga
// állítja elő, eldobható értékekkel.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const E2E_DIR = resolve(ROOT, 'e2e');
export const SERVER_DIR = resolve(ROOT, 'server');
export const CLIENT_DIR = resolve(ROOT, 'client');
export const BLOCKCHAIN_DIR = resolve(ROOT, 'blockchain');
/** A szerző saját tesztfotói (a szerver tesztfixtúrái) */
export const FIXTURES_DIR = resolve(SERVER_DIR, 'tests', 'fixtures', 'images');
/** A futás naplói (a gyökér .gitignore a logs/ mappákat kihagyja) */
export const LOG_DIR = resolve(E2E_DIR, 'logs');

export const SERVER_PORT = 4000;
export const CLIENT_PORT = 4173;
export const CHAIN_PORT = 8545;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
export const CHAIN_URL = `http://127.0.0.1:${CHAIN_PORT}`;

/** A tesztek számára a globalSetup által beállított környezeti változók nevei */
export const ENV_KEYS = {
  webhookSecret: 'E2E_STRIPE_WEBHOOK_SECRET',
  stripe: 'E2E_STRIPE',
  /** Ha a vásárlás forgatókönyve kimarad, annak oka (stripeKey.ts STRIPE_SKIP_REASONS) */
  stripeSkipReason: 'E2E_STRIPE_SKIP_REASON',
  adminEmail: 'E2E_ADMIN_EMAIL',
  adminPassword: 'E2E_ADMIN_PASSWORD',
} as const;

/** A tesztadatbázis csak a saját gépen (vagy a CI szolgáltatás-konténerében) lehet */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A globalSetup által beállított változó értéke; érthető hibával, ha a környezet nem épült fel. */
export function requiredEnv(key: (typeof ENV_KEYS)[keyof typeof ENV_KEYS]): string {
  const value = process.env[key];
  if (!value) throw new Error(`A(z) ${key} hiányzik: a globalSetup nem futott le`);
  return value;
}

export interface ServerEnvSummary {
  testDatabaseUrl: string;
  /** A szerver .env-jének (vagy a környezetnek) Stripe-tesztkulcsa – csak az ellenőrzéséhez (stripeKey.ts) */
  stripeKey: string | undefined;
}

/**
 * A szerver .env-jéből a tesztadatbázis URL-je (a környezeti változó elsőbbséget élvez – a CI így adja
 * meg) és a Stripe-kulcs. A név „_test” végű kell legyen, mert a futás kiüríti az adatbázist.
 */
export function readServerEnv(): ServerEnvSummary {
  const envFile = resolve(SERVER_DIR, '.env');
  const fileEnv: Record<string, string | undefined> = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8'))
    : {};
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error(
      'A TEST_DATABASE_URL nincs beállítva (server/.env – lásd server/.env.example): az E2E-tesztek a tesztadatbázist használják',
    );
  }
  if (!URL.canParse(testDatabaseUrl)) {
    throw new Error(
      'A TEST_DATABASE_URL nem érvényes URL (az értékét a jelszó miatt nem írjuk ki)',
    );
  }
  const databaseUrl = new URL(testDatabaseUrl);
  if (!LOOPBACK_HOSTS.has(databaseUrl.hostname)) {
    throw new Error(
      `A tesztadatbázis csak helyi (localhost) címen lehet (most: „${databaseUrl.hostname}”), mert az E2E-futás kiüríti`,
    );
  }
  const databaseName = databaseUrl.pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `A tesztadatbázis neve „_test” végű kell legyen (most: „${databaseName}”), mert az E2E-futás kiüríti`,
    );
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? fileEnv.STRIPE_SECRET_KEY;
  return { testDatabaseUrl, stripeKey };
}
