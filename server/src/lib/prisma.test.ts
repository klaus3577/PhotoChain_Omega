import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, DatabaseConnectionError, poolConfig } from './prisma.js';

const URL = 'postgresql://felhasznalo:jelszo@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';
const CA = '-----BEGIN CERTIFICATE-----\nhamis\n-----END CERTIFICATE-----\n';

// L32: a távoli (Supabase) adatbázis kapcsolata titkosított, és a kiszolgáló tanúsítványát a
// megadott CA-hoz ellenőrizzük – a node-postgres alapból a rendszer CA-listáját használná
describe('poolConfig', () => {
  it('tanúsítvány nélkül titkosítás nélküli kapcsolat (helyi fejlesztés, Compose), időkorláttal', () => {
    expect(poolConfig(URL, { connectionTimeoutMs: 5000 })).toEqual({
      connectionString: URL,
      connectionTimeoutMillis: 5000,
    });
  });

  it('a klienst a CA-fájl tartalmával hozza létre (kapcsolódni csak az első lekérdezéskor fog)', () => {
    const directory = mkdtempSync(join(tmpdir(), 'photochain-prisma-ca-'));
    const caFile = join(directory, 'ca.crt');
    writeFileSync(caFile, CA);
    try {
      // (A kliens proxy: a Vitest nem tudja kiírni, és az instanceof sem használható rá)
      expect(typeof createPrismaClient(URL, { sslCaFile: caFile }).$disconnect).toBe('function');
      expect(() => createPrismaClient(URL, { sslCaFile: join(directory, 'nincs.crt') })).toThrow(
        /ENOENT/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('a megadott CA-val ellenőrzött TLS-kapcsolat (az érvénytelen tanúsítványt elutasítja)', () => {
    expect(poolConfig(URL, { connectionTimeoutMs: 5000, sslCa: CA })).toEqual({
      connectionString: URL,
      connectionTimeoutMillis: 5000,
      ssl: { ca: CA, rejectUnauthorized: true },
    });
  });
});

// A kapcsolódás valódi adatbázissal: tests/db/prisma.test.ts
describe('DatabaseConnectionError', () => {
  it('a driver-adapter hibafajtáját írja ki okként', () => {
    const cause = { meta: { driverAdapterError: new Error('AuthenticationFailed') } };

    expect(new DatabaseConnectionError({ cause }).message).toMatch(/\(AuthenticationFailed\)$/);
  });

  it('adapter-hiba nélkül a hálózati hibakódot írja ki', () => {
    const cause = { code: 'ECONNREFUSED' };

    expect(new DatabaseConnectionError({ cause }).message).toMatch(/\(ECONNREFUSED\)$/);
  });

  it('kód nélküli hibánál az egysoros hibaüzenetet írja ki (pl. időtúllépés)', () => {
    const cause = new Error('Connection terminated due to connection timeout');

    expect(new DatabaseConnectionError({ cause }).message).toMatch(
      /\(Connection terminated due to connection timeout\)$/,
    );
  });

  it('többsoros vagy kapcsolati URL-t tartalmazó üzenetet nem ír ki', () => {
    const multiline = new Error('\nInvalid `prisma.$queryRaw()` invocation:\n\n');
    const withUrl = new Error('cannot connect to postgresql://felhasznalo:TITOK@gep:5432/db');

    for (const cause of [multiline, withUrl]) {
      const { message } = new DatabaseConnectionError({ cause });

      expect(message).toMatch(/DATABASE_URL\?$/);
      expect(message).not.toContain('TITOK');
    }
  });

  it('ismeretlen ok esetén csak az általános üzenetet adja', () => {
    for (const cause of [undefined, 'szöveges hiba', { code: 42 }]) {
      const error = new DatabaseConnectionError({ cause });

      expect(error.name).toBe('DatabaseConnectionError');
      expect(error.message).toMatch(/nem érhető el.*DATABASE_URL\?$/);
    }
  });
});
