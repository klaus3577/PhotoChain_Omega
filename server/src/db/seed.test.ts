import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EnvValidationError } from '../config/env.js';
import { CATEGORIES, DEMO_USERS, parseSeedEnv } from './seed.js';

const VALID = {
  DATABASE_URL: 'postgresql://felhasznalo:jelszo@localhost:5432/photochain',
  SEED_ADMIN_EMAIL: 'admin@photochain.test',
  SEED_ADMIN_PASSWORD: 'admin-jelszo-123',
  SEED_DEMO_PASSWORD: 'demo-jelszo-123',
};

// L08-ból halasztva (L32): a seed nem futhat véletlenül a távoli (éles) adatbázison
describe('parseSeedEnv – távoli adatbázis (L32)', () => {
  const REMOTE = {
    ...VALID,
    DATABASE_URL: 'postgresql://f:j@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
  };

  it('távoli adatbázison csak kifejezett jóváhagyással (SEED_ALLOW_REMOTE_DATABASE=true) fut', () => {
    expect(() => parseSeedEnv(REMOTE)).toThrow(/SEED_ALLOW_REMOTE_DATABASE/);
    expect(() => parseSeedEnv({ ...REMOTE, SEED_ALLOW_REMOTE_DATABASE: 'igen' })).toThrow(
      /SEED_ALLOW_REMOTE_DATABASE/,
    );
    expect(parseSeedEnv({ ...REMOTE, SEED_ALLOW_REMOTE_DATABASE: 'true' }).databaseUrl).toBe(
      REMOTE.DATABASE_URL,
    );
  });

  // L32 kódátnézés: az érvénytelen URL ne nyers TypeError-ral (benne a jelszóval) bukjon el
  it('az érvénytelen DATABASE_URL-t értékek nélküli hibával utasítja el', () => {
    for (const url of ['nem-url', 'postgresql://f:pa/ss-TITOK@aws-0.pooler.supabase.com:5432/db']) {
      const run = () => parseSeedEnv({ ...VALID, DATABASE_URL: url });
      expect(run).toThrow(EnvValidationError);
      expect(run).not.toThrow(/TITOK/);
    }
  });

  it('a helyi gépen és a Compose belső hálózatán (db) jóváhagyás nélkül is fut', () => {
    for (const host of ['localhost', '127.0.0.1', 'db']) {
      const url = `postgresql://f:j@${host}:5432/photochain`;
      expect(parseSeedEnv({ ...VALID, DATABASE_URL: url }).databaseUrl).toBe(url);
    }
  });

  it('az adatbázis TLS-tanúsítványát (DATABASE_SSL_CA_FILE) a szerverrel azonosan kezeli', () => {
    const directory = mkdtempSync(join(tmpdir(), 'photochain-seed-ca-'));
    const caFile = join(directory, 'ca.crt');
    writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nhamis\n-----END CERTIFICATE-----\n');
    try {
      const remote = { ...REMOTE, SEED_ALLOW_REMOTE_DATABASE: 'true' };
      expect(parseSeedEnv({ ...remote, DATABASE_SSL_CA_FILE: caFile }).sslCaFile).toBe(caFile);
      expect(parseSeedEnv(VALID).sslCaFile).toBeUndefined();
      expect(() =>
        parseSeedEnv({ ...remote, DATABASE_SSL_CA_FILE: join(directory, 'nincs.crt') }),
      ).toThrow(/DATABASE_SSL_CA_FILE/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('parseSeedEnv', () => {
  it('érvényes környezetből a seed beállításait adja', () => {
    expect(parseSeedEnv(VALID)).toEqual({
      databaseUrl: VALID.DATABASE_URL,
      adminEmail: VALID.SEED_ADMIN_EMAIL,
      adminPassword: VALID.SEED_ADMIN_PASSWORD,
      demoPassword: VALID.SEED_DEMO_PASSWORD,
    });
  });

  it('hiányzó jelszónál hibát dob a változó nevével', () => {
    expect(() => parseSeedEnv({ ...VALID, SEED_ADMIN_PASSWORD: undefined })).toThrow(
      EnvValidationError,
    );
    expect(() => parseSeedEnv({ ...VALID, SEED_DEMO_PASSWORD: undefined })).toThrow(
      /SEED_DEMO_PASSWORD/,
    );
  });

  it('8 karakternél rövidebb jelszót és hibás e-mail-címet elutasít', () => {
    expect(() => parseSeedEnv({ ...VALID, SEED_ADMIN_PASSWORD: 'rovid' })).toThrow(
      /SEED_ADMIN_PASSWORD/,
    );
    expect(() => parseSeedEnv({ ...VALID, SEED_ADMIN_EMAIL: 'nem-email' })).toThrow(
      /SEED_ADMIN_EMAIL/,
    );
  });

  it('az adminisztrátor e-mail-címét ugyanúgy normalizálja, mint a regisztráció', () => {
    const config = parseSeedEnv({ ...VALID, SEED_ADMIN_EMAIL: ' Admin@PhotoChain.TEST ' });

    expect(config.adminEmail).toBe('admin@photochain.test');
  });

  it('a hibaüzenet nem tartalmazza a jelszót', () => {
    expect(() => parseSeedEnv({ ...VALID, SEED_ADMIN_PASSWORD: 'TITOK' })).toThrow(
      EnvValidationError,
    );
    try {
      parseSeedEnv({ ...VALID, SEED_ADMIN_PASSWORD: 'TITOK' });
    } catch (error) {
      expect(String(error)).not.toContain('TITOK');
    }
  });
});

describe('seed-adatok', () => {
  it('a kategóriák neve és URL-barát azonosítója (slug) egyedi', () => {
    const names = CATEGORIES.map((category) => category.name);
    const slugs = CATEGORIES.map((category) => category.slug);

    expect(CATEGORIES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('két demó felhasználó van, a nem létező .test tartományban', () => {
    expect(DEMO_USERS).toHaveLength(2);
    for (const user of DEMO_USERS) expect(user.email).toMatch(/@photochain\.test$/);
  });
});
