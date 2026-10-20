// Az élesítési parancsok segédfüggvényei (L32): a migrációt és a seedet a saját gépről futtatjuk a
// Supabase adatbázisán (a Render ingyenes csomagjában nincs migrációs lépés és parancssor).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadProductionEnv, prismaCliDatabaseUrl } from './production.js';

const POOLER_URL =
  'postgresql://prisma.abc:jelszo@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

let directory: string | undefined;

afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function envFile(content: string): string {
  directory = mkdtempSync(join(tmpdir(), 'photochain-production-'));
  const path = join(directory, '.env.production');
  writeFileSync(path, content);
  return path;
}

describe('loadProductionEnv (L32)', () => {
  it('csak az éles fájl változóit adja – a fejlesztői .env nem keveredhet bele', () => {
    const path = envFile(`DATABASE_URL=${POOLER_URL}\nSEED_ADMIN_EMAIL=admin@photochain.test\n`);

    expect(loadProductionEnv(path, ['DATABASE_URL'])).toEqual({
      DATABASE_URL: POOLER_URL,
      SEED_ADMIN_EMAIL: 'admin@photochain.test',
    });
  });

  it('a hiányzó vagy üres kötelező változókat a nevükkel jelzi, értékek nélkül', () => {
    const path = envFile(`DATABASE_URL=${POOLER_URL}\nSEED_ADMIN_PASSWORD=\n`);

    const run = () =>
      loadProductionEnv(path, ['DATABASE_URL', 'SEED_ADMIN_PASSWORD', 'SEED_DEMO_PASSWORD']);

    expect(run).toThrow(/SEED_ADMIN_PASSWORD, SEED_DEMO_PASSWORD/);
    expect(run).not.toThrow(/jelszo/);
  });

  it('ha nincs ilyen fájl, a mintára utal', () => {
    directory = mkdtempSync(join(tmpdir(), 'photochain-production-'));

    expect(() => loadProductionEnv(join(directory ?? '', '.env.production'), [])).toThrow(
      /\.env\.production\.example/,
    );
  });
});

describe('prismaCliDatabaseUrl (L32)', () => {
  // L32 kódátnézés: a hibaüzenet (a terminálban, képernyőképen) ne tartalmazza a jelszót
  it('az érvénytelen URL-t értékek nélküli hibával utasítja el', () => {
    const run = () =>
      prismaCliDatabaseUrl(
        'postgresql://f:pa/ss-TITOK@aws-0.pooler.supabase.com:5432/db',
        'ca.crt',
      );

    expect(run).toThrow(/DATABASE_URL/);
    expect(run).not.toThrow(/TITOK/);
  });

  it('a Prisma CLI kapcsolata TLS-t kér, a megadott CA-tanúsítvánnyal (abszolút útvonal)', () => {
    const url = new URL(prismaCliDatabaseUrl(POOLER_URL, 'certs/supabase-prod-ca-2021.crt'));

    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('sslcert')).toMatch(/certs\/supabase-prod-ca-2021\.crt$/);
    expect(url.searchParams.get('sslcert')).not.toContain('\\');
    expect(url.searchParams.get('sslaccept')).toBe('strict');
    // A felhasználó, a jelszó, a gép és az adatbázis nem változik
    expect(`${url.protocol}//${url.username}:${url.password}@${url.host}${url.pathname}`).toBe(
      POOLER_URL,
    );
  });
});
