// A tárhely kiválasztása a konfigurációból (L32): fejlesztéskor a helyi lemez (a nyilvános mappát
// az Express szolgálja ki), élesben a Supabase Storage (a /media útvonalat a szerver adja tovább).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseEnv } from '../../config/env.js';
import { localPublicDirectory } from './local.storage.js';
import { createStorageFromEnv } from './storageFromEnv.js';

const VALID = {
  DATABASE_URL: 'postgresql://felhasznalo:jelszo@localhost:5432/photochain',
  RPC_URL: 'https://eth-sepolia.g.alchemy.com/v2/hamis',
  PLATFORM_PRIVATE_KEY: `0x${'ab'.repeat(32)}`,
  STRIPE_SECRET_KEY: 'sk_test_hamis',
  STRIPE_WEBHOOK_SECRET: 'whsec_hamisWebhookTitok0123456789',
  JWT_SECRET: 'hamis-jwt-titok-legalabb-32-karakter',
};

let uploadDir: string | undefined;

afterEach(() => {
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  uploadDir = undefined;
});

describe('createStorageFromEnv (L32)', () => {
  it('alapból a helyi lemez, a nyilvános mappájával; az ellenőrzés nem fordul hálózathoz', async () => {
    uploadDir = mkdtempSync(join(tmpdir(), 'photochain-storage-'));

    const selected = createStorageFromEnv(parseEnv({ ...VALID, UPLOAD_DIR: uploadDir }));

    expect(selected.description).toBe('helyi lemez');
    expect(selected.publicUploadsDirectory).toBe(localPublicDirectory(uploadDir));
    await expect(selected.checkReady()).resolves.toBeUndefined();
  });

  it('Supabase-nél nincs helyi nyilvános mappa (a /media útvonalat a szerver adja tovább)', () => {
    const selected = createStorageFromEnv(
      parseEnv({
        ...VALID,
        STORAGE_DRIVER: 'supabase',
        SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_hamisSupabaseKulcs0123456789',
      }),
    );

    expect(selected.description).toBe('Supabase Storage (originals, previews)');
    expect(selected.publicUploadsDirectory).toBeUndefined();
    expect(selected.storage.publicUrl('previews/3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60.jpg')).toBe(
      '/media/previews/3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60.jpg',
    );
  });

  it('Supabase-nél induláskor a bucketeket ellenőrzi (a nyilvános bucket hiba)', async () => {
    const buckets: Record<string, boolean> = { originals: false, previews: true };
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const id = new URL(input instanceof Request ? input.url : String(input)).pathname
        .split('/')
        .at(-1);
      return new Response(JSON.stringify({ id, name: id, public: buckets[id ?? ''] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    try {
      const selected = createStorageFromEnv(
        parseEnv({
          ...VALID,
          STORAGE_DRIVER: 'supabase',
          SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
          SUPABASE_SECRET_KEY: 'sb_secret_hamisSupabaseKulcs0123456789',
        }),
      );

      await expect(selected.checkReady()).rejects.toThrow(/previews.*nyilvános/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a hiányos Supabase-beállítást (amit az env.ts már elutasít) itt is hibának veszi', () => {
    const local = parseEnv(VALID);

    expect(() => createStorageFromEnv({ ...local, STORAGE_DRIVER: 'supabase' })).toThrow(
      /SUPABASE_URL/,
    );
  });
});
