// A Prisma-kliens létrehozása és az adatbázis-kapcsolat ellenőrzése.
// A Prisma 7-ben a kliens driver-adapteren keresztül éri el az adatbázist; PostgreSQL-hez ez a
// node-postgres (pg) alapú @prisma/adapter-pg, saját kapcsolatkészlettel (pool). Ezért folyamatonként
// egy kliens kell: a szervernél a server.ts hozza létre és adja tovább, a seed és a tesztek a sajátjukat.
// Forrás: Prisma ORM v7 – Upgrade guide (driver adapters),
// https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7 (adaptálva)
import { readFileSync } from 'node:fs';

import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** A Prisma hibakódja az egyedi megszorítás megsértésére */
const UNIQUE_VIOLATION = 'P2002';

/** Igaz, ha a hiba egyedi megszorítás (pl. users.email, photos.sha256) megsértése. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

/**
 * Ennyi ideig vár egy új adatbázis-kapcsolat felépülésére. A node-postgres alapból korlátlanul
 * vár: egy nem válaszoló gépnél (tűzfal, leállított szerver) a szerver hibaüzenet nélkül lógna.
 */
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;

export interface PrismaClientOptions {
  connectionTimeoutMs?: number;
  /** A kiszolgáló tanúsítványát aláíró CA PEM-fájlja (L32, DATABASE_SSL_CA_FILE) */
  sslCaFile?: string;
}

/** A node-postgres kapcsolatkészletének beállítása (a driver-adapter ezt kapja meg). */
export interface PoolConfig {
  connectionString: string;
  connectionTimeoutMillis: number;
  ssl?: { ca: string; rejectUnauthorized: true };
}

/**
 * A kapcsolatkészlet beállítása. CA-tanúsítvánnyal a kapcsolat titkosított, és a kiszolgáló
 * tanúsítványát (a gépnevével együtt) ehhez a CA-hoz ellenőrizzük (L32). Ilyenkor az URL-ben nem
 * lehet ssl-paraméter: a node-postgres azzal felülírná a beállítást (ezt az env.ts ellenőrzi).
 * Forrás: node-postgres – SSL, https://node-postgres.com/features/ssl; Supabase – Postgres SSL
 * Enforcement, https://supabase.com/docs/guides/platform/ssl-enforcement (adaptálva)
 */
export function poolConfig(
  databaseUrl: string,
  { connectionTimeoutMs, sslCa }: { connectionTimeoutMs: number; sslCa?: string },
): PoolConfig {
  return {
    connectionString: databaseUrl,
    connectionTimeoutMillis: connectionTimeoutMs,
    ...(sslCa === undefined ? {} : { ssl: { ca: sslCa, rejectUnauthorized: true } }),
  };
}

export function createPrismaClient(
  databaseUrl: string,
  { connectionTimeoutMs = DEFAULT_CONNECTION_TIMEOUT_MS, sslCaFile }: PrismaClientOptions = {},
): PrismaClient {
  const sslCa = sslCaFile === undefined ? undefined : readFileSync(sslCaFile, 'utf8');
  const adapter = new PrismaPg(poolConfig(databaseUrl, { connectionTimeoutMs, sslCa }));
  return new PrismaClient({ adapter });
}

/**
 * A kapcsolódási hiba rövid oka, kapcsolati adatok nélkül – sorrendben: a driver-adapter hibafajtája
 * (pl. AuthenticationFailed), a hálózati hibakód (pl. ECONNREFUSED), végül az egysoros hibaüzenet
 * (pl. időtúllépés). A Prisma saját üzenete ilyenkor többsoros és semmitmondó („Invalid
 * `prisma.$queryRaw()` invocation”), ezért azt nem írjuk ki; ahogy olyan üzenetet sem, amelyben
 * kapcsolati URL (és így jelszó) szerepelhet.
 */
function describeCause(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const { code, meta } = cause as { code?: unknown; meta?: { driverAdapterError?: unknown } };
  if (meta?.driverAdapterError instanceof Error) return meta.driverAdapterError.message;
  if (typeof code === 'string') return code;
  if (!(cause instanceof Error)) return undefined;
  const { message } = cause;
  const isSafeOneLiner = message !== '' && !message.includes('\n') && !message.includes('://');
  return isSafeOneLiner ? message : undefined;
}

/** Az adatbázis nem érhető el (nem fut, rossz a cím vagy a hozzáférési adat). */
export class DatabaseConnectionError extends Error {
  constructor(options: ErrorOptions) {
    const reason = describeCause(options.cause);
    super(
      'Az adatbázis nem érhető el – fut a PostgreSQL-konténer (docker compose up -d), ' +
        `és helyes a DATABASE_URL?${reason ? ` (${reason})` : ''}`,
      options,
    );
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Egy egyszerű lekérdezéssel ellenőrzi a kapcsolatot (a kapcsolatkészlet csak az első lekérdezéskor
 * csatlakozik) – így a szerver induláskor, és nem az első kérésnél derül ki, ha nincs adatbázis.
 */
export async function verifyDatabaseConnection(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new DatabaseConnectionError({ cause: error });
  }
}
