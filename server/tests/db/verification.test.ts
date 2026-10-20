// A nyilvános hitelesség-ellenőrző (POST /api/verify, GET /api/verify/:sha256) végponttesztjei a
// tesztadatbázison, a blokklánc utánzatával és a saját tesztfotókkal: a három eredmény (VERIFIED,
// SIMILAR, NOT_FOUND), a lánc mint igazságforrás, az adatvédelem, a hibás bemenetek és a korlátok.
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Express } from 'express';
import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { Env } from '../../src/config/env.js';
import type { PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { createVerificationService } from '../../src/modules/verification/verification.service.js';
import { ChainError, ownerRefOf } from '../../src/services/blockchain.service.js';
import { hammingDistance, sha256 } from '../../src/services/hashing.service.js';
import { restrictImageDecoders } from '../../src/services/imageDecoding.js';
import { createImageWork, type ImageWork } from '../../src/services/imageWork.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { randomTxHash } from '../helpers/fakeBlockchain.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  TEST_ENV,
  type TestChain,
} from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  randomHex,
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
const PUDDLE_DHASH = 'f0e8f2f2b6f3f0f0';
const CHAIN_REGISTERED_AT = new Date('2026-10-01T10:00:00.000Z');
const SEPOLIA_CHAIN_ID = 11_155_111;
/** A lánchiba utáni szünet hossza (verification.service.ts) */
const CHAIN_PAUSE_SECONDS = 60;
/** Ennyi ideig vár a teszt, amíg a fájl beérkezik és a képelemzés eljut a láncolvasásig */
const WAIT_FOR_ANALYSIS_MS = 5_000;

let prisma: PrismaClient;
let uploadDir: string;
let app: Express;
let chain: TestChain;
let owner: { id: string; displayName: string };
let categoryId: number;

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
  owner = await createUser(prisma, undefined, { displayName: 'Fotós Fanni' });
  categoryId = (await createCategory(prisma)).id;
});

afterEach(async () => {
  vi.useRealTimers();
  await chain.photoRegistration.whenIdle();
});

/** A fájl ellenőrzése – bejelentkezés nélkül (a végpont nyilvános). */
const verifyFile = (image: Buffer, target: Express = app, fileName = 'ellenorzes.jpg') =>
  request(target).post('/api/verify').attach('image', image, fileName);

const verifyHash = (hash: string, target: Express = app) =>
  request(target).get(`/api/verify/${hash}`);

/** A kép feltöltése a tulajdonos nevében, és a háttérben futó lánc-regisztráció megvárása. */
async function uploadAndRegister(image: Buffer, title = 'Tócsa') {
  const response = await request(app)
    .post('/api/photos')
    .set('Cookie', sessionCookieFor(owner.id))
    .field('title', title)
    .field('priceHuf', '2500')
    .field('categoryId', String(categoryId))
    .attach('image', image, 'feltoltes.jpg');
  expect(response.status).toBe(201);
  await chain.photoRegistration.whenIdle();
  const photo = await prisma.photo.findUniqueOrThrow({
    where: { id: response.body.data.photo.id },
  });
  expect(photo.status).toBe('REGISTERED');
  return photo;
}

/** Rekord a lánc utánzatán (az adatbázistól függetlenül). */
function putOnChain(hash: string, ownerId: string, registeredAt = CHAIN_REGISTERED_AT): void {
  chain.records.set(hash, { ownerRef: ownerRefOf(ownerId), dHash: PUDDLE_DHASH, registeredAt });
}

/** A tulajdonos nyilvános (REGISTERED), a láncon is rögzített képe a megadott dHash-sel. */
async function registeredPhotoWithDHash(dHash: string) {
  const photo = await createPhoto(prisma, {
    ownerId: owner.id,
    categoryId,
    dHash,
    status: 'REGISTERED',
  });
  putOnChain(photo.sha256, owner.id);
  return photo;
}

/** A dHash legalsó `count` bitje átfordítva – a Hamming-távolság pontosan `count` lesz. */
function withFlippedBits(dHash: string, count: number): string {
  const flipped = BigInt(`0x${dHash}`) ^ ((1n << BigInt(count)) - 1n);
  return flipped.toString(16).padStart(16, '0');
}

/**
 * Versenyhelyzet: a Prisma-kliens a kép adatainak lekérése (findFirst) előtt elrejti a megadott
 * képet – mintha egy adminisztrátor éppen a két lekérdezés között rejtené el.
 */
function hidingBeforeLookup(client: PrismaClient, photoId: string): PrismaClient {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property !== 'photo') return typeof value === 'function' ? value.bind(target) : value;
      return new Proxy(target.photo, {
        get(delegate, method) {
          const member: unknown = Reflect.get(delegate, method);
          if (typeof member !== 'function') return member;
          if (method !== 'findFirst') return member.bind(delegate);
          return async (...args: unknown[]) => {
            await target.photo.update({
              where: { id: photoId },
              data: { status: 'HIDDEN', hiddenBy: 'OWNER' },
            });
            return member.apply(delegate, args);
          };
        },
      });
    },
  });
}

const resizedCopy = (image: Buffer, width: number): Promise<Buffer> =>
  sharp(image).resize({ width }).jpeg({ quality: 85 }).toBuffer();

/** Alkalmazás, amelynek naplósorai a tesztben olvashatók (a hibakeresési szinttől felfelé). */
function appWithLog(overrides: Partial<Env> = {}): { target: Express; lines: string[] } {
  const lines: string[] = [];
  const target = createApp({
    env: { ...TEST_ENV, UPLOAD_DIR: uploadDir, ...overrides },
    logger: pino({ level: 'debug' }, { write: (line: string) => lines.push(line) }),
    prisma,
    storage: createLocalStorage(uploadDir),
    blockchain: chain.blockchain,
    photoRegistration: chain.photoRegistration,
    payments: createFakePayments().payments,
  });
  return { target, lines };
}

/** A NOT_FOUND válasz törzse (a dHash helyén illesztő is állhat). */
const notFoundBody = (file: Buffer, dHash: unknown) => ({
  data: {
    result: 'NOT_FOUND',
    sha256: sha256(file),
    dHash,
    distance: null,
    registration: null,
    photo: null,
  },
});

describe('POST /api/verify – VERIFIED (a láncon pontos egyezés)', () => {
  it('a regisztrált, nyilvános képre VERIFIED a regisztráció és a fotó adataival', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const record = chain.records.get(photo.sha256);

    const response = await verifyFile(PUDDLE);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        result: 'VERIFIED',
        sha256: sha256(PUDDLE),
        dHash: PUDDLE_DHASH,
        distance: null,
        registration: {
          registeredAt: record?.registeredAt.toISOString(),
          blockNumber: photo.chainBlockNumber,
          txHash: photo.chainTxHash,
          // A lokális Hardhat-hálózatnak nincs nyilvános blokklánc-böngészője
          txUrl: null,
        },
        photo: {
          id: photo.id,
          title: 'Tócsa',
          thumbnailUrl: `/media/thumbnails/${photo.id}.jpg`,
          photographer: { id: owner.id, displayName: 'Fotós Fanni' },
        },
      },
    });
    expect(chain.blockchain.getRecord).toHaveBeenCalledWith(sha256(PUDDLE));
  });

  it('a Sepolia-hálózaton a tranzakció Etherscan-linkjét is megadja', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const sepoliaApp = createTestApp(
      { UPLOAD_DIR: uploadDir, CHAIN_ID: SEPOLIA_CHAIN_ID },
      prisma,
      chain,
    );

    const response = await verifyFile(PUDDLE, sepoliaApp);

    expect(response.body.data.registration.txUrl).toBe(
      `https://sepolia.etherscan.io/tx/${photo.chainTxHash}`,
    );
  });

  it('a lánc dönt: az adatbázisban nem szereplő, de a láncon regisztrált kép is VERIFIED, a lánc adataival', async () => {
    putOnChain(sha256(CANDLES), owner.id);

    const response = await verifyFile(CANDLES);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      result: 'VERIFIED',
      sha256: sha256(CANDLES),
      registration: {
        registeredAt: CHAIN_REGISTERED_AT.toISOString(),
        blockNumber: null,
        txHash: null,
        txUrl: null,
      },
      photo: null,
    });
  });

  it('az elrejtett képre VERIFIED a tranzakció adataival, de a kép és a fotós adatai nélkül', async () => {
    const txHash = randomTxHash();
    await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      sha256: sha256(PUDDLE),
      dHash: PUDDLE_DHASH,
      status: 'HIDDEN',
      chainTxHash: txHash,
      chainBlockNumber: 4321,
      registeredAt: CHAIN_REGISTERED_AT,
    });
    putOnChain(sha256(PUDDLE), owner.id);

    const response = await verifyFile(PUDDLE);

    expect(response.body.data).toMatchObject({
      result: 'VERIFIED',
      registration: {
        registeredAt: CHAIN_REGISTERED_AT.toISOString(),
        blockNumber: 4321,
        txHash,
        txUrl: null,
      },
      photo: null,
    });
  });

  it.each<PhotoStatus>(['PENDING_CHAIN', 'CHAIN_FAILED'])(
    'a még nem nyilvános (%s) képre VERIFIED, de a kép adatai és a lezáratlan tranzakció nélkül',
    async (status) => {
      // A küldés előtt mentett tranzakció-hash még nem bizonyíték: blokkszám nélkül nem kerül ki
      await createPhoto(prisma, {
        ownerId: owner.id,
        categoryId,
        sha256: sha256(PUDDLE),
        dHash: PUDDLE_DHASH,
        status,
        chainTxHash: randomTxHash(),
      });
      putOnChain(sha256(PUDDLE), owner.id);

      const response = await verifyFile(PUDDLE);

      expect(response.body.data).toMatchObject({
        result: 'VERIFIED',
        registration: { blockNumber: null, txHash: null, txUrl: null },
        photo: null,
      });
    },
  );

  it('ha a láncon más tulajdonos (ownerRef) szerepel, az adatbázis adatai nem kerülnek a válaszba', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const stranger = await createUser(prisma);
    putOnChain(photo.sha256, stranger.id);

    const response = await verifyFile(PUDDLE);

    expect(response.body.data).toMatchObject({
      result: 'VERIFIED',
      registration: {
        registeredAt: CHAIN_REGISTERED_AT.toISOString(),
        blockNumber: null,
        txHash: null,
      },
      photo: null,
    });
  });
});

describe('POST /api/verify – SIMILAR (közeli dHash)', () => {
  it('a nyilvános kép kicsinyített másolatára SIMILAR, a távolsággal és az eredeti adataival', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const copy = await resizedCopy(PUDDLE, 800);

    const response = await verifyFile(copy);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      result: 'SIMILAR',
      sha256: sha256(copy),
      dHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      distance: expect.any(Number),
      registration: {
        registeredAt: photo.registeredAt?.toISOString(),
        blockNumber: photo.chainBlockNumber,
        txHash: photo.chainTxHash,
        txUrl: null,
      },
      photo: {
        id: photo.id,
        title: 'Tócsa',
        thumbnailUrl: `/media/thumbnails/${photo.id}.jpg`,
        photographer: { id: owner.id, displayName: 'Fotós Fanni' },
      },
    });
    expect(response.body.data.distance).toBeLessThanOrEqual(TEST_ENV.DHASH_THRESHOLD);
  });

  it('a feltöltési 600 képpontos minimum alatti, bélyegkép méretű másolat is ellenőrizhető', async () => {
    await uploadAndRegister(PUDDLE);
    const thumbnailSized = await resizedCopy(PUDDLE, 400);

    const response = await verifyFile(thumbnailSized);

    expect(response.status).toBe(200);
    expect(response.body.data.result).toBe('SIMILAR');
  });

  it('több hasonló kép közül a legközelebbit adja, a regisztráció idejét a lánc rekordjából', async () => {
    const far = await registeredPhotoWithDHash(withFlippedBits(PUDDLE_DHASH, 8));
    const near = await registeredPhotoWithDHash(withFlippedBits(PUDDLE_DHASH, 3));

    const response = await verifyFile(PUDDLE);

    expect(response.body.data).toMatchObject({
      result: 'SIMILAR',
      distance: 3,
      photo: { id: near.id },
      registration: {
        registeredAt: CHAIN_REGISTERED_AT.toISOString(),
        blockNumber: null,
        txHash: null,
      },
    });
    expect(response.body.data.photo.id).not.toBe(far.id);
    expect(chain.blockchain.getRecord).toHaveBeenCalledWith(near.sha256);
  });

  it('a küszöbig (DHASH_THRESHOLD) SIMILAR, fölötte NOT_FOUND', async () => {
    await registeredPhotoWithDHash(withFlippedBits(PUDDLE_DHASH, TEST_ENV.DHASH_THRESHOLD + 1));
    expect((await verifyFile(PUDDLE)).body).toEqual(notFoundBody(PUDDLE, PUDDLE_DHASH));

    await registeredPhotoWithDHash(withFlippedBits(PUDDLE_DHASH, TEST_ENV.DHASH_THRESHOLD));
    expect((await verifyFile(PUDDLE)).body.data).toMatchObject({
      result: 'SIMILAR',
      distance: TEST_ENV.DHASH_THRESHOLD,
    });
  });

  it('a lánc dönt a SIMILAR-nál is: a láncon nem szereplő hasonló kép nem igazol semmit (NOT_FOUND, napló)', async () => {
    const { target, lines } = appWithLog();
    const unconfirmed = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      dHash: withFlippedBits(PUDDLE_DHASH, 2),
      status: 'REGISTERED',
    });

    const response = await verifyFile(PUDDLE, target);

    expect(response.body).toEqual(notFoundBody(PUDDLE, PUDDLE_DHASH));
    const warnings = lines
      .map((line) => JSON.parse(line) as { level: number; photoId?: string; msg: string })
      .filter((entry) => entry.photoId === unconfirmed.id);
    expect(warnings).toEqual([
      expect.objectContaining({ level: 40, msg: expect.stringMatching(/nincs a láncon/) }),
    ]);
  });

  it('ha a hasonló kép láncon rögzített tulajdonosa (ownerRef) más, NOT_FOUND', async () => {
    const similar = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      dHash: withFlippedBits(PUDDLE_DHASH, 2),
      status: 'REGISTERED',
    });
    putOnChain(similar.sha256, (await createUser(prisma)).id);

    const response = await verifyFile(PUDDLE);

    expect(response.body).toEqual(notFoundBody(PUDDLE, PUDDLE_DHASH));
  });

  it('ha egy rejtett kép közelebb van, a legközelebbi nyilvános képet adja', async () => {
    await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      dHash: withFlippedBits(PUDDLE_DHASH, 1),
      status: 'HIDDEN',
    });
    const visible = await registeredPhotoWithDHash(withFlippedBits(PUDDLE_DHASH, 3));

    const response = await verifyFile(PUDDLE);

    expect(response.body.data).toMatchObject({
      result: 'SIMILAR',
      distance: 3,
      photo: { id: visible.id },
    });
  });

  it('ha a hasonló képet az ellenőrzés közben elrejtik, az adatait már nem adja ki (NOT_FOUND)', async () => {
    const similar = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      dHash: withFlippedBits(PUDDLE_DHASH, 2),
      status: 'REGISTERED',
    });
    // A láncon is rajta van: csak az elrejtés (az állapot újbóli ellenőrzése) szűrheti ki
    putOnChain(similar.sha256, owner.id);
    const service = createVerificationService({
      prisma: hidingBeforeLookup(prisma, similar.id),
      storage: createLocalStorage(uploadDir),
      logger: pino({ level: 'silent' }),
      blockchain: chain.blockchain,
      dHashThreshold: TEST_ENV.DHASH_THRESHOLD,
      chainId: TEST_ENV.CHAIN_ID,
      imageWork: createImageWork(1),
      chainReadLimit: {
        limit: TEST_ENV.VERIFY_CHAIN_READ_LIMIT,
        windowMs: TEST_ENV.RATE_LIMIT_WINDOW_MS,
      },
    });

    const result = await service.verifyFile(PUDDLE);

    expect(result).toMatchObject({ result: 'NOT_FOUND', registration: null, photo: null });
  });

  it.each<PhotoStatus>(['HIDDEN', 'PENDING_CHAIN', 'CHAIN_FAILED'])(
    'csak a nyilvános képek közt keres: a %s képhez hasonlóra NOT_FOUND',
    async (status) => {
      await createPhoto(prisma, { ownerId: owner.id, categoryId, dHash: PUDDLE_DHASH, status });

      const response = await verifyFile(PUDDLE);

      expect(response.body).toEqual(notFoundBody(PUDDLE, PUDDLE_DHASH));
    },
  );
});

describe('POST /api/verify – NOT_FOUND', () => {
  it('ismeretlen képre NOT_FOUND, a vizsgált fájl ujjlenyomataival', async () => {
    await uploadAndRegister(PUDDLE);

    const response = await verifyFile(BASS_GUITAR);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      notFoundBody(BASS_GUITAR, expect.stringMatching(/^[0-9a-f]{16}$/)),
    );
  });

  it('ha az adatbázis szerint regisztrált kép nincs a láncon, NOT_FOUND, és ennek nyoma marad a naplóban', async () => {
    const { target, lines } = appWithLog();
    const photo = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      sha256: sha256(PUDDLE),
      dHash: PUDDLE_DHASH,
      status: 'REGISTERED',
    });

    const response = await verifyFile(PUDDLE, target);

    // Önmagához sem „hasonló”: a lánc által meg nem erősített kép nem igazol semmit
    expect(response.body).toEqual(notFoundBody(PUDDLE, PUDDLE_DHASH));
    const warnings = lines
      .map((line) => JSON.parse(line) as { level: number; photoId?: string; msg: string })
      .filter((entry) => entry.photoId === photo.id);
    expect(warnings).toEqual([
      expect.objectContaining({ level: 40, msg: expect.stringMatching(/nincs a láncon/) }),
    ]);
  });
});

describe('POST /api/verify – a vizsgált fájl nem tárolódik', () => {
  it('a fájl nem kerül se a tárhelyre, se az adatbázisba', async () => {
    const response = await verifyFile(PUDDLE);

    expect(response.status).toBe(200);
    expect(listStoredFiles(uploadDir)).toEqual([]);
    await expect(prisma.photo.count()).resolves.toBe(0);
  });

  it('a naplóba nem kerül a fájl neve, ujjlenyomata vagy tartalma', async () => {
    const { target, lines } = appWithLog();

    const response = await verifyFile(PUDDLE, target, 'titkos-fajlnev.jpg');

    expect(response.status).toBe(200);
    expect(lines.length).toBeGreaterThan(0);
    const log = lines.join('\n');
    expect(log).not.toContain('titkos-fajlnev');
    expect(log).not.toContain(sha256(PUDDLE));
    expect(log).not.toContain(PUDDLE_DHASH);
  });
});

describe('POST /api/verify – hibás bemenet (4xx, soha 500)', () => {
  it('fájl nélkül: 400 VALIDATION_ERROR', async () => {
    const response = await request(app).post('/api/verify').field('megjegyzes', 'nincs kép');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ path: 'image', message: 'képfájl kötelező' }],
    });
  });

  it('nem multipart kérés: 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const response = await request(app).post('/api/verify').send({ image: 'nem fájl' });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('nem kép, nem támogatott formátum vagy csonka fájl: 415 UNSUPPORTED_IMAGE', async () => {
    const gif = await sharp(PUDDLE).gif().toBuffer();
    const truncated = PUDDLE.subarray(0, 20_000);

    for (const file of [Buffer.from('ez egy szövegfájl, .jpg néven'), gif, truncated]) {
      const response = await verifyFile(file);
      expect(response.status).toBe(415);
      expect(response.body.error).toEqual({
        code: 'UNSUPPORTED_IMAGE',
        message: 'Csak ép JPEG-, PNG- vagy WebP-kép ellenőrizhető',
      });
    }
  });

  // A feltöltésnél ez 415 (a teljes felbontású előnézet készítésekor derül ki); az ellenőrzés nem
  // dekódolja a teljes képet, a dHash a kicsinyített képből készül – a válasz a látható tartalom
  // alapján születik, szerverhiba nélkül. Itt a kép alsó fele elromlik: a dHash 25 bitben tér el
  // az eredetitől (mérve Windowson: f0e8f2f2b6f3f0f0 → f0e8e6ec68432803), így már nem hasonló. A
  // pontos érték a JPEG-dekóder hibakezelésétől függ, ezért a teszt csak a küszöböt vizsgálja.
  it('a csak teljes dekódoláskor kiderülő sérült képadat sem okoz szerverhibát', async () => {
    await uploadAndRegister(PUDDLE);
    const start = Math.round(PUDDLE.length * 0.5);
    const corrupted = Buffer.concat([PUDDLE.subarray(0, start), PUDDLE.subarray(start + 1000)]);

    const response = await verifyFile(corrupted);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ result: 'NOT_FOUND', sha256: sha256(corrupted) });
    expect(hammingDistance(response.body.data.dHash, PUDDLE_DHASH)).toBeGreaterThan(
      TEST_ENV.DHASH_THRESHOLD,
    );
  });

  it('100 képpontnál kisebb kép: 400 IMAGE_TOO_SMALL; a 100 képpontos még ellenőrizhető', async () => {
    const tooSmall = await sharp(PUDDLE).resize({ width: 99, height: 99, fit: 'fill' }).toBuffer();
    const smallest = await sharp(PUDDLE)
      .resize({ width: 100, height: 100, fit: 'fill' })
      .toBuffer();

    const rejected = await verifyFile(tooSmall);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toEqual({
      code: 'IMAGE_TOO_SMALL',
      message: 'A kép mindkét oldala legalább 100 képpont legyen',
    });
    expect((await verifyFile(smallest)).status).toBe(200);
  });

  it('egyszínű kép: 400 LOW_DETAIL_IMAGE', async () => {
    const flat = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();

    const response = await verifyFile(flat);

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'LOW_DETAIL_IMAGE',
      message: 'A kép gyakorlatilag egyszínű – nem ellenőrizhető',
    });
  });

  it('a megengedettnél nagyobb fájl: 413 PAYLOAD_TOO_LARGE', async () => {
    const smallLimitApp = createTestApp(
      { UPLOAD_DIR: uploadDir, UPLOAD_MAX_BYTES: 10_000 },
      prisma,
      chain,
    );

    const response = await verifyFile(PUDDLE, smallLimitApp);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('két fájl, illetve más mezőnév: 400 INVALID_UPLOAD', async () => {
    const twoFiles = await request(app)
      .post('/api/verify')
      .attach('image', PUDDLE, 'a.jpg')
      .attach('image', CANDLES, 'b.jpg');
    const otherField = await request(app).post('/api/verify').attach('kep', PUDDLE, 'a.jpg');

    for (const response of [twoFiles, otherField]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_UPLOAD');
    }
  });

  it('más webhelyről indított kérés: 403 (CSRF-védelem, mint minden módosító kérésnél)', async () => {
    const response = await request(app)
      .post('/api/verify')
      .set('Sec-Fetch-Site', 'cross-site')
      .attach('image', PUDDLE, 'a.jpg');

    expect(response.status).toBe(403);
  });
});

describe('POST /api/verify – ha a blokklánc nem érhető el', () => {
  it('503 CHAIN_UNAVAILABLE, Retry-After fejléccel, az RPC adatai nélkül', async () => {
    chain.blockchain.getRecord.mockRejectedValueOnce(
      new ChainError('TIMEOUT', 'Időtúllépés: a blokklánc-csomópont 5000 ms alatt nem válaszolt'),
    );

    const response = await verifyFile(PUDDLE);

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe(String(CHAIN_PAUSE_SECONDS));
    expect(response.body).toEqual({
      error: {
        code: 'CHAIN_UNAVAILABLE',
        message: 'A blokklánc most nem érhető el – az ellenőrzés később megismételhető',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(TEST_ENV.RPC_URL);
  });

  it('a hiba után egy percig a láncot nem kérdezi (azonnal 503), utána újra', async () => {
    // A hamis órát az alkalmazás létrehozása ELŐTT kell bekapcsolni: a szolgáltatás a Date.now-t
    // a létrehozásakor jegyzi meg
    vi.useFakeTimers({ toFake: ['Date'] });
    const { target, lines } = appWithLog();
    putOnChain(sha256(PUDDLE), owner.id);
    chain.blockchain.getRecord.mockRejectedValueOnce(new ChainError('UNAVAILABLE', 'HTTP 503'));

    expect((await verifyFile(PUDDLE, target)).status).toBe(503);
    vi.advanceTimersByTime(20_000);
    const paused = await verifyHash(sha256(PUDDLE), target);
    expect(paused.status).toBe(503);
    expect(paused.headers['retry-after']).toBe(String(CHAIN_PAUSE_SECONDS - 20));
    // A szünet alatt a fájlt fel sem dolgozza: a nem kép is 503 (nem 415) – a képbontás CPU-ideje
    // nem vész kárba
    const pausedFile = await verifyFile(Buffer.from('nem kép'), target);
    expect(pausedFile.status).toBe(503);
    expect(pausedFile.body.error.code).toBe('CHAIN_UNAVAILABLE');
    expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(40_000);
    const recovered = await verifyFile(PUDDLE, target);
    expect(recovered.body.data.result).toBe('VERIFIED');
    expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(2);

    const chainWarnings = lines
      .map((line) => JSON.parse(line) as { level: number; reason?: string })
      .filter((entry) => entry.reason !== undefined);
    expect(chainWarnings).toEqual([expect.objectContaining({ level: 40, reason: 'UNAVAILABLE' })]);
  });

  it('a nem a lánctól eredő (váratlan) hiba 500, és nem kapcsolja ki a lánc-ellenőrzést', async () => {
    chain.blockchain.getRecord.mockRejectedValueOnce(new TypeError('váratlan programhiba'));

    expect((await verifyFile(PUDDLE)).status).toBe(500);
    expect((await verifyFile(PUDDLE)).status).toBe(200);
  });
});

describe('GET /api/verify/:sha256', () => {
  it('a regisztrált kép hash-ére VERIFIED (dHash nélkül, mert csak a hash ismert)', async () => {
    const photo = await uploadAndRegister(PUDDLE);

    const response = await verifyHash(photo.sha256);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      result: 'VERIFIED',
      sha256: photo.sha256,
      dHash: null,
      distance: null,
      registration: { txHash: photo.chainTxHash, blockNumber: photo.chainBlockNumber },
      photo: { id: photo.id, photographer: { id: owner.id } },
    });
  });

  it('a nagybetűs és a 0x előtagú (az Etherscanről másolt) hash-t is elfogadja', async () => {
    const photo = await uploadAndRegister(PUDDLE);

    for (const hash of [photo.sha256.toUpperCase(), `0x${photo.sha256}`]) {
      const response = await verifyHash(hash);
      expect(response.body.data).toMatchObject({ result: 'VERIFIED', sha256: photo.sha256 });
    }
  });

  it('ismeretlen hash-re NOT_FOUND – hasonlóságot a hash alapján nem keres', async () => {
    await uploadAndRegister(PUDDLE);
    const unknown = randomHex(32);

    const response = await verifyHash(unknown);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      result: 'NOT_FOUND',
      sha256: unknown,
      dHash: null,
      distance: null,
      registration: null,
      photo: null,
    });
  });

  it.each(['abc', 'z'.repeat(64), '0'.repeat(63), '0'.repeat(65), `0x${'0'.repeat(63)}`])(
    'érvénytelen hash (%s): 400 VALIDATION_ERROR, a lánc megkérdezése nélkül',
    async (hash) => {
      const response = await verifyHash(hash);

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'sha256', message: expect.any(String) }],
      });
      expect(chain.blockchain.getRecord).not.toHaveBeenCalled();
    },
  );

  it('ha a blokklánc nem érhető el: 503 CHAIN_UNAVAILABLE', async () => {
    chain.blockchain.getRecord.mockRejectedValueOnce(new ChainError('TIMEOUT', 'időtúllépés'));

    const response = await verifyHash(randomHex(32));

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CHAIN_UNAVAILABLE');
  });

  it('a kérésnaplóba a hash nem kerül be (csak az útvonal mintája) – nagybetűs útvonalnál sem', async () => {
    const { target, lines } = appWithLog();
    const hash = randomHex(32);

    await verifyHash(hash, target);
    // Az Express az útvonalban nem különbözteti meg a kis- és nagybetűt
    expect((await request(target).get(`/API/VERIFY/${hash}`)).status).toBe(200);
    expect((await request(target).get(`/api/Verify/0x${hash.toUpperCase()}/`)).status).toBe(200);

    const log = lines.join('\n');
    expect(log).toContain('GET /api/verify/:sha256 → 200');
    expect(log.toLowerCase()).not.toContain(hash);
  });

  it.each(['%zz', '%E0%A4%A', '%'])(
    'hibás százalékkódolású útvonal (%s): 400, nem szerverhiba (és nincs hibanapló)',
    async (path) => {
      const { target, lines } = appWithLog();

      const response = await request(target).get(`/api/verify/${path}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const errors = lines
        .map((line) => JSON.parse(line) as { level: number })
        .filter((entry) => entry.level >= 50);
      expect(errors).toEqual([]);
    },
  );

  // Egy idegen oldal <img src="/api/verify/…"> elemmel a látogatói böngészőjéből indíthatna
  // kéréseket – a látogató IP-címének keretét és a közös láncolvasási keretet égetve
  it('más webhelyről indított GET-kérés: 403, az ellenőrzések keretének fogyasztása nélkül', async () => {
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, VERIFY_RATE_LIMIT_MAX: 1 },
      prisma,
      chain,
    );

    for (const site of ['cross-site', 'same-site']) {
      const response = await request(limited)
        .get(`/api/verify/${randomHex(32)}`)
        .set('Sec-Fetch-Site', site);
      expect(response.status).toBe(403);
    }
    expect(chain.blockchain.getRecord).not.toHaveBeenCalled();
    // A saját oldalról indított kérés átmegy – az IP-címenkénti keretből (1) még nem fogyott
    const sameOrigin = await request(limited)
      .get(`/api/verify/${randomHex(32)}`)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(sameOrigin.status).toBe(200);
  });
});

describe('/api/verify – terheléskorlátok', () => {
  it('IP-címenként VERIFY_RATE_LIMIT_MAX ellenőrzés (a POST és a GET együtt), utána 429', async () => {
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, VERIFY_RATE_LIMIT_MAX: 2 },
      prisma,
      chain,
    );

    expect((await verifyHash(randomHex(32), limited)).status).toBe(200);
    expect((await verifyFile(PUDDLE, limited)).status).toBe(200);
    const response = await verifyHash(randomHex(32), limited);

    expect(response.status).toBe(429);
    expect(response.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Túl sok ellenőrzés – próbáld újra később',
    });
    // A korláton felüli kérés már nem jut el a láncig
    expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(2);
  });

  it('minden kliensre együtt VERIFY_CHAIN_READ_LIMIT láncolvasás, utána 503 SERVER_BUSY (Retry-After)', async () => {
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, VERIFY_CHAIN_READ_LIMIT: 1 },
      prisma,
      chain,
    );

    // A láncot nem olvasó (hibás) kérések nem fogyasztják a közös keretet
    expect((await verifyHash('nem-hash', limited)).status).toBe(400);
    expect((await verifyFile(Buffer.from('nem kép'), limited)).status).toBe(415);
    expect((await verifyHash(randomHex(32), limited)).status).toBe(200);
    // A keret elfogyása után a fájlt fel sem dolgozza (a nem kép is 503, nem 415)
    expect((await verifyFile(Buffer.from('nem kép'), limited)).status).toBe(503);
    const response = await verifyHash(randomHex(32), limited);

    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'SERVER_BUSY',
      message: 'A szerver most túl sok ellenőrzést kapott – próbáld újra később',
    });
    // A korlát időablakának végéig (nem a 503-as válaszok általános 5 másodperce)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(5);
    expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(1);
  });

  it('IP-címenként egyszerre egy fájl-ellenőrzés: a második egyidejű kérés 429', async () => {
    const gate = deferred();
    chain.blockchain.getRecord.mockImplementationOnce(async () => {
      await gate.promise;
      return null;
    });

    const first = verifyFile(PUDDLE).then((response) => response);
    await vi.waitFor(() => expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(1), {
      timeout: WAIT_FOR_ANALYSIS_MS,
    });
    const second = await verifyFile(CANDLES);
    gate.resolve();

    expect(second.status).toBe(429);
    expect(second.body.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Egyszerre csak egy ellenőrzésed lehet folyamatban – várd meg, amíg elkészül',
    });
    expect((await first).status).toBe(200);
  });

  it('egyszerre összesen VERIFY_MAX_CONCURRENT fájl-ellenőrzés: a többi kliens 503 SERVER_BUSY', async () => {
    // Élesben (proxy mögött) a kliens címét az X-Forwarded-For adja – így két kliens szimulálható
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, NODE_ENV: 'production', VERIFY_MAX_CONCURRENT: 1 },
      prisma,
      chain,
    );
    const gate = deferred();
    chain.blockchain.getRecord.mockImplementationOnce(async () => {
      await gate.promise;
      return null;
    });
    const fromClient = (ip: string, image: Buffer) =>
      request(limited)
        .post('/api/verify')
        .set('X-Forwarded-For', ip)
        .attach('image', image, 'a.jpg');

    const first = fromClient('203.0.113.1', PUDDLE).then((response) => response);
    await vi.waitFor(() => expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(1), {
      timeout: WAIT_FOR_ANALYSIS_MS,
    });
    const second = await fromClient('203.0.113.2', CANDLES);
    gate.resolve();

    expect(second.status).toBe(503);
    expect(second.body.error).toEqual({
      code: 'SERVER_BUSY',
      message: 'A szerver most túl sok ellenőrzést fogad – próbáld újra kicsit később',
    });
    expect((await first).status).toBe(200);
  });

  it('az ellenőrzés nem tartja fel a feltöltést (nem a feltöltési sorban fut)', async () => {
    const gate = deferred();
    chain.blockchain.getRecord.mockImplementationOnce(async () => {
      await gate.promise;
      return null;
    });

    const pendingVerification = verifyFile(CANDLES).then((response) => response);
    await vi.waitFor(() => expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(1), {
      timeout: WAIT_FOR_ANALYSIS_MS,
    });
    const photo = await uploadAndRegister(PUDDLE);
    gate.resolve();

    expect(photo.status).toBe('REGISTERED');
    expect((await pendingVerification).status).toBe(200);
  });

  it('a lánc szünetelése alatt a fájlt be sem olvassa: már a törzs fogadása előtt 503', async () => {
    const { target } = appWithLog();
    chain.blockchain.getRecord.mockRejectedValueOnce(new ChainError('UNAVAILABLE', 'HTTP 503'));
    expect((await verifyHash(randomHex(32), target)).status).toBe(503);

    // Nem multipart törzs: a fájlfogadás 415-öt adna – a 503 azt mutatja, hogy oda el sem jutott
    const response = await request(target).post('/api/verify').send({ image: 'nem fájl' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CHAIN_UNAVAILABLE');
  });

  it('a lassan csepegtetett fájl a határidő (VERIFY_BODY_TIMEOUT_MS) után kapcsolatbontást kap, és a hely felszabadul', async () => {
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, VERIFY_BODY_TIMEOUT_MS: 1_500, VERIFY_MAX_CONCURRENT: 1 },
      prisma,
      chain,
    );
    const server = limited.listen(0);
    await once(server, 'listening');
    try {
      const { port } = server.address() as AddressInfo;
      // Ugyanarról a címről, mint a Supertest kérései (így az IP-kulcs is ugyanaz)
      const slow = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/api/verify',
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=PhotoChainHatar',
          'Content-Length': '100000',
        },
      });
      const failed = once(slow, 'error');
      // A bejelentett törzsnek csak az eleje érkezik meg – a többi sosem. Megvárjuk, hogy elmenjen,
      // és a szerver a fájl fogadásáig jusson (addigra a helyet már lefoglalta)
      await new Promise<void>((sent) => {
        slow.write(
          '--PhotoChainHatar\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\n',
          () => sent(),
        );
      });
      await sleep(300);

      // Amíg csepeg, a helyet foglalja: egy másik ellenőrzés ugyanarról a címről 429
      expect((await verifyFile(CANDLES, limited)).status).toBe(429);

      const [error] = (await failed) as [NodeJS.ErrnoException];
      expect(error.code).toBe('ECONNRESET');
      // A határidő után a hely felszabadul: a következő ellenőrzés rendben lefut
      await vi.waitFor(async () => expect((await verifyFile(PUDDLE, limited)).status).toBe(200), {
        timeout: WAIT_FOR_ANALYSIS_MS,
      });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('a láncolvasások közös kerete és a rekordok megjegyzése', () => {
  /** A szolgáltatás állítható órával és kis kerettel (2 olvasás / 1 másodperc). */
  function serviceWithClock(clock: { now: number }, rememberedRecordLimit?: number) {
    return createVerificationService({
      prisma,
      storage: createLocalStorage(uploadDir),
      logger: pino({ level: 'silent' }),
      blockchain: chain.blockchain,
      dHashThreshold: TEST_ENV.DHASH_THRESHOLD,
      chainId: TEST_ENV.CHAIN_ID,
      chainReadLimit: { limit: 2, windowMs: 1_000 },
      imageWork: createImageWork(1),
      rememberedRecordLimit,
      now: () => clock.now,
    });
  }

  it('a láncon nem talált hash-t nem jegyzi meg: később regisztrálva már VERIFIED', async () => {
    const clock = { now: 1_000_000 };
    const service = serviceWithClock(clock);
    const later = randomHex(32);

    await expect(service.verifyHash(later)).resolves.toMatchObject({ result: 'NOT_FOUND' });
    putOnChain(later, owner.id);
    await expect(service.verifyHash(later)).resolves.toMatchObject({ result: 'VERIFIED' });

    expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(2);
  });

  it('a megjegyzett rekordok száma korlátos: betelt helynél a legrégebbi esik ki', async () => {
    const clock = { now: 1_000_000 };
    const service = serviceWithClock(clock, 1);
    const [first, second] = [randomHex(32), randomHex(32)];
    putOnChain(first, owner.id);
    putOnChain(second, owner.id);

    await service.verifyHash(first);
    await service.verifyHash(second);
    clock.now += 1_000;
    await service.verifyHash(second);
    await service.verifyHash(first);

    const reads = chain.blockchain.getRecord.mock.calls.map(([hash]) => hash);
    expect(reads).toEqual([first, second, first]);
  });

  it('az időablak lejártával a keret újraindul; a programhibával végződő olvasás is fogyaszt', async () => {
    const clock = { now: 1_000_000 };
    const service = serviceWithClock(clock);

    await expect(service.verifyHash(randomHex(32))).resolves.toMatchObject({ result: 'NOT_FOUND' });
    chain.blockchain.getRecord.mockRejectedValueOnce(new TypeError('programhiba'));
    await expect(service.verifyHash(randomHex(32))).rejects.toThrow(TypeError);
    clock.now += 400;
    await expect(service.verifyHash(randomHex(32))).rejects.toMatchObject({
      code: 'SERVER_BUSY',
      retryAfterSeconds: 1,
    });

    clock.now += 600;
    await expect(service.verifyHash(randomHex(32))).resolves.toMatchObject({ result: 'NOT_FOUND' });
    expect(chain.blockchain.getRecord).toHaveBeenCalledTimes(3);
  });

  it('a láncon megtalált rekordot megjegyzi: újra nem olvassa, és a keret elfogyása vagy szünet alatt is VERIFIED', async () => {
    const clock = { now: 1_000_000 };
    const service = serviceWithClock(clock);
    const known = randomHex(32);
    putOnChain(known, owner.id);

    await expect(service.verifyHash(known)).resolves.toMatchObject({ result: 'VERIFIED' });
    await expect(service.verifyHash(randomHex(32))).resolves.toMatchObject({ result: 'NOT_FOUND' });
    // A keret elfogyott – a már ismert rekordhoz nem kell láncolvasás
    await expect(service.verifyHash(randomHex(32))).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    await expect(service.verifyHash(known)).resolves.toMatchObject({ result: 'VERIFIED' });
    // A lánc szünetelése alatt is
    clock.now += 1_000;
    chain.blockchain.getRecord.mockRejectedValueOnce(new ChainError('TIMEOUT', 'időtúllépés'));
    await expect(service.verifyHash(randomHex(32))).rejects.toMatchObject({
      code: 'CHAIN_UNAVAILABLE',
    });
    await expect(service.verifyHash(known)).resolves.toMatchObject({
      result: 'VERIFIED',
      registration: { registeredAt: CHAIN_REGISTERED_AT },
    });

    expect(chain.blockchain.getRecord.mock.calls.filter(([hash]) => hash === known)).toHaveLength(
      1,
    );
  });
});

// L32: a fájl vizsgálata (képbontás) a közös képfeldolgozási soron fut
describe('közös képfeldolgozási sor (L32)', () => {
  it('a hitelesség-ellenőrzés képvizsgálata a soron át fut', async () => {
    let calls = 0;
    const imageWork: ImageWork = async (task) => {
      calls += 1;
      return task();
    };
    const service = createVerificationService({
      prisma,
      storage: createLocalStorage(uploadDir),
      logger: pino({ level: 'silent' }),
      blockchain: chain.blockchain,
      dHashThreshold: TEST_ENV.DHASH_THRESHOLD,
      chainId: TEST_ENV.CHAIN_ID,
      chainReadLimit: { limit: 100, windowMs: 60_000 },
      imageWork,
    });

    await service.verifyFile(PUDDLE);

    expect(calls).toBe(1);
  });
});
