// Kezdeti adatok (seed): kategóriák, egy adminisztrátor és két demó felhasználó.
// Idempotens: többször is futtatható – a meglévő rekordokat (slug, illetve e-mail alapján) nem
// duplikálja, a meglévő felhasználók adatait (pl. azóta megváltoztatott jelszavát) nem írja felül.
// A jelszavak környezeti változókból jönnek (server/.env), a kódba és a repóba nem kerülnek.
// Forrás: Prisma ORM v7 – Seeding, https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding
// (adaptálva)
import { z } from 'zod';

import {
  databaseSslCaFileSchema,
  databaseUrlSchema,
  isRemoteDatabaseUrl,
  validateEnv,
} from '../config/env.js';
import type { PrismaClient, Role } from '../generated/prisma/client.js';
import { hashPassword } from '../lib/password.js';
import { emailSchema, newPasswordSchema } from '../modules/auth/auth.schemas.js';

export const CATEGORIES = [
  { name: 'Természet', slug: 'termeszet' },
  { name: 'Városkép', slug: 'varoskep' },
  { name: 'Építészet', slug: 'epiteszet' },
  { name: 'Portré', slug: 'portre' },
  { name: 'Állatok', slug: 'allatok' },
  { name: 'Utazás', slug: 'utazas' },
  { name: 'Étel és ital', slug: 'etel-es-ital' },
  { name: 'Absztrakt', slug: 'absztrakt' },
] as const;

// A .test legfelső szintű tartomány foglalt, valódi e-mail-cím nem tartozhat hozzá (RFC 2606)
export const DEMO_USERS = [
  {
    email: 'fotos@photochain.test',
    displayName: 'Demó Fotós',
    bio: 'Demófiók: fényképeket tölt fel és árul.',
  },
  {
    email: 'vasarlo@photochain.test',
    displayName: 'Demó Vásárló',
    bio: 'Demófiók: fényképeket vásárol és értékel.',
  },
] as const;

const ADMIN_DISPLAY_NAME = 'Adminisztrátor';

// Az e-mail-címre és a jelszóra ugyanazok a szabályok érvényesek, mint a regisztrációnál – így a
// seedelt fiókokkal be is lehet jelentkezni (a bejelentkezés kisbetűsített címre keres)
const seedEnvSchema = z
  .object({
    DATABASE_URL: databaseUrlSchema,
    // Élesben (Supabase) a kapcsolat ellenőrzött TLS-sel megy, mint a szerveré (L32)
    DATABASE_SSL_CA_FILE: databaseSslCaFileSchema.optional(),
    // Távoli (éles) adatbázison csak kifejezett jóváhagyással fut (L08-ból halasztva, L32)
    SEED_ALLOW_REMOTE_DATABASE: z
      .literal('true', { error: 'csak a true érték hagyja jóvá a futást távoli adatbázison' })
      .optional(),
    SEED_ADMIN_EMAIL: emailSchema,
    SEED_ADMIN_PASSWORD: newPasswordSchema,
    SEED_DEMO_PASSWORD: newPasswordSchema,
  })
  .superRefine((env, context) => {
    if (isRemoteDatabaseUrl(env.DATABASE_URL) && env.SEED_ALLOW_REMOTE_DATABASE !== 'true') {
      context.addIssue({
        code: 'custom',
        path: ['SEED_ALLOW_REMOTE_DATABASE'],
        message:
          'a DATABASE_URL távoli adatbázis – a seed csak SEED_ALLOW_REMOTE_DATABASE=true mellett fut',
      });
    }
  });

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  /** A két demó felhasználó közös jelszava */
  demoPassword: string;
}

export interface SeedConfig extends SeedOptions {
  databaseUrl: string;
  /** Az adatbázis TLS-tanúsítványát aláíró CA (DATABASE_SSL_CA_FILE) */
  sslCaFile?: string;
}

export interface SeedSummary {
  categories: number;
  users: number;
}

/** A seed beállításai a környezeti változókból (hibánál `EnvValidationError`, érték nélkül). */
export function parseSeedEnv(source: Record<string, string | undefined>): SeedConfig {
  const env = validateEnv(seedEnvSchema, source);
  return {
    databaseUrl: env.DATABASE_URL,
    ...(env.DATABASE_SSL_CA_FILE ? { sslCaFile: env.DATABASE_SSL_CA_FILE } : {}),
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    demoPassword: env.SEED_DEMO_PASSWORD,
  };
}

interface SeedAccount {
  email: string;
  displayName: string;
  bio?: string;
  role: Role;
  password: string;
}

export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedOptions,
): Promise<SeedSummary> {
  // Egymás után, hogy az azonosítók a lista sorrendjét kövessék
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }

  const accounts: SeedAccount[] = [
    {
      email: options.adminEmail,
      displayName: ADMIN_DISPLAY_NAME,
      role: 'ADMIN',
      password: options.adminPassword,
    },
    ...DEMO_USERS.map((user) => ({
      ...user,
      role: 'USER' as const,
      password: options.demoPassword,
    })),
  ];
  for (const { password, ...user } of accounts) {
    // Minden felhasználó saját (véletlen sós) hash-t kap, akkor is, ha a jelszavuk azonos
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  return { categories: CATEGORIES.length, users: accounts.length };
}
