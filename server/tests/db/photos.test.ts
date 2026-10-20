// A képfeltöltés (POST /api/photos) végponttesztjei a tesztadatbázison, ideiglenes tárhelymappával
// és a saját tesztfotókkal: feldolgozás, tárolás, duplikáció-szűrés, korlátok, hibás bemenetek.
import { once } from 'node:events';
import { readFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Express } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { Env } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { ChainError, ownerRefOf } from '../../src/services/blockchain.service.js';
import { sha256 } from '../../src/services/hashing.service.js';
import { MAX_IMAGE_PIXELS, restrictImageDecoders } from '../../src/services/imageDecoding.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import type { StorageService } from '../../src/services/storage/storage.types.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  TEST_ENV,
  type TestChain,
  UNKNOWN_USER_ID,
} from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';
import {
  createTempUploadDir,
  deferred,
  fixtureImage,
  listStoredFiles,
} from '../helpers/uploads.js';

const PUDDLE = fixtureImage('01_tocsa_tukrozodes.jpg');
const CANDLES = fixtureImage('02_gyertyak.jpg');
const BASS_GUITAR = fixtureImage('03_basszusgitar.jpg');
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

let prisma: PrismaClient;
let uploadDir: string;
let app: Express;
let cookie: string;
let owner: { id: string; displayName: string };
let categoryId: number;
let chain: TestChain;

beforeAll(() => {
  prisma = createTestPrisma();
  // Ugyanúgy, mint az éles szerverben (server.ts): csak a három elfogadott formátum dekódere él
  restrictImageDecoders();
});

afterAll(async () => {
  sharp.unblock({ operation: ['VipsForeignLoad'] });
  rmSync(uploadDir, { recursive: true, force: true });
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  uploadDir = createTempUploadDir();
  chain = createTestChain(prisma);
  app = createTestApp({ UPLOAD_DIR: uploadDir }, prisma, chain);
  owner = await createUser(prisma);
  cookie = sessionCookieFor(owner.id);
  categoryId = (await createCategory(prisma)).id;
});

// A háttérben futó lánc-regisztráció a teszt végéig befejeződik (nem nyúl át a következő tesztbe)
afterEach(() => chain.photoRegistration.whenIdle());

const storedFiles = (): string[] => listStoredFiles(uploadDir);
const statuses = (responses: request.Response[]): number[] =>
  responses.map((response) => response.status).sort();

interface UploadOptions {
  fields?: Record<string, string>;
  as?: string;
  target?: Express;
}

function upload(
  image: Buffer | null,
  { fields = {}, as = cookie, target = app }: UploadOptions = {},
) {
  const allFields = { title: 'Tócsa', priceHuf: '2500', categoryId: String(categoryId), ...fields };
  const pending = request(target).post('/api/photos').set('Cookie', as);
  for (const [name, value] of Object.entries(allFields)) pending.field(name, value);
  return image ? pending.attach('image', image, 'feltoltes.jpg') : pending;
}

/** Alkalmazás a megadott tárhellyel – mintha egy másik szerverpéldány volna ugyanazon az adatbázison. */
const appWithStorage = (storage: StorageService, overrides: Partial<Env> = {}): Express =>
  createApp({
    env: { ...TEST_ENV, ...overrides },
    logger: createLogger(TEST_ENV),
    prisma,
    storage,
    blockchain: chain.blockchain,
    photoRegistration: chain.photoRegistration,
    payments: createFakePayments().payments,
  });

/** Tárhely, amelynek a mentései a sorompó nyitásáig várnak (a `save` hívásai megfigyelhetők). */
function gatedStorage() {
  const local = createLocalStorage(uploadDir);
  const gate = deferred();
  const save = vi.fn(async (key: string, data: Buffer) => {
    await gate.promise;
    await local.save(key, data);
  });
  return { storage: { ...local, save } satisfies StorageService, save, open: gate.resolve };
}

/** Egy másik (bejelentkezett) felhasználó sütije. */
const otherUserCookie = async (): Promise<string> =>
  sessionCookieFor((await createUser(prisma)).id);

describe('POST /api/photos – sikeres feltöltés', () => {
  it('201-et ad a kép adataival, PENDING_CHAIN állapotban, a két ujjlenyomattal', async () => {
    const response = await upload(PUDDLE, { fields: { description: 'Eső után\naz udvaron' } });

    expect(response.status).toBe(201);
    // A bejelentkezéshez kötött válasz: se a böngésző, se egy köztes proxy ne tárolja
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.photo).toEqual({
      id: expect.stringMatching(new RegExp(`^${UUID}$`)),
      title: 'Tócsa',
      description: 'Eső után\naz udvaron',
      priceHuf: 2500,
      status: 'PENDING_CHAIN',
      sha256: sha256(PUDDLE),
      dHash: 'f0e8f2f2b6f3f0f0',
      width: 1067,
      height: 1600,
      previewUrl: expect.stringMatching(new RegExp(`^/media/previews/${UUID}\\.jpg$`)),
      thumbnailUrl: expect.stringMatching(new RegExp(`^/media/thumbnails/${UUID}\\.jpg$`)),
      category: { id: categoryId, name: expect.any(String), slug: expect.any(String) },
      owner: { id: owner.id, displayName: owner.displayName },
      createdAt: expect.any(String),
      // Ugyanaz az alak, mint az adatlapé (GET /api/photos/:id): a tanúsítvány a regisztráció után jön
      certificate: null,
    });
    // A privát eredeti helye nem szivároghat ki
    expect(JSON.stringify(response.body)).not.toContain('originals');
  });

  it('a három fájl a tárhelyre kerül: bájtra azonos eredeti, vízjeles előnézet, bélyegkép', async () => {
    await upload(PUDDLE).expect(201);

    const photo = await prisma.photo.findFirstOrThrow();
    expect(storedFiles()).toEqual(
      [photo.originalKey, `public/${photo.previewKey}`, `public/${photo.thumbnailKey}`].sort(),
    );
    expect(sha256(readFileSync(join(uploadDir, photo.originalKey)))).toBe(photo.sha256);
    const preview = await sharp(
      readFileSync(join(uploadDir, 'public', photo.previewKey)),
    ).metadata();
    expect(preview).toMatchObject({ format: 'jpeg', width: 800, height: 1200 });
    expect(preview.exif).toBeUndefined();
  });

  it('az előnézet nyilvánosan letölthető, az eredeti nem', async () => {
    const { body } = await upload(PUDDLE).expect(201);
    const photo = await prisma.photo.findFirstOrThrow();

    const preview = await request(app).get(body.data.photo.previewUrl);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('image/jpeg');
    expect(preview.headers['x-content-type-options']).toBe('nosniff');
    await request(app).get(`/media/${photo.originalKey}`).expect(404);
    // A nyilvános mappából kifelé mutató útvonal sem vezet az eredetihez
    await request(app).get(`/media/../${photo.originalKey}`).expect(404);
    await request(app).get(`/media/previews/..%2F..%2F..%2F${photo.originalKey}`).expect(404);
  });

  it('különböző képek gond nélkül feltölthetők egymás után', async () => {
    await upload(PUDDLE).expect(201);
    await upload(CANDLES, { fields: { title: 'Gyertyák' } }).expect(201);

    await expect(prisma.photo.count()).resolves.toBe(2);
    expect(storedFiles()).toHaveLength(6);
  });
});

describe('POST /api/photos – duplikáció-szűrés', () => {
  it('ugyanaz a fájl másodszor: 409 DUPLICATE_EXACT, a regisztrált eredeti adataival', async () => {
    const first = await upload(PUDDLE).expect(201);
    await chain.photoRegistration.whenIdle();
    const other = await createUser(prisma);

    const response = await upload(PUDDLE, { as: sessionCookieFor(other.id) });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_EXACT');
    expect(response.body.error.details).toEqual({
      photoId: first.body.data.photo.id,
      title: 'Tócsa',
      ownerDisplayName: owner.displayName,
      uploadedAt: first.body.data.photo.createdAt,
      distance: 0,
    });
    await expect(prisma.photo.count()).resolves.toBe(1);
    expect(storedFiles()).toHaveLength(3);
  });

  it('kicsinyített és újratömörített másolat: 409 DUPLICATE_SIMILAR a talált kép adataival', async () => {
    const first = await upload(PUDDLE).expect(201);
    const copy = await sharp(PUDDLE).resize({ width: 700 }).jpeg({ quality: 60 }).toBuffer();

    const response = await upload(copy, { fields: { title: 'Az én képem' } });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_SIMILAR');
    expect(response.body.error.details).toMatchObject({
      photoId: first.body.data.photo.id,
      title: 'Tócsa',
      ownerDisplayName: owner.displayName,
    });
    expect(response.body.error.details.distance).toBeGreaterThan(0);
    expect(response.body.error.details.distance).toBeLessThanOrEqual(10);
    expect(storedFiles()).toHaveLength(3);
  });

  it('a küszöb a DHASH_THRESHOLD-dal állítható: 0-nál csak a pontosan egyező dHash számít', async () => {
    const strictApp = createTestApp({ UPLOAD_DIR: uploadDir, DHASH_THRESHOLD: 0 }, prisma);
    await upload(PUDDLE, { target: strictApp }).expect(201);
    const copy = await sharp(PUDDLE).resize({ width: 700 }).jpeg({ quality: 60 }).toBuffer();

    await upload(copy, { target: strictApp }).expect(201);
  });

  it('több feltöltött kép közül a leghasonlóbbat adja meg', async () => {
    await upload(PUDDLE).expect(201);
    const candles = await upload(CANDLES, { fields: { title: 'Gyertyák' } }).expect(201);
    await upload(BASS_GUITAR, { fields: { title: 'Basszusgitár' } }).expect(201);
    const copy = await sharp(CANDLES).resize({ width: 900 }).webp({ quality: 70 }).toBuffer();

    const response = await upload(copy);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_SIMILAR');
    expect(response.body.error.details).toMatchObject({
      photoId: candles.body.data.photo.id,
      title: 'Gyertyák',
    });
  });

  it('két egyidejű, azonos feltöltés közül csak az egyik sikerül, és nem marad árva fájl', async () => {
    const other = await otherUserCookie();

    const responses = await Promise.all([upload(PUDDLE), upload(PUDDLE, { as: other })]);

    expect(statuses(responses)).toEqual([201, 409]);
    await expect(prisma.photo.count()).resolves.toBe(1);
    expect(storedFiles()).toHaveLength(3);
  });

  // A hasonlóságot az adatbázis egyedi indexe nem tudja kizárni – a feltöltések sorba állítása igen
  it('egy kép és a módosított másolata egyidejűleg feltöltve: csak az egyik sikerül', async () => {
    const copy = await sharp(PUDDLE).resize({ width: 700 }).jpeg({ quality: 60 }).toBuffer();
    const other = await otherUserCookie();

    const responses = await Promise.all([upload(PUDDLE), upload(copy, { as: other })]);

    expect(statuses(responses)).toEqual([201, 409]);
    await expect(prisma.photo.count()).resolves.toBe(1);
    expect(storedFiles()).toHaveLength(3);
  });

  // Két szerverpéldány nem osztozik a soron: ott a photos.sha256 egyedi indexe az utolsó védvonal.
  // A közös „sorompó” addig tartja vissza a mentést, amíg mindkét példány túl nem jutott a
  // duplikáció-ellenőrzésen – így biztosan az adatbázis utasítja el a másodikat.
  it('két szerverpéldány egyidejű, azonos feltöltése közül is csak az egyik sikerül', async () => {
    const local = createLocalStorage(uploadDir);
    const bothChecked = deferred();
    let arrived = 0;
    const barrierStorage: StorageService = {
      ...local,
      async save(key, data) {
        if (key.startsWith('originals/')) {
          arrived += 1;
          if (arrived === 2) bothChecked.resolve();
          await bothChecked.promise;
        }
        await local.save(key, data);
      },
    };

    const responses = await Promise.all([
      upload(PUDDLE, { target: appWithStorage(barrierStorage) }),
      upload(PUDDLE, { target: appWithStorage(barrierStorage) }),
    ]);

    expect(statuses(responses)).toEqual([201, 409]);
    const rejected = responses.find((response) => response.status === 409);
    expect(rejected?.body.error.code).toBe('DUPLICATE_EXACT');
    await expect(prisma.photo.count()).resolves.toBe(1);
    expect(storedFiles()).toHaveLength(3);
  });
});

describe('POST /api/photos – lánc-regisztráció', () => {
  it('feltöltés után a kép a háttérben a láncra kerül: PENDING_CHAIN → REGISTERED', async () => {
    const response = await upload(PUDDLE).expect(201);
    expect(response.body.data.photo.status).toBe('PENDING_CHAIN');

    await chain.photoRegistration.whenIdle();

    const stored = await prisma.photo.findUniqueOrThrow({
      where: { id: response.body.data.photo.id },
    });
    expect(stored.status).toBe('REGISTERED');
    expect(stored.chainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(stored.registeredAt).toBeInstanceOf(Date);
    expect(chain.blockchain.registerPhoto).toHaveBeenCalledWith(
      { sha256: sha256(PUDDLE), dHash: stored.dHash, ownerRef: ownerRefOf(owner.id) },
      expect.anything(),
    );
  });

  it('feltöltéskor a láncot is megkérdezi: ha ott már szerepel, 409 DUPLICATE_EXACT, részletek nélkül', async () => {
    // A lánc az igazságforrás: az adatbázisban nincs nyoma (pl. újratelepített adatbázis)
    chain.records.set(sha256(PUDDLE), {
      ownerRef: ownerRefOf(UNKNOWN_USER_ID),
      dHash: '0'.repeat(16),
      registeredAt: new Date(),
    });

    const response = await upload(PUDDLE);

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'DUPLICATE_EXACT',
      message: expect.stringMatching(/blokklánc/),
      details: { distance: 0 },
    });
    expect(chain.blockchain.isRegistered).toHaveBeenCalledWith(sha256(PUDDLE));
    await expect(prisma.photo.count()).resolves.toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('ha a lánc nem érhető el, a feltöltés sikerül (201), a regisztráció CHAIN_FAILED, és újrapróbálható', async () => {
    const unavailable = new ChainError('UNAVAILABLE', 'A blokklánc-csomópont nem érhető el');
    chain.blockchain.isRegistered.mockRejectedValue(unavailable);
    chain.blockchain.registerPhoto.mockRejectedValue(unavailable);

    const response = await upload(PUDDLE).expect(201);
    await chain.photoRegistration.whenIdle();

    const where = { id: response.body.data.photo.id };
    await expect(prisma.photo.findUniqueOrThrow({ where })).resolves.toMatchObject({
      status: 'CHAIN_FAILED',
    });

    // A lánc újra elérhető: az (adminisztrátori) újrapróbálás már sikerül
    chain.blockchain.registerPhoto.mockReset();
    await chain.photoRegistration.retryRegistration(where.id);
    await chain.photoRegistration.whenIdle();
    await expect(prisma.photo.findUniqueOrThrow({ where })).resolves.toMatchObject({
      status: 'REGISTERED',
    });
  });
});

describe('POST /api/photos – a 409-es válasz részletei', () => {
  // Nyilvános (a galériában látható) csak a láncon regisztrált kép. A még nem regisztrált vagy
  // elrejtett képről idegennek semmit nem árulunk el; a saját képéről a feltöltő mindent láthat.
  const smallerCopy = (image: Buffer): Promise<Buffer> =>
    sharp(image).resize({ width: 700 }).jpeg({ quality: 60 }).toBuffer();

  /** Feltölti a képet, megvárja a regisztrációt, majd az adatbázisban a megadott állapotba teszi. */
  async function uploadWithStatus(status: 'PENDING_CHAIN' | 'CHAIN_FAILED' | 'HIDDEN') {
    const first = await upload(PUDDLE).expect(201);
    await chain.photoRegistration.whenIdle();
    await prisma.photo.update({
      where: { id: first.body.data.photo.id },
      data: { status, hiddenBy: status === 'HIDDEN' ? 'OWNER' : null },
    });
    return first.body.data.photo as { id: string; createdAt: string };
  }

  it.each(['PENDING_CHAIN', 'CHAIN_FAILED', 'HIDDEN'] as const)(
    '%s állapotú kép másolatánál az idegen feltöltő csak a távolságot kapja meg',
    async (status) => {
      await uploadWithStatus(status);

      const exact = await upload(PUDDLE, { as: await otherUserCookie() });
      const similar = await upload(await smallerCopy(PUDDLE), { as: await otherUserCookie() });

      expect(exact.status).toBe(409);
      expect(exact.body.error.code).toBe('DUPLICATE_EXACT');
      expect(exact.body.error.details).toEqual({ distance: 0 });
      expect(similar.status).toBe(409);
      expect(similar.body.error.code).toBe('DUPLICATE_SIMILAR');
      expect(Object.keys(similar.body.error.details)).toEqual(['distance']);
    },
  );

  it('a saját, még nem regisztrált képét újra feltöltő felhasználó látja a kép adatait', async () => {
    const first = await uploadWithStatus('CHAIN_FAILED');

    const response = await upload(PUDDLE);

    expect(response.status).toBe(409);
    expect(response.body.error.details).toEqual({
      photoId: first.id,
      title: 'Tócsa',
      ownerDisplayName: owner.displayName,
      uploadedAt: first.createdAt,
      distance: 0,
    });
  });
});

describe('POST /api/photos – korlátok', () => {
  it('a feltöltési kísérletek száma felhasználónként korlátozott: fölötte 429', async () => {
    const limitedApp = createTestApp({ UPLOAD_DIR: uploadDir, UPLOAD_RATE_LIMIT_MAX: 2 }, prisma);
    const other = await createUser(prisma);

    await upload(PUDDLE, { target: limitedApp }).expect(201);
    // Az elutasított kísérlet is beleszámít
    await upload(PUDDLE, { target: limitedApp }).expect(409);
    const third = await upload(CANDLES, { target: limitedApp });

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    // A korlát felhasználónként él, nem IP-címenként
    await upload(CANDLES, { target: limitedApp, as: sessionCookieFor(other.id) }).expect(201);
  });

  it('egyszerre legfeljebb UPLOAD_MAX_CONCURRENT feltöltést fogad, a többit 503-mal elutasítja', async () => {
    const gated = gatedStorage();
    const busyApp = appWithStorage(gated.storage, { UPLOAD_MAX_CONCURRENT: 1 });
    const first = upload(PUDDLE, { target: busyApp }).then();
    // Az első feltöltés a mentésnél várakozik – addig a helyét foglalja
    await vi.waitFor(() => expect(gated.save).toHaveBeenCalledTimes(1));

    const second = await upload(CANDLES, { target: busyApp, as: await otherUserCookie() });

    expect(second.status).toBe(503);
    expect(second.body.error.code).toBe('SERVER_BUSY');
    expect(second.headers['retry-after']).toBeDefined();
    gated.open();
    expect((await first).status).toBe(201);
    expect(storedFiles()).toHaveLength(3);
  });

  it('felhasználónként egyszerre egy feltöltés lehet folyamatban: a második 429', async () => {
    const gated = gatedStorage();
    const slowApp = appWithStorage(gated.storage);
    const first = upload(PUDDLE, { target: slowApp }).then();
    await vi.waitFor(() => expect(gated.save).toHaveBeenCalledTimes(1));

    const second = await upload(CANDLES, { target: slowApp });

    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RATE_LIMITED');
    gated.open();
    expect((await first).status).toBe(201);
  });

  it('a kliens által megszakított, még sorban álló feltöltést a szerver eldobja', async () => {
    const gated = gatedStorage();
    const slowApp = appWithStorage(gated.storage);
    const first = upload(PUDDLE, { target: slowApp }).then();
    await vi.waitFor(() => expect(gated.save).toHaveBeenCalledTimes(1));
    const second = upload(CANDLES, { target: slowApp, as: await otherUserCookie() });
    const outcome = second.then(
      () => 'válasz',
      () => 'megszakadt',
    );
    // A második kérés beér a sorba (az első mögé), ekkor bontja a kliens a kapcsolatot
    await sleep(300);

    second.abort();
    await expect(outcome).resolves.toBe('megszakadt');
    await sleep(100);
    gated.open();

    expect((await first).status).toBe(201);
    await sleep(300);
    // Csak az első feltöltés három fájlja került mentésre
    expect(gated.save).toHaveBeenCalledTimes(3);
    await expect(prisma.photo.count()).resolves.toBe(1);
  });

  // L30 (A06): minden elfogadott feltöltés egy lánc-tranzakció, amelyet a platform-tárca fizet – a
  // napi keret fiókonként és a platformon összesen is véges (bábfiókokkal sem üríthető ki a tárca)
  describe('napi feltöltési keret', () => {
    const HOUR_MS = 60 * 60 * 1000;
    const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * HOUR_MS);

    it('fiókonként: a keret felett 429, a fájlt be sem olvassa; a 24 óránál régebbi kép nem számít', async () => {
      const limitedApp = createTestApp({ UPLOAD_DIR: uploadDir, UPLOAD_DAILY_LIMIT: 2 }, prisma);
      // Az elrejtett kép is számít (a tranzakciója már kiment); a tegnapelőtti nem
      await createPhoto(prisma, { ownerId: owner.id, categoryId, createdAt: hoursAgo(23) });
      await createPhoto(prisma, { ownerId: owner.id, categoryId, status: 'HIDDEN' });
      await createPhoto(prisma, { ownerId: owner.id, categoryId, createdAt: hoursAgo(25) });

      const response = await upload(PUDDLE, { target: limitedApp });

      expect(response.status).toBe(429);
      expect(response.body.error).toEqual({
        code: 'DAILY_LIMIT_REACHED',
        message: 'Elérted a napi feltöltési keretet (2 kép / 24 óra) – próbáld újra később',
      });
      expect(storedFiles()).toEqual([]);
      await expect(prisma.photo.count()).resolves.toBe(3);
      // Másik fiók keretét nem érinti
      await upload(PUDDLE, { target: limitedApp, as: await otherUserCookie() }).expect(201);
    });

    // A 24 órás ablak: a 25 órás kép nem számít – különben már az első feltöltés 429 volna
    it('a keret alatt a feltöltés rendben lefut; a 24 óránál régebbi kép helyet hagy', async () => {
      const limitedApp = createTestApp({ UPLOAD_DIR: uploadDir, UPLOAD_DAILY_LIMIT: 2 }, prisma);
      await createPhoto(prisma, { ownerId: owner.id, categoryId, createdAt: hoursAgo(23) });
      await createPhoto(prisma, { ownerId: owner.id, categoryId, createdAt: hoursAgo(25) });

      await upload(PUDDLE, { target: limitedApp }).expect(201);
      expect((await upload(CANDLES, { target: limitedApp })).status).toBe(429);
    });

    it('a platform keretébe sem számít a 24 óránál régebbi kép', async () => {
      const limitedApp = createTestApp(
        { UPLOAD_DIR: uploadDir, UPLOAD_GLOBAL_DAILY_LIMIT: 2 },
        prisma,
      );
      for (const createdAt of [hoursAgo(2), hoursAgo(30)]) {
        const someone = await createUser(prisma);
        await createPhoto(prisma, { ownerId: someone.id, categoryId, createdAt });
      }

      await upload(PUDDLE, { target: limitedApp }).expect(201);
      expect((await upload(CANDLES, { target: limitedApp })).status).toBe(429);
    });

    it('a keret a fájl fogadása előtt dönt: a nem multipart kérés is 429-et kap (nem 415-öt)', async () => {
      const limitedApp = createTestApp({ UPLOAD_DIR: uploadDir, UPLOAD_DAILY_LIMIT: 1 }, prisma);
      await createPhoto(prisma, { ownerId: owner.id, categoryId, createdAt: hoursAgo(1) });

      const response = await request(limitedApp)
        .post('/api/photos')
        .set('Cookie', cookie)
        .send({ title: 'nem fájl' });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('DAILY_LIMIT_REACHED');
    });

    it('a platformon összesen: a közös keret felett mindenkinek 429', async () => {
      const limitedApp = createTestApp(
        { UPLOAD_DIR: uploadDir, UPLOAD_GLOBAL_DAILY_LIMIT: 2 },
        prisma,
      );
      for (const createdAt of [hoursAgo(2), hoursAgo(3), hoursAgo(30)]) {
        const someone = await createUser(prisma);
        await createPhoto(prisma, { ownerId: someone.id, categoryId, createdAt });
      }

      const response = await upload(PUDDLE, { target: limitedApp });

      expect(response.status).toBe(429);
      expect(response.body.error).toEqual({
        code: 'DAILY_LIMIT_REACHED',
        message: 'A platform napi feltöltési kerete elfogyott – próbáld újra később',
      });
      expect(storedFiles()).toEqual([]);
    });
  });

  // L30: mint az ellenőrzésnél (L12) – a lassan csepegtetett törzs nem foglalhatja sokáig a helyet
  it('a lassan csepegtetett fájl a határidő (UPLOAD_BODY_TIMEOUT_MS) után kapcsolatbontást kap, és a hely felszabadul', async () => {
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, UPLOAD_BODY_TIMEOUT_MS: 1_500, UPLOAD_MAX_CONCURRENT: 1 },
      prisma,
      chain,
    );
    const server = limited.listen(0);
    await once(server, 'listening');
    try {
      const { port } = server.address() as AddressInfo;
      const slow = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/api/photos',
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'multipart/form-data; boundary=PhotoChainHatar',
          'Content-Length': '100000',
        },
      });
      const failed = once(slow, 'error');
      // A bejelentett törzsnek csak az eleje érkezik meg – a többi sosem
      await new Promise<void>((sent) => {
        slow.write(
          '--PhotoChainHatar\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\n',
          () => sent(),
        );
      });
      await sleep(300);
      const otherCookie = await otherUserCookie();

      // Amíg csepeg, a helyet foglalja: egy másik felhasználó feltöltése 503
      expect((await upload(CANDLES, { target: limited, as: otherCookie })).status).toBe(503);

      const [error] = (await failed) as [NodeJS.ErrnoException];
      expect(error.code).toBe('ECONNRESET');
      // A határidő után a hely felszabadul: a következő feltöltés rendben lefut
      await vi.waitFor(
        async () =>
          expect((await upload(CANDLES, { target: limited, as: otherCookie })).status).toBe(201),
        { timeout: 5_000 },
      );
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it('a megengedettnél nagyobb fájl: 413 PAYLOAD_TOO_LARGE', async () => {
    const smallLimitApp = createTestApp(
      { UPLOAD_DIR: uploadDir, UPLOAD_MAX_BYTES: 100_000 },
      prisma,
    );

    const response = await upload(PUDDLE, { target: smallLimitApp });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(storedFiles()).toEqual([]);
  });
});

describe('POST /api/photos – elutasított kérések', () => {
  it('bejelentkezés nélkül 401, a fájlt fel sem dolgozza', async () => {
    const response = await request(app).post('/api/photos').attach('image', PUDDLE, 'kep.jpg');

    expect(response.status).toBe(401);
    expect(storedFiles()).toEqual([]);
  });

  it('más webhelyről indított feltöltést 403-mal elutasít', async () => {
    const response = await upload(PUDDLE).set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    await expect(prisma.photo.count()).resolves.toBe(0);
  });

  it('nem multipart kérés: 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const response = await request(app)
      .post('/api/photos')
      .set('Cookie', cookie)
      .send({ title: 'Tócsa', priceHuf: '2500', categoryId: String(categoryId) });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('nem kép, illetve nem támogatott formátum: 415 UNSUPPORTED_IMAGE', async () => {
    const gif = await sharp(PUDDLE).gif().toBuffer();
    const truncated = PUDDLE.subarray(0, 20_000);

    for (const file of [Buffer.from('ez egy szövegfájl, .jpg néven'), gif, truncated]) {
      const response = await upload(file);
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_IMAGE');
    }
    expect(storedFiles()).toEqual([]);
  });

  // Az audit fuzz-próbája találta: ez korábban 500-as szerverhiba volt
  it('a csak teljes dekódoláskor kiderülő sérült képadat: 415, és nem marad fájl', async () => {
    const start = Math.round(PUDDLE.length * 0.5);
    const corrupted = Buffer.concat([PUDDLE.subarray(0, start), PUDDLE.subarray(start + 1000)]);

    const response = await upload(corrupted);

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_IMAGE');
    await expect(prisma.photo.count()).resolves.toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('túl kicsi kép: 400 IMAGE_TOO_SMALL; egyszínű kép: 400 LOW_DETAIL_IMAGE', async () => {
    const small = await sharp(PUDDLE).resize({ width: 400 }).toBuffer();
    const flat = await sharp({
      create: { width: 900, height: 900, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();

    expect((await upload(small)).body.error.code).toBe('IMAGE_TOO_SMALL');
    const response = await upload(flat);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('LOW_DETAIL_IMAGE');
  });

  it('a képpontkorlátnál nagyobb felbontású kép: 400 IMAGE_TOO_LARGE, dekódolás nélkül', async () => {
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 100;
    const huge = await sharp({
      create: { width: side, height: side, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();

    const response = await upload(huge);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IMAGE_TOO_LARGE');
    expect(storedFiles()).toEqual([]);
  });

  it('hiányzó fájl vagy hibás mezők: 400 VALIDATION_ERROR, mezőnkénti részletekkel', async () => {
    const paths = (response: request.Response): string[] =>
      response.body.error.details.map((detail: { path: string }) => detail.path).sort();

    const noFile = await upload(null);
    const badFields = await upload(PUDDLE, {
      fields: { title: ' ', priceHuf: '-5', categoryId: 'x', description: 'a\u0000b' },
    });
    const unknownCategory = await upload(PUDDLE, { fields: { categoryId: '999999' } });

    expect(noFile.status).toBe(400);
    expect(paths(noFile)).toEqual(['image']);
    expect(badFields.status).toBe(400);
    expect([...new Set(paths(badFields))]).toEqual([
      'categoryId',
      'description',
      'priceHuf',
      'title',
    ]);
    expect(unknownCategory.status).toBe(400);
    expect(paths(unknownCategory)).toEqual(['categoryId']);
    await expect(prisma.photo.count()).resolves.toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  it('sérült multipart törzs: 400, nem szerverhiba', async () => {
    const response = await request(app)
      .post('/api/photos')
      .set('Cookie', cookie)
      .set('Content-Type', 'multipart/form-data; boundary=hatar')
      .send(
        '--hatar\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\ncsonka',
      );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_UPLOAD');
  });
});
