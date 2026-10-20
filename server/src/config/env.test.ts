import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_DHASH_THRESHOLD } from '../services/hashing.service.js';
import {
  configWarnings,
  EnvValidationError,
  loadEnv,
  parseEnv,
  sensitiveValues,
  trustedProxyHops,
} from './env.js';

const VALID = {
  DATABASE_URL: 'postgresql://felhasznalo:jelszo@localhost:5432/photochain',
  RPC_URL: 'https://eth-sepolia.g.alchemy.com/v2/hamis',
  PLATFORM_PRIVATE_KEY: `0x${'ab'.repeat(32)}`,
  STRIPE_SECRET_KEY: 'sk_test_hamis',
  STRIPE_WEBHOOK_SECRET: 'whsec_hamisWebhookTitok0123456789',
  JWT_SECRET: 'hamis-jwt-titok-legalabb-32-karakter',
};

describe('parseEnv', () => {
  it('érvényes környezetből a konfigurációt adja, alapértékekkel kiegészítve', () => {
    const env = parseEnv(VALID);

    expect(env).toEqual({
      ...VALID,
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      RATE_LIMIT_WINDOW_MS: 900_000,
      RATE_LIMIT_MAX: 300,
      AUTH_RATE_LIMIT_MAX: 20,
      LOGIN_ACCOUNT_RATE_LIMIT_MAX: 10,
      DHASH_THRESHOLD: 10,
      UPLOAD_DIR: expect.stringMatching(/server[\\/]uploads$/),
      UPLOAD_MAX_BYTES: 15 * 1024 * 1024,
      UPLOAD_MAX_CONCURRENT: 4,
      UPLOAD_RATE_LIMIT_MAX: 30,
      UPLOAD_DAILY_LIMIT: 30,
      UPLOAD_GLOBAL_DAILY_LIMIT: 500,
      UPLOAD_BODY_TIMEOUT_MS: 150_000,
      VERIFY_RATE_LIMIT_MAX: 20,
      VERIFY_CHAIN_READ_LIMIT: 200,
      VERIFY_MAX_CONCURRENT: 2,
      VERIFY_BODY_TIMEOUT_MS: 30_000,
      CHAIN_ID: 11_155_111,
      CHAIN_MAX_FEE_GWEI: 50,
      APP_BASE_URL: 'http://localhost:5173',
      CHECKOUT_RATE_LIMIT_MAX: 20,
      CHAIN_RETRY_RATE_LIMIT_MAX: 10,
      STORAGE_DRIVER: 'local',
      STORAGE_TIMEOUT_MS: 20_000,
      SUPABASE_ORIGINALS_BUCKET: 'originals',
      SUPABASE_PREVIEWS_BUCKET: 'previews',
      IMAGE_MAX_MEGAPIXELS: 50,
      IMAGE_PROCESSING_CONCURRENCY: 4,
      MEDIA_RATE_LIMIT_MAX: 600,
    });
  });

  it('a blokklánc-hálózat csak a Sepolia (alapértelmezés) vagy a lokális Hardhat-hálózat lehet', () => {
    expect(parseEnv({ ...VALID, CHAIN_ID: '31337' }).CHAIN_ID).toBe(31_337);
    // Valódi pénzt mozgató hálózat (pl. az Ethereum főhálózat, 1) sem engedélyezett
    for (const value of ['1', '0', '-1', '2.5', 'sepolia', '']) {
      expect(() => parseEnv({ ...VALID, CHAIN_ID: value })).toThrow(/CHAIN_ID/);
    }
  });

  it('az RPC-végpont csak https lehet, titkosítatlan http csak a helyi gépen', () => {
    for (const url of ['http://127.0.0.1:8545', 'http://localhost:8545', 'https://rpc.example']) {
      expect(parseEnv({ ...VALID, RPC_URL: url }).RPC_URL).toBe(url);
    }
    for (const url of [
      'http://eth-sepolia.g.alchemy.com/v2/hamis',
      'ftp://127.0.0.1',
      'ws://x',
      'nem-url',
    ]) {
      expect(() => parseEnv({ ...VALID, RPC_URL: url })).toThrow(EnvValidationError);
      expect(() => parseEnv({ ...VALID, RPC_URL: url })).toThrow(/RPC_URL/);
    }
  });

  it('a tranzakciós díj plafonja pozitív egész gwei (legfeljebb 10 000), alapból 50', () => {
    expect(parseEnv(VALID).CHAIN_MAX_FEE_GWEI).toBe(50);
    expect(parseEnv({ ...VALID, CHAIN_MAX_FEE_GWEI: '5' }).CHAIN_MAX_FEE_GWEI).toBe(5);
    for (const value of ['0', '-1', '2.5', 'sok', '', '10001', '1e21']) {
      expect(() => parseEnv({ ...VALID, CHAIN_MAX_FEE_GWEI: value })).toThrow(/CHAIN_MAX_FEE_GWEI/);
    }
  });

  it('a feltöltés korlátjai pozitív egész számok', () => {
    const custom = parseEnv({
      ...VALID,
      UPLOAD_DIR: 'D:/kepek',
      UPLOAD_MAX_BYTES: '1000',
      UPLOAD_MAX_CONCURRENT: '2',
      UPLOAD_RATE_LIMIT_MAX: '5',
      UPLOAD_DAILY_LIMIT: '3',
      UPLOAD_GLOBAL_DAILY_LIMIT: '40',
      UPLOAD_BODY_TIMEOUT_MS: '60000',
    });

    expect(custom).toMatchObject({
      UPLOAD_DIR: 'D:/kepek',
      UPLOAD_MAX_BYTES: 1000,
      UPLOAD_MAX_CONCURRENT: 2,
      UPLOAD_RATE_LIMIT_MAX: 5,
      UPLOAD_DAILY_LIMIT: 3,
      UPLOAD_GLOBAL_DAILY_LIMIT: 40,
      UPLOAD_BODY_TIMEOUT_MS: 60_000,
    });
    for (const name of [
      'UPLOAD_MAX_BYTES',
      'UPLOAD_MAX_CONCURRENT',
      'UPLOAD_RATE_LIMIT_MAX',
      'UPLOAD_DAILY_LIMIT',
      'UPLOAD_GLOBAL_DAILY_LIMIT',
      'UPLOAD_BODY_TIMEOUT_MS',
    ]) {
      for (const value of ['0', '-1', '2.5', 'sok', '']) {
        expect(() => parseEnv({ ...VALID, [name]: value })).toThrow(new RegExp(name));
      }
    }
    expect(() => parseEnv({ ...VALID, UPLOAD_DIR: '' })).toThrow(/UPLOAD_DIR/);
  });

  it('a hitelesség-ellenőrző korlátjai pozitív egész számok', () => {
    const custom = parseEnv({
      ...VALID,
      VERIFY_RATE_LIMIT_MAX: '5',
      VERIFY_CHAIN_READ_LIMIT: '50',
      VERIFY_MAX_CONCURRENT: '1',
      VERIFY_BODY_TIMEOUT_MS: '5000',
    });

    expect(custom).toMatchObject({
      VERIFY_RATE_LIMIT_MAX: 5,
      VERIFY_CHAIN_READ_LIMIT: 50,
      VERIFY_MAX_CONCURRENT: 1,
      VERIFY_BODY_TIMEOUT_MS: 5000,
    });
    for (const name of [
      'VERIFY_RATE_LIMIT_MAX',
      'VERIFY_CHAIN_READ_LIMIT',
      'VERIFY_MAX_CONCURRENT',
      'VERIFY_BODY_TIMEOUT_MS',
    ]) {
      for (const value of ['0', '-1', '2.5', 'sok', '']) {
        expect(() => parseEnv({ ...VALID, [name]: value })).toThrow(new RegExp(name));
      }
    }
  });

  // 2^31 ms fölött a Node az időzítőt 1 ms-ra állítaná – minden ellenőrzés kapcsolatát azonnal bontaná
  it('a fájl beérkezési határideje legfeljebb 10 perc (ellenőrzés és feltöltés)', () => {
    for (const name of ['VERIFY_BODY_TIMEOUT_MS', 'UPLOAD_BODY_TIMEOUT_MS'] as const) {
      expect(parseEnv({ ...VALID, [name]: '600000' })[name]).toBe(600_000);
      for (const value of ['600001', '2147483648']) {
        expect(() => parseEnv({ ...VALID, [name]: value })).toThrow(new RegExp(name));
      }
    }
  });

  it('a számokat szövegből számmá alakítja', () => {
    const env = parseEnv({ ...VALID, PORT: '5000', RATE_LIMIT_MAX: '10' });

    expect(env.PORT).toBe(5000);
    expect(env.RATE_LIMIT_MAX).toBe(10);
  });

  it('hiányzó kötelező változónál hibát dob a változó nevével', () => {
    expect(() => parseEnv({ ...VALID, RPC_URL: undefined })).toThrow(EnvValidationError);
    expect(() => parseEnv({ ...VALID, RPC_URL: undefined })).toThrow(/RPC_URL/);
  });

  it('érvénytelen portszámot elutasít', () => {
    expect(() => parseEnv({ ...VALID, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('hibás formátumú privát kulcsot elutasít', () => {
    expect(() => parseEnv({ ...VALID, PLATFORM_PRIVATE_KEY: '0x1234' })).toThrow(
      /PLATFORM_PRIVATE_KEY/,
    );
  });

  it('éles (sk_live_) Stripe-kulcsot elutasít', () => {
    expect(() => parseEnv({ ...VALID, STRIPE_SECRET_KEY: 'sk_live_hamis' })).toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });

  it('a Stripe-kulcs csak teszt módú titkos kulcs lehet, szóköz és idegen karakter nélkül', () => {
    for (const key of [
      'rk_test_hamis',
      'pk_test_hamis',
      'sk_test_',
      'sk_test_ha mis',
      ' sk_test_x',
    ]) {
      expect(() => parseEnv({ ...VALID, STRIPE_SECRET_KEY: key })).toThrow(/STRIPE_SECRET_KEY/);
    }
    expect(() => parseEnv({ ...VALID, STRIPE_SECRET_KEY: undefined })).toThrow(
      /STRIPE_SECRET_KEY: kötelező/,
    );
  });

  it('a webhook-titok kötelező, és whsec_ előtagú, legalább 24 karakteres véletlen érték', () => {
    // A Stripe CLI (stripe listen) 64 hexadecimális, a Dashboard base64-szerű titkot ad
    for (const secret of [`whsec_${'ab12'.repeat(16)}`, 'whsec_Ab3dEf6hIj9kLm2nOp5qRs8tUv1w']) {
      expect(parseEnv({ ...VALID, STRIPE_WEBHOOK_SECRET: secret }).STRIPE_WEBHOOK_SECRET).toBe(
        secret,
      );
    }
    for (const secret of [
      '',
      'whsec_',
      'whsec_rovid',
      'sk_test_hamis0123456789abcdef',
      `whsec_${'a'.repeat(23)}`,
      `whsec_ ${'a'.repeat(30)}`,
    ]) {
      expect(() => parseEnv({ ...VALID, STRIPE_WEBHOOK_SECRET: secret })).toThrow(
        /STRIPE_WEBHOOK_SECRET/,
      );
    }
    expect(() => parseEnv({ ...VALID, STRIPE_WEBHOOK_SECRET: undefined })).toThrow(
      /STRIPE_WEBHOOK_SECRET: kötelező/,
    );
  });

  it('a kliens címe (APP_BASE_URL) csak eredet lehet (útvonal, lekérdezés és belépési adat nélkül)', () => {
    expect(parseEnv({ ...VALID, APP_BASE_URL: 'https://photochain.example' }).APP_BASE_URL).toBe(
      'https://photochain.example',
    );
    // A záró perjel elhagyható; a cím az eredetre normalizálódik
    expect(parseEnv({ ...VALID, APP_BASE_URL: 'http://127.0.0.1:5173/' }).APP_BASE_URL).toBe(
      'http://127.0.0.1:5173',
    );
    for (const url of [
      'https://photochain.example/app',
      'https://photochain.example/?x=1',
      'https://photochain.example/#reszlet',
      'https://felhasznalo:jelszo@photochain.example',
      'http://photochain.example',
      'ftp://localhost',
      'nem-url',
      '',
    ]) {
      expect(() => parseEnv({ ...VALID, APP_BASE_URL: url })).toThrow(/APP_BASE_URL/);
    }
  });

  it('a fizetés indításának felhasználónkénti korlátja pozitív egész szám, alapból 20', () => {
    expect(parseEnv({ ...VALID, CHECKOUT_RATE_LIMIT_MAX: '5' }).CHECKOUT_RATE_LIMIT_MAX).toBe(5);
    for (const value of ['0', '-1', '2.5', 'sok']) {
      expect(() => parseEnv({ ...VALID, CHECKOUT_RATE_LIMIT_MAX: value })).toThrow(
        /CHECKOUT_RATE_LIMIT_MAX/,
      );
    }
  });

  it('a lánc-regisztráció újrapróbálásának adminonkénti korlátja pozitív egész szám, alapból 10', () => {
    expect(parseEnv({ ...VALID, CHAIN_RETRY_RATE_LIMIT_MAX: '3' }).CHAIN_RETRY_RATE_LIMIT_MAX).toBe(
      3,
    );
    for (const value of ['0', '-1', '2.5', 'sok']) {
      expect(() => parseEnv({ ...VALID, CHAIN_RETRY_RATE_LIMIT_MAX: value })).toThrow(
        /CHAIN_RETRY_RATE_LIMIT_MAX/,
      );
    }
  });

  it('hiányzó adatbázis-URL-nél hibát dob a változó nevével', () => {
    expect(() => parseEnv({ ...VALID, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('csak PostgreSQL-kapcsolati URL-t fogad el', () => {
    expect(() => parseEnv({ ...VALID, DATABASE_URL: 'mysql://u:p@localhost:3306/db' })).toThrow(
      /DATABASE_URL/,
    );
    expect(parseEnv({ ...VALID, DATABASE_URL: 'postgres://u:p@db:5432/x' }).DATABASE_URL).toBe(
      'postgres://u:p@db:5432/x',
    );
  });

  it('hiányzó vagy 32 karakternél rövidebb JWT-titkot elutasít', () => {
    expect(() => parseEnv({ ...VALID, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ ...VALID, JWT_SECRET: 'a'.repeat(31) })).toThrow(/JWT_SECRET/);
    expect(parseEnv({ ...VALID, JWT_SECRET: 'a'.repeat(32) }).JWT_SECRET).toHaveLength(32);
  });

  it('az auth-végpontok sebességkorlátja külön állítható', () => {
    expect(parseEnv({ ...VALID, AUTH_RATE_LIMIT_MAX: '5' }).AUTH_RATE_LIMIT_MAX).toBe(5);
    expect(() => parseEnv({ ...VALID, AUTH_RATE_LIMIT_MAX: '0' })).toThrow(/AUTH_RATE_LIMIT_MAX/);
  });

  // L31 (L08): a megbízható proxyugrások száma beállítható – a konténerben proxy nélkül 0, különben
  // az X-Forwarded-For fejléccel bárki megkerülné az IP-alapú korlátokat
  it('a megbízható proxyugrások száma 0 és 10 közötti egész; alapból éles módban 1, egyébként 0', () => {
    const production = { ...VALID, NODE_ENV: 'production', APP_BASE_URL: 'https://p.example' };
    expect(trustedProxyHops(parseEnv(production))).toBe(1);
    expect(trustedProxyHops(parseEnv(VALID))).toBe(0);
    expect(trustedProxyHops(parseEnv({ ...production, TRUST_PROXY_HOPS: '0' }))).toBe(0);
    expect(trustedProxyHops(parseEnv({ ...VALID, TRUST_PROXY_HOPS: '2' }))).toBe(2);
    for (const value of ['-1', '11', '1.5', 'sok', '']) {
      expect(() => parseEnv({ ...VALID, TRUST_PROXY_HOPS: value })).toThrow(/TRUST_PROXY_HOPS/);
    }
  });

  it('a kliens buildjének mappája (CLIENT_DIST_DIR) elhagyható, de nem lehet üres', () => {
    expect(parseEnv(VALID).CLIENT_DIST_DIR).toBeUndefined();
    expect(parseEnv({ ...VALID, CLIENT_DIST_DIR: '/app/client' }).CLIENT_DIST_DIR).toBe(
      '/app/client',
    );
    expect(() => parseEnv({ ...VALID, CLIENT_DIST_DIR: '' })).toThrow(/CLIENT_DIST_DIR/);
  });

  describe('élesítés (L32)', () => {
    const SUPABASE = {
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_hamisSupabaseKulcs0123456789',
    };

    it('a tárhely alapból a helyi lemez; a Supabase-hez a címe és a titkos kulcsa is kell', () => {
      expect(parseEnv(VALID).STORAGE_DRIVER).toBe('local');
      expect(parseEnv({ ...VALID, ...SUPABASE })).toMatchObject(SUPABASE);
      expect(() => parseEnv({ ...VALID, ...SUPABASE, SUPABASE_URL: undefined })).toThrow(
        /SUPABASE_URL/,
      );
      expect(() => parseEnv({ ...VALID, ...SUPABASE, SUPABASE_SECRET_KEY: undefined })).toThrow(
        /SUPABASE_SECRET_KEY/,
      );
      expect(() => parseEnv({ ...VALID, STORAGE_DRIVER: 's3' })).toThrow(/STORAGE_DRIVER/);
    });

    it('a Supabase címe csak https-eredet, a kulcsa csak sb_secret_ kezdetű titkos kulcs lehet', () => {
      for (const url of [
        'http://abcdefghijklmnop.supabase.co',
        'https://abcdefghijklmnop.supabase.co/storage/v1',
        'nem-url',
      ]) {
        expect(() => parseEnv({ ...VALID, ...SUPABASE, SUPABASE_URL: url })).toThrow(
          /SUPABASE_URL/,
        );
      }
      // A nyilvános (publishable) és a régi JWT-alapú kulcs nem jó: a szerver a titkos kulccsal ír
      for (const key of ['sb_publishable_hamisKulcs0123456789', 'eyJhbGciOiJIUzI1NiJ9.x.y', '']) {
        expect(() => parseEnv({ ...VALID, ...SUPABASE, SUPABASE_SECRET_KEY: key })).toThrow(
          /SUPABASE_SECRET_KEY/,
        );
      }
    });

    it('a két bucket neve beállítható, de nem lehet azonos', () => {
      expect(
        parseEnv({ ...VALID, ...SUPABASE, SUPABASE_PREVIEWS_BUCKET: 'elonezetek' }),
      ).toMatchObject({
        SUPABASE_ORIGINALS_BUCKET: 'originals',
        SUPABASE_PREVIEWS_BUCKET: 'elonezetek',
      });
      expect(() =>
        parseEnv({ ...VALID, ...SUPABASE, SUPABASE_PREVIEWS_BUCKET: 'originals' }),
      ).toThrow(/SUPABASE_PREVIEWS_BUCKET/);
      expect(() => parseEnv({ ...VALID, SUPABASE_ORIGINALS_BUCKET: 'Nagy Betu' })).toThrow(
        /SUPABASE_ORIGINALS_BUCKET/,
      );
    });

    it('a tárhely-műveletek időkorlátja pozitív egész ezredmásodperc, alapból 20 s', () => {
      expect(parseEnv({ ...VALID, STORAGE_TIMEOUT_MS: '5000' }).STORAGE_TIMEOUT_MS).toBe(5000);
      for (const value of ['0', '-1', 'sok']) {
        expect(() => parseEnv({ ...VALID, STORAGE_TIMEOUT_MS: value })).toThrow(
          /STORAGE_TIMEOUT_MS/,
        );
      }
    });

    it('az adatbázis TLS-tanúsítványa létező fájl, és mellette az URL-ben nincs ssl-paraméter', () => {
      const directory = mkdtempSync(join(tmpdir(), 'photochain-ca-'));
      const caFile = join(directory, 'ca.crt');
      writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nhamis\n-----END CERTIFICATE-----\n');
      try {
        expect(parseEnv({ ...VALID, DATABASE_SSL_CA_FILE: caFile }).DATABASE_SSL_CA_FILE).toBe(
          caFile,
        );
        expect(() =>
          parseEnv({ ...VALID, DATABASE_SSL_CA_FILE: join(directory, 'nincs.crt') }),
        ).toThrow(/DATABASE_SSL_CA_FILE/);
        // A node-postgres az URL ssl-paramétereivel felülírná a tanúsítványt (node-postgres: SSL)
        expect(() =>
          parseEnv({
            ...VALID,
            DATABASE_SSL_CA_FILE: caFile,
            DATABASE_URL: `${VALID.DATABASE_URL}?sslmode=require`,
          }),
        ).toThrow(/DATABASE_URL/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('a képpontkorlát 1 és 50 megapixel közötti egész, alapból 50', () => {
      expect(parseEnv({ ...VALID, IMAGE_MAX_MEGAPIXELS: '25' }).IMAGE_MAX_MEGAPIXELS).toBe(25);
      for (const value of ['0', '51', '2.5', 'sok']) {
        expect(() => parseEnv({ ...VALID, IMAGE_MAX_MEGAPIXELS: value })).toThrow(
          /IMAGE_MAX_MEGAPIXELS/,
        );
      }
    });

    it('egyszerre legfeljebb ennyi kép feldolgozása fut (1–8), alapból 4', () => {
      expect(
        parseEnv({ ...VALID, IMAGE_PROCESSING_CONCURRENCY: '1' }).IMAGE_PROCESSING_CONCURRENCY,
      ).toBe(1);
      for (const value of ['0', '9', '1.5']) {
        expect(() => parseEnv({ ...VALID, IMAGE_PROCESSING_CONCURRENCY: value })).toThrow(
          /IMAGE_PROCESSING_CONCURRENCY/,
        );
      }
    });

    // L32 átnézések: a távoli tárhelyről továbbadott képek (/media) is korlátozottak – minden kérés
    // egy Supabase-letöltés (a kimenő forgalom ingyenes kerete véges)
    it('a /media sebességkorlátja IP-címenként külön állítható, alapból 600 / időablak', () => {
      expect(parseEnv({ ...VALID, MEDIA_RATE_LIMIT_MAX: '50' }).MEDIA_RATE_LIMIT_MAX).toBe(50);
      expect(() => parseEnv({ ...VALID, MEDIA_RATE_LIMIT_MAX: '0' })).toThrow(
        /MEDIA_RATE_LIMIT_MAX/,
      );
    });

    // L31 biztonsági átnézés: az alapérték (a Vite fejlesztői szervere) élesben a Stripe
    // visszairányítását a localhostra küldené
    it('élesben az APP_BASE_URL kötelező, fejlesztéskor az alapértéke a Vite szervere', () => {
      expect(() => parseEnv({ ...VALID, NODE_ENV: 'production' })).toThrow(/APP_BASE_URL/);
      expect(
        parseEnv({ ...VALID, NODE_ENV: 'production', APP_BASE_URL: 'https://photochain.example/' })
          .APP_BASE_URL,
      ).toBe('https://photochain.example');
      expect(parseEnv(VALID).APP_BASE_URL).toBe('http://localhost:5173');
    });
  });

  it('a fiókonkénti sikertelen belépések korlátja külön állítható, alapból 10', () => {
    expect(
      parseEnv({ ...VALID, LOGIN_ACCOUNT_RATE_LIMIT_MAX: '3' }).LOGIN_ACCOUNT_RATE_LIMIT_MAX,
    ).toBe(3);
    for (const value of ['0', '-1', '2.5', 'sok', '']) {
      expect(() => parseEnv({ ...VALID, LOGIN_ACCOUNT_RATE_LIMIT_MAX: value })).toThrow(
        /LOGIN_ACCOUNT_RATE_LIMIT_MAX/,
      );
    }
  });

  it('a dHash hasonlósági küszöbe 0 és 64 közötti egész szám', () => {
    expect(parseEnv({ ...VALID, DHASH_THRESHOLD: '6' }).DHASH_THRESHOLD).toBe(6);
    expect(parseEnv({ ...VALID, DHASH_THRESHOLD: '0' }).DHASH_THRESHOLD).toBe(0);
    expect(() => parseEnv({ ...VALID, DHASH_THRESHOLD: '65' })).toThrow(/DHASH_THRESHOLD/);
    expect(() => parseEnv({ ...VALID, DHASH_THRESHOLD: '-1' })).toThrow(/DHASH_THRESHOLD/);
    expect(() => parseEnv({ ...VALID, DHASH_THRESHOLD: '2.5' })).toThrow(/DHASH_THRESHOLD/);
    // Az üresen hagyott érték (DHASH_THRESHOLD=) nem jelenthet csendben 0-t: az kikapcsolná a
    // hasonlóság felismerését. A nem tízes számrendszerű alakok sem fogadhatók el.
    for (const value of ['', ' ', '0x10', '1e1']) {
      expect(() => parseEnv({ ...VALID, DHASH_THRESHOLD: value })).toThrow(/DHASH_THRESHOLD/);
    }
    // Az alapérték egyezik a hash-modul alapértelmezett küszöbével
    expect(parseEnv(VALID).DHASH_THRESHOLD).toBe(DEFAULT_DHASH_THRESHOLD);
  });

  it('a hibaüzenet nem tartalmazza a titkos értékeket', () => {
    const secrets = {
      STRIPE_SECRET_KEY: 'sk_live_TITOK123',
      STRIPE_WEBHOOK_SECRET: 'TITOK-webhook',
      PLATFORM_PRIVATE_KEY: '0xTITOK456',
      DATABASE_URL: 'mysql://felhasznalo:TITOK789@localhost/db',
      JWT_SECRET: 'TITOK-rovid',
    };

    expect(() => parseEnv({ ...VALID, ...secrets })).toThrow(EnvValidationError);
    try {
      parseEnv({ ...VALID, ...secrets });
    } catch (error) {
      expect(String(error)).not.toContain('TITOK');
    }
  });
});

describe('sensitiveValues', () => {
  it('a naplóból kitakarandó titkok: az RPC-URL (és benne a kulcs), a privát kulcs, a többi titok', () => {
    const env = parseEnv({
      ...VALID,
      RPC_URL: 'https://eth-sepolia.g.alchemy.com/v2/ALCHEMY-KULCS-1234567890',
      DATABASE_URL: 'postgresql://felhasznalo:adatbazis-jelszo@localhost:5432/photochain',
    });

    const secrets = sensitiveValues(env);

    expect(secrets).toEqual(
      expect.arrayContaining([
        env.RPC_URL,
        '/v2/ALCHEMY-KULCS-1234567890',
        env.PLATFORM_PRIVATE_KEY,
        env.PLATFORM_PRIVATE_KEY.slice(2),
        env.JWT_SECRET,
        env.STRIPE_SECRET_KEY,
        env.STRIPE_WEBHOOK_SECRET,
        env.DATABASE_URL,
        'adatbazis-jelszo',
      ]),
    );
  });

  it('a nagybetűs privát kulcs kisbetűs alakját is (az ethers így írja ki), 0x-szel és nélküle', () => {
    const key = `0x${'AB'.repeat(32)}`;

    const secrets = sensitiveValues(parseEnv({ ...VALID, PLATFORM_PRIVATE_KEY: key }));

    expect(secrets).toEqual(expect.arrayContaining([key, `0x${'ab'.repeat(32)}`, 'ab'.repeat(32)]));
  });

  it('a lekérdezési paraméterben, illetve önálló útvonal-szakaszként szereplő RPC-kulcsot is', () => {
    const env = parseEnv({
      ...VALID,
      RPC_URL: 'https://rpc.example/v2/KULCS-0123456789abcdef?apikey=MASIK-KULCS-42',
    });

    const secrets = sensitiveValues(env);

    expect(secrets).toEqual(
      expect.arrayContaining([
        'KULCS-0123456789abcdef',
        '?apikey=MASIK-KULCS-42',
        'MASIK-KULCS-42',
      ]),
    );
  });

  it('a hibás %-kódolású adatbázis-jelszónál sem dob hibát (a nyers alakot veszi fel)', () => {
    const env = parseEnv({ ...VALID, DATABASE_URL: 'postgresql://u:p%ssw0rdX@localhost:5432/db' });

    expect(() => sensitiveValues(env)).not.toThrow();
    expect(sensitiveValues(env)).toContain('p%ssw0rdX');
  });

  it('a rövid (pl. helyi, kulcs nélküli) útvonalat nem veszi fel – az minden naplósort elrontana', () => {
    const secrets = sensitiveValues(parseEnv({ ...VALID, RPC_URL: 'http://127.0.0.1:8545' }));

    expect(secrets).not.toContain('/');
    expect(secrets.every((secret) => secret.length >= 8)).toBe(true);
  });
});

describe('a Supabase titkos kulcsa (L32)', () => {
  it('a naplóból kitakarandó titkok közé kerül', () => {
    const env = parseEnv({
      ...VALID,
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_hamisSupabaseKulcs0123456789',
    });

    expect(sensitiveValues(env)).toContain('sb_secret_hamisSupabaseKulcs0123456789');
  });
});

describe('configWarnings (L32)', () => {
  it('helyes beállításnál nincs figyelmeztetés', () => {
    expect(configWarnings(parseEnv(VALID))).toEqual([]);
  });

  // L31 biztonsági átnézés: https-cím mellett az éles mód hiánya elfelejtett beállítás –
  // NODE_ENV=production nélkül nincs Secure süti és trust proxy
  it('https-es APP_BASE_URL mellett figyelmeztet, ha a mód nem éles', () => {
    const warnings = configWarnings(
      parseEnv({ ...VALID, APP_BASE_URL: 'https://photochain.example' }),
    );

    expect(warnings).toEqual([expect.stringContaining('NODE_ENV=production')]);
  });
});

// L32 biztonsági átnézés: élesben a távoli adatbázis csak ellenőrzött TLS-sel indulhat –
// a figyelmeztetés kevés volt. Távoli minden, ami nem a helyi gép vagy a Compose db szolgáltatása.
describe('élesben a távoli adatbázishoz ellenőrzött TLS kell (L32)', () => {
  const production = { ...VALID, NODE_ENV: 'production', APP_BASE_URL: 'https://p.example' };
  const remoteUrl =
    'postgresql://felhasznalo:jelszo@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';

  it('CA-tanúsítvány (vagy verify-full mód) nélkül a szerver el sem indul', () => {
    expect(() => parseEnv({ ...production, DATABASE_URL: remoteUrl })).toThrow(
      /DATABASE_SSL_CA_FILE/,
    );
    // Az URL-ben megadott ellenőrző mód (verify-full + sslrootcert) is elfogadott
    expect(
      parseEnv({ ...production, DATABASE_URL: `${remoteUrl}?sslmode=verify-full&sslrootcert=/ca` })
        .NODE_ENV,
    ).toBe('production');
    // Fejlesztéskor nem kötelező
    expect(parseEnv({ ...VALID, DATABASE_URL: remoteUrl }).NODE_ENV).toBe('development');
  });

  it('helyi a localhost, a 127.0.0.0/8, a ::1 és a Compose db szolgáltatása – minden más távoli', () => {
    for (const host of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]', 'db']) {
      const url = `postgresql://f:j@${host}:5432/photochain`;
      expect(parseEnv({ ...production, DATABASE_URL: url }).DATABASE_URL).toBe(url);
    }
    for (const host of ['[2a05:d014::1]', 'prod-db', '10.0.0.5']) {
      const url = `postgresql://f:j@${host}:5432/photochain`;
      expect(() => parseEnv({ ...production, DATABASE_URL: url })).toThrow(/DATABASE_SSL_CA_FILE/);
    }
  });

  // L32 kódátnézés: az érvénytelen URL-t (pl. kódolatlan / a jelszóban) a többi szabály ne
  // nyers TypeError-ral – benne a teljes URL-lel és a jelszóval – utasítsa el
  it('az érvénytelen DATABASE_URL-t értékek nélküli hibával utasítja el', () => {
    const invalid = 'postgresql://felhasznalo:pa/ss-TITOK@aws-0.pooler.supabase.com:5432/postgres';

    const run = () => parseEnv({ ...production, DATABASE_URL: invalid });

    expect(run).toThrow(EnvValidationError);
    expect(run).not.toThrow(/TITOK/);
  });
});

describe('loadEnv', () => {
  const addedKeys = [
    'DATABASE_URL',
    'RPC_URL',
    'PLATFORM_PRIVATE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'JWT_SECRET',
  ] as const;
  let workDir: string | undefined;

  afterEach(() => {
    for (const key of addedKeys) delete process.env[key];
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  it('a megadott .env fájlt betölti, és ellenőrzi', () => {
    workDir = mkdtempSync(join(tmpdir(), 'photochain-env-'));
    const envFile = join(workDir, '.env');
    writeFileSync(
      envFile,
      Object.entries(VALID)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );

    const env = loadEnv(envFile);

    expect(env.RPC_URL).toBe(VALID.RPC_URL);
    expect(env.STRIPE_SECRET_KEY).toBe(VALID.STRIPE_SECRET_KEY);
  });

  it('ha a fájl nem létezik (élesben a tárhely adja a változókat), csak a folyamat környezetét ellenőrzi (L27)', () => {
    workDir = mkdtempSync(join(tmpdir(), 'photochain-env-'));
    for (const key of addedKeys) process.env[key] = VALID[key];

    const env = loadEnv(join(workDir, 'nincs-ilyen.env'));

    expect(env.RPC_URL).toBe(VALID.RPC_URL);
    expect(env.JWT_SECRET).toBe(VALID.JWT_SECRET);
  });
});
