// Tesztsegédek: érvényes (de hamis, nem titkos) konfiguráció és egy ebből felépített alkalmazás.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Express } from 'express';

import { createApp } from '../../src/app.js';
import type { Env } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { signSessionToken } from '../../src/lib/jwt.js';
import { createLogger } from '../../src/lib/logger.js';
import { createPrismaClient } from '../../src/lib/prisma.js';
import { SESSION_COOKIE_NAME } from '../../src/lib/sessionCookie.js';
import {
  createPhotoRegistration,
  type PhotoRegistration,
} from '../../src/modules/photos/photos.registration.js';
import type { PaymentService } from '../../src/services/payment.service.js';
import {
  createLocalStorage,
  localPublicDirectory,
} from '../../src/services/storage/local.storage.js';
import type { StorageService } from '../../src/services/storage/storage.types.js';
import { createFakeBlockchain, type FakeBlockchain } from './fakeBlockchain.js';
import { createFakePayments } from './fakePayments.js';

export const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  LOG_LEVEL: 'silent',
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 1000,
  AUTH_RATE_LIMIT_MAX: 1000,
  LOGIN_ACCOUNT_RATE_LIMIT_MAX: 1000,
  DHASH_THRESHOLD: 10,
  UPLOAD_DIR: join(tmpdir(), 'photochain-test-uploads'),
  UPLOAD_MAX_BYTES: 15 * 1024 * 1024,
  UPLOAD_MAX_CONCURRENT: 4,
  UPLOAD_RATE_LIMIT_MAX: 1000,
  UPLOAD_DAILY_LIMIT: 1000,
  UPLOAD_GLOBAL_DAILY_LIMIT: 10_000,
  UPLOAD_BODY_TIMEOUT_MS: 120_000,
  VERIFY_RATE_LIMIT_MAX: 1000,
  VERIFY_CHAIN_READ_LIMIT: 1000,
  VERIFY_MAX_CONCURRENT: 4,
  VERIFY_BODY_TIMEOUT_MS: 30_000,
  JWT_SECRET: 'hamis-teszt-jwt-titok-nem-valodi-kulcs',
  DATABASE_URL: 'postgresql://teszt:teszt@localhost:5432/photochain_test',
  RPC_URL: 'http://127.0.0.1:8545',
  PLATFORM_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  CHAIN_ID: 31_337,
  CHAIN_MAX_FEE_GWEI: 50,
  STRIPE_SECRET_KEY: 'sk_test_hamis_tesztkulcs',
  STRIPE_WEBHOOK_SECRET: 'whsec_hamisTesztTitokNemValodi0123456789',
  APP_BASE_URL: 'http://localhost:5173',
  CHECKOUT_RATE_LIMIT_MAX: 1000,
  CHAIN_RETRY_RATE_LIMIT_MAX: 1000,
  STORAGE_DRIVER: 'local',
  STORAGE_TIMEOUT_MS: 20_000,
  SUPABASE_ORIGINALS_BUCKET: 'originals',
  SUPABASE_PREVIEWS_BUCKET: 'previews',
  IMAGE_MAX_MEGAPIXELS: 50,
  IMAGE_PROCESSING_CONCURRENCY: 4,
  MEDIA_RATE_LIMIT_MAX: 1000,
};

/** Érvényes formájú azonosító, amelyhez nem tartozik felhasználó. */
export const UNKNOWN_USER_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';

/** A kérés Cookie fejléce a megadott (akár érvénytelen) munkamenet-tokennel. */
export const sessionCookieHeader = (token: string): string => `${SESSION_COOKIE_NAME}=${token}`;

/** A kérés Cookie fejléce a felhasználó érvényes, a tesztkulccsal aláírt munkamenet-tokenjével. */
export const sessionCookieFor = (userId: string): string =>
  sessionCookieHeader(signSessionToken(userId, TEST_ENV.JWT_SECRET));

/**
 * A blokklánc utánzata és a rá épülő (valódi) lánc-regisztráció. Ezen keresztül várhatják meg a
 * tesztek a háttérben futó regisztrációt (`photoRegistration.whenIdle()`), és így adhatnak lánchibát.
 */
export interface TestChain extends FakeBlockchain {
  photoRegistration: PhotoRegistration;
}

export function createTestChain(prisma: PrismaClient): TestChain {
  const fake = createFakeBlockchain();
  const photoRegistration = createPhotoRegistration({
    prisma,
    blockchain: fake.blockchain,
    logger: createLogger(TEST_ENV),
  });
  return { ...fake, photoRegistration };
}

/**
 * Az adatbázis-tesztek a tesztadatbázis kliensét adják át. Enélkül a kliens sosem kapcsolódik
 * (a kapcsolat csak az első lekérdezéskor épülne fel) – az adatbázis nélküli végponttesztekhez.
 * Lánc nélkül a blokklánc egy új, hibátlanul működő utánzata; fizetési szolgáltatás nélkül a Stripe
 * egy új utánzata (a valódi Stripe-ot a tesztek nem hívják).
 */
export function createTestApp(
  overrides: Partial<Env> = {},
  prisma?: PrismaClient,
  chain?: TestChain,
  payments: PaymentService = createFakePayments().payments,
): Express {
  const env = { ...TEST_ENV, ...overrides };
  const client = prisma ?? createPrismaClient(env.DATABASE_URL);
  const { blockchain, photoRegistration } = chain ?? createTestChain(client);
  return createApp({
    env,
    logger: createLogger(env),
    prisma: client,
    storage: createLocalStorage(env.UPLOAD_DIR),
    publicUploadsDirectory: localPublicDirectory(env.UPLOAD_DIR),
    blockchain,
    photoRegistration,
    payments,
  });
}

/**
 * Távoli tárhellyel (pl. Supabase Storage, L32) összeállított alkalmazás, adatbázis nélkül: ilyenkor
 * nincs helyi nyilvános mappa, a /media útvonalat a szerver a tárhelyről szolgálja ki.
 */
export function createTestAppWithStorage(
  storage: StorageService,
  overrides: Partial<Env> = {},
): Express {
  const env = { ...TEST_ENV, ...overrides };
  const prisma = createPrismaClient(env.DATABASE_URL);
  const { blockchain, photoRegistration } = createTestChain(prisma);
  return createApp({
    env,
    logger: createLogger(env),
    prisma,
    storage,
    blockchain,
    photoRegistration,
    payments: createFakePayments().payments,
  });
}
