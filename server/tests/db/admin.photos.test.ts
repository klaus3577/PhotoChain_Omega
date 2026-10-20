// Az admin képkezelése a tesztadatbázison, ideiglenes tárhelymappával és a saját tesztfotókkal
// (terv 5.1, L16): a képek listája állapot szerint (GET /api/admin/photos), az elrejtés és a
// visszaállítás (PATCH /api/admin/photos/:id) és a sikertelen lánc-regisztráció újrapróbálása
// (POST /api/admin/photos/:id/retry-registration).
// - Visszaállítani csak az admin által elrejtett képet lehet (a tulajdonos döntését az admin nem írja
//   felül, szerzői döntés, 2026-10-06); a nyilvános fájlok (előnézet, bélyegkép) az eredetiből
//   újra elkészülnek; a regisztrált kép újra nyilvános, a regisztráció nélküli CHAIN_FAILED lesz.
import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';

import type { Express } from 'express';
import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { ChainError } from '../../src/services/blockchain.service.js';
import { PREVIEW_MAX_EDGE_PX, THUMBNAIL_MAX_EDGE_PX } from '../../src/services/image.service.js';
import { restrictImageDecoders } from '../../src/services/imageDecoding.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import type { StorageService } from '../../src/services/storage/storage.types.js';
import { randomTxHash } from '../helpers/fakeBlockchain.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import { databaseDown, intercepting } from '../helpers/intercepting.js';
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
  type PhotoFixture,
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

let prisma: PrismaClient;
let uploadDir: string;
let app: Express;
let chain: TestChain;
let owner: { id: string };
let ownerCookie: string;
let admin: { id: string };
let adminCookie: string;
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
  owner = await createUser(prisma, 'fanni@photochain.test', { displayName: 'Fotós Fanni' });
  ownerCookie = sessionCookieFor(owner.id);
  admin = await createUser(prisma, 'admin@photochain.test', { role: 'ADMIN' });
  adminCookie = sessionCookieFor(admin.id);
  categoryId = (await createCategory(prisma)).id;
});

// A háttérben futó lánc-regisztráció a teszt végéig befejeződik (nem nyúl át a következő tesztbe)
afterEach(() => chain.photoRegistration.whenIdle());

/** Időpont 2026 októberének megadott napján – a rendezési tesztekhez. */
const onDay = (day: number): Date => new Date(Date.UTC(2026, 9, day, 10));

const photoOf = (fixture: Partial<PhotoFixture> = {}) =>
  createPhoto(prisma, { ownerId: owner.id, categoryId, ...fixture });

const storedPhoto = (id: string) => prisma.photo.findUniqueOrThrow({ where: { id } });

/** A kép SHA-256 ujjlenyomata (a lánchiba ehhez a képhez rendelhető). */
const sha256Of = (image: Buffer): string => createHash('sha256').update(image).digest('hex');

const listPhotos = (query = '') =>
  request(app).get(`/api/admin/photos${query}`).set('Cookie', adminCookie);

const patchPhoto = (id: string, body: unknown, cookie = adminCookie, target: Express = app) =>
  request(target)
    .patch(`/api/admin/photos/${id}`)
    .set('Cookie', cookie)
    .send(body as object);

const retry = (id: string, cookie = adminCookie, target: Express = app) =>
  request(target).post(`/api/admin/photos/${id}/retry-registration`).set('Cookie', cookie);

const idsOf = (response: request.Response): string[] =>
  (response.body.data.photos as Array<{ id: string }>).map((photo) => photo.id);

/** Feltöltés a tulajdonos nevében, a valódi fájlokkal (a regisztráció a háttérben indul). */
async function upload(image: Buffer = PUDDLE): Promise<string> {
  const response = await request(app)
    .post('/api/photos')
    .set('Cookie', ownerCookie)
    .field('title', 'Tócsa')
    .field('priceHuf', '2500')
    .field('categoryId', String(categoryId))
    .attach('image', image, 'feltoltes.jpg');
  expect(response.status).toBe(201);
  return response.body.data.photo.id as string;
}

/** Feltöltés, megvárva a (sikeres vagy sikertelen) lánc-regisztrációt. */
async function uploadAndSettle(image: Buffer = PUDDLE) {
  const id = await upload(image);
  await chain.photoRegistration.whenIdle();
  return storedPhoto(id);
}

/** A kép nyilvános fájljainak helye a tárhelymappában (a listStoredFiles alakjában). */
const publicFilesOf = (photo: { previewKey: string; thumbnailKey: string }): string[] => [
  `public/${photo.previewKey}`,
  `public/${photo.thumbnailKey}`,
];

/** Az alkalmazás a megadott Prisma-klienssel, amelynek naplósorai (info szinttől) olvashatók. */
function appWithLog(client: PrismaClient = prisma): { target: Express; lines: string[] } {
  const lines: string[] = [];
  const target = createApp({
    env: { ...TEST_ENV, UPLOAD_DIR: uploadDir },
    logger: pino({ level: 'info' }, { write: (line: string) => lines.push(line) }),
    prisma: client,
    storage: createLocalStorage(uploadDir),
    blockchain: chain.blockchain,
    photoRegistration: chain.photoRegistration,
    payments: createFakePayments().payments,
  });
  return { target, lines };
}

const logEntries = (lines: string[]): Array<Record<string, unknown>> =>
  lines.map((line) => JSON.parse(line) as Record<string, unknown>);

/**
 * Versenyhelyzet: a kép állapotának írása (updateMany) előtt a tulajdonos is elrejti a képet –
 * mintha a visszaállítás közben a saját döntésével is levenné.
 */
const ownerHidingBeforeWrite = (client: PrismaClient, photoId: string): PrismaClient =>
  intercepting(client, 'photo', 'updateMany', (target) =>
    target.photo.update({ where: { id: photoId }, data: { hiddenBy: 'OWNER_AND_ADMIN' } }),
  );

describe('GET /api/admin/photos', () => {
  it('minden állapotú kép, a legújabb elöl, a moderáláshoz szükséges adatokkal', async () => {
    const txHash = randomTxHash();
    const registered = await photoOf({
      status: 'REGISTERED',
      chainTxHash: txHash,
      registeredAt: onDay(2),
      createdAt: onDay(2),
    });
    const hidden = await photoOf({ status: 'HIDDEN', hiddenBy: 'ADMIN', createdAt: onDay(3) });
    const failed = await photoOf({ status: 'CHAIN_FAILED', createdAt: onDay(4) });

    const response = await listPhotos();

    expect(response.status).toBe(200);
    expect(idsOf(response)).toEqual([failed.id, hidden.id, registered.id]);
    expect(response.body.data.photos[2]).toMatchObject({
      id: registered.id,
      status: 'REGISTERED',
      hiddenBy: null,
      thumbnailUrl: `/media/${registered.thumbnailKey}`,
      owner: { id: owner.id, displayName: 'Fotós Fanni', isBlocked: false },
      chainTxHash: txHash,
      registeredAt: onDay(2).toISOString(),
    });
    // Az elrejtett kép bélyegképe törlődött: nincs URL-je; látszik, ki rejtette el
    expect(response.body.data.photos[1]).toMatchObject({
      status: 'HIDDEN',
      hiddenBy: 'ADMIN',
      thumbnailUrl: null,
    });
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    // Az eredeti fájl kulcsa és a gázadat nem kerül a válaszba
    expect(JSON.stringify(response.body)).not.toMatch(/originalKey|originals\/|gasUsed/);
  });

  it('szűrés állapot szerint (pl. az újrapróbálandó CHAIN_FAILED képek), lapozással', async () => {
    const failed = [];
    for (const day of [1, 2, 3]) {
      failed.push(await photoOf({ status: 'CHAIN_FAILED', createdAt: onDay(day) }));
    }
    await photoOf({ status: 'REGISTERED' });

    const first = await listPhotos('?status=CHAIN_FAILED&pageSize=2');
    const second = await listPhotos('?status=CHAIN_FAILED&pageSize=2&page=2');

    expect(idsOf(first)).toEqual([failed[2]!.id, failed[1]!.id]);
    expect(idsOf(second)).toEqual([failed[0]!.id]);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('a letiltott fotós képei is szerepelnek (a tiltás jelölésével)', async () => {
    const photo = await photoOf({ status: 'REGISTERED' });
    await prisma.user.update({ where: { id: owner.id }, data: { isBlocked: true } });

    const response = await listPhotos();

    expect(idsOf(response)).toEqual([photo.id]);
    expect(response.body.data.photos[0].owner.isBlocked).toBe(true);
  });

  it('ismeretlen állapot vagy hibás lapozás: 400 VALIDATION_ERROR', async () => {
    for (const query of ['?status=hidden', '?status=DELETED', '?page=1001']) {
      const response = await listPhotos(query);

      expect(response.status, query).toBe(400);
      expect(response.body.error.code, query).toBe('VALIDATION_ERROR');
    }
  });
});

describe('PATCH /api/admin/photos/:id – elrejtés', () => {
  it('az admin elrejti a fotós képét: HIDDEN (ADMIN), a nyilvános fájlok törlődnek, a naplóba kerül', async () => {
    const photo = await uploadAndSettle();
    const { target, lines } = appWithLog();

    const response = await patchPhoto(photo.id, { hidden: true }, adminCookie, target);

    expect(response.status).toBe(200);
    expect(response.body.data.photo).toMatchObject({
      id: photo.id,
      status: 'HIDDEN',
      hiddenBy: 'ADMIN',
      thumbnailUrl: null,
    });
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
    expect((await request(app).get(`/api/photos/${photo.id}`)).status).toBe(404);
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({ photoId: photo.id, actorId: admin.id, hiddenBy: 'ADMIN' }),
    );
  });

  it('ha a nyitott fizetések lezárása hibára fut: 500 (naplózva), de a nyilvános fájlok akkor is törlődnek', async () => {
    const photo = await uploadAndSettle();
    const { target, lines } = appWithLog(intercepting(prisma, 'order', 'findMany', databaseDown));

    const response = await patchPhoto(photo.id, { hidden: true }, adminCookie, target);

    expect(response.status).toBe(500);
    expect((await storedPhoto(photo.id)).status).toBe('HIDDEN');
    // A levétel lényege – a nyilvános fájlok törlése – nem marad el
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({
        photoId: photo.id,
        level: 50,
        msg: expect.stringMatching(/fizet/),
      }),
    );
  });

  it('a tulajdonos által elrejtett képen is rögzül a moderátori levétel (mindkettőjük döntése)', async () => {
    const photo = await photoOf({ status: 'HIDDEN', hiddenBy: 'OWNER' });

    const response = await patchPhoto(photo.id, { hidden: true });

    expect(response.status).toBe(200);
    expect(response.body.data.photo.hiddenBy).toBe('OWNER_AND_ADMIN');
    expect((await storedPhoto(photo.id)).hiddenBy).toBe('OWNER_AND_ADMIN');
  });

  it('ha a kép állapota az elrejtés közben változik (pl. lezárul a regisztráció), a friss állapotból rejti el', async () => {
    const photo = await photoOf({ status: 'CHAIN_FAILED' });
    let changed = false;
    const registeredMeanwhile = intercepting(prisma, 'photo', 'updateMany', async (target) => {
      if (changed) return;
      changed = true;
      await target.photo.update({
        where: { id: photo.id },
        data: { status: 'REGISTERED', registeredAt: new Date() },
      });
    });
    const { target } = appWithLog(registeredMeanwhile);

    const response = await patchPhoto(photo.id, { hidden: true }, adminCookie, target);

    expect(response.status).toBe(200);
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
  });

  it('ha a kép állapota minden kísérletnél megváltozik: 409 (próbáld újra)', async () => {
    const photo = await photoOf({ status: 'REGISTERED' });
    // Minden írás előtt átvált a két állapot között – a feltételes írás így sosem talál
    const alwaysChanging = intercepting(prisma, 'photo', 'updateMany', async (target) => {
      const { status } = await target.photo.findUniqueOrThrow({ where: { id: photo.id } });
      await target.photo.update({
        where: { id: photo.id },
        data: { status: status === 'REGISTERED' ? 'CHAIN_FAILED' : 'REGISTERED' },
      });
    });
    const { target } = appWithLog(alwaysChanging);

    const response = await patchPhoto(photo.id, { hidden: true }, adminCookie, target);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect((await storedPhoto(photo.id)).status).not.toBe('HIDDEN');
  });

  it('az admin a saját képét tulajdonosként rejti el', async () => {
    const own = await createPhoto(prisma, { ownerId: admin.id, categoryId, status: 'REGISTERED' });

    await patchPhoto(own.id, { hidden: true }).expect(200);

    expect(await storedPhoto(own.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'OWNER' });
  });

  it('ismeretlen kép 404, érvénytelen azonosító 400, hibás törzs 400 – semmi nem változik', async () => {
    const photo = await photoOf({ status: 'REGISTERED' });

    expect((await patchPhoto(UNKNOWN_USER_ID, { hidden: true })).status).toBe(404);
    expect((await patchPhoto('abc', { hidden: true })).status).toBe(400);
    for (const body of [{}, { hidden: 'true' }, { hidden: true, status: 'HIDDEN' }]) {
      expect((await patchPhoto(photo.id, body)).status).toBe(400);
    }
    expect((await storedPhoto(photo.id)).status).toBe('REGISTERED');
  });
});

describe('PATCH /api/admin/photos/:id – visszaállítás', () => {
  it('az admin által elrejtett regisztrált kép újra nyilvános; az előnézet és a bélyegkép újra elkészül', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const { target, lines } = appWithLog();

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(200);
    expect(response.body.data.photo).toMatchObject({
      id: photo.id,
      status: 'REGISTERED',
      hiddenBy: null,
      thumbnailUrl: `/media/${photo.thumbnailKey}`,
    });
    expect(await storedPhoto(photo.id)).toMatchObject({
      status: 'REGISTERED',
      hiddenBy: null,
      registeredAt: photo.registeredAt,
      chainTxHash: photo.chainTxHash,
    });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
    // A fájlok ugyanazzal az eljárással készülnek, mint a feltöltéskor: JPEG, a megengedett méretben
    const storage = createLocalStorage(uploadDir);
    const preview = await sharp(await storage.read(photo.previewKey)).metadata();
    const thumbnail = await sharp(await storage.read(photo.thumbnailKey)).metadata();
    expect(preview.format).toBe('jpeg');
    expect(Math.max(preview.width, preview.height)).toBe(PREVIEW_MAX_EDGE_PX);
    expect(Math.max(thumbnail.width, thumbnail.height)).toBe(THUMBNAIL_MAX_EDGE_PX);
    // A galéria és a nyilvános fájl-kiszolgálás is újra mutatja
    const detail = await request(app).get(`/api/photos/${photo.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.photo.certificate).not.toBeNull();
    const served = await request(app).get(detail.body.data.photo.previewUrl as string);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({ photoId: photo.id, actorId: admin.id, status: 'REGISTERED' }),
    );
  });

  it('a lánc-regisztráció nélküli kép CHAIN_FAILED állapotba kerül (újrapróbálható, nem nyilvános)', async () => {
    chain.failRegistration(sha256Of(PUDDLE), new ChainError('UNAVAILABLE', 'a lánc nem érhető el'));
    const photo = await uploadAndSettle();
    expect(photo.status).toBe('CHAIN_FAILED');
    await patchPhoto(photo.id, { hidden: true }).expect(200);

    const response = await patchPhoto(photo.id, { hidden: false });

    expect(response.status).toBe(200);
    expect(response.body.data.photo).toMatchObject({ status: 'CHAIN_FAILED', hiddenBy: null });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
    expect((await request(app).get(`/api/photos/${photo.id}`)).status).toBe(404);
  });

  it('a tulajdonos által elrejtett kép nem állítható vissza: 409, rejtett marad, fájl sem készül', async () => {
    const photo = await uploadAndSettle();
    await request(app).delete(`/api/photos/${photo.id}`).set('Cookie', ownerCookie).expect(204);

    const response = await patchPhoto(photo.id, { hidden: false });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'OWNER' });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('ha a tulajdonos is elrejti az admin által levett képet, a levétel megmarad (nem szüntetheti meg)', async () => {
    const photo = await photoOf({ status: 'HIDDEN', hiddenBy: 'ADMIN' });

    await request(app).delete(`/api/photos/${photo.id}`).set('Cookie', ownerCookie).expect(204);

    expect((await storedPhoto(photo.id)).hiddenBy).toBe('OWNER_AND_ADMIN');
  });

  it('a mindkettőjük által elrejtett képnél az admin csak a saját levételét oldja fel: a kép rejtett marad', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    await request(app).delete(`/api/photos/${photo.id}`).set('Cookie', ownerCookie).expect(204);
    const { target, lines } = appWithLog();

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(200);
    expect(response.body.data.photo).toMatchObject({ status: 'HIDDEN', hiddenBy: 'OWNER' });
    // A tulajdonos döntése szerint rejtett marad: nyilvános fájl sem készül
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({ photoId: photo.id, actorId: admin.id, hiddenBy: 'OWNER' }),
    );
    // Ismét: már csak a tulajdonos döntése van érvényben – azt az admin nem írja felül
    expect((await patchPhoto(photo.id, { hidden: false })).status).toBe(409);
  });

  it('ha a levétel feloldása közben a kép állapota megváltozik: 409', async () => {
    const photo = await photoOf({ status: 'HIDDEN', hiddenBy: 'OWNER_AND_ADMIN' });
    const changedMeanwhile = intercepting(prisma, 'photo', 'updateMany', (target) =>
      target.photo.update({ where: { id: photo.id }, data: { hiddenBy: 'OWNER' } }),
    );
    const { target } = appWithLog(changedMeanwhile);

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(409);
    expect((await storedPhoto(photo.id)).hiddenBy).toBe('OWNER');
  });

  it('a nem rejtett kép visszaállítása sikeres, és nem változtat semmin', async () => {
    const photo = await uploadAndSettle();

    const response = await patchPhoto(photo.id, { hidden: false });

    expect(response.status).toBe(200);
    expect(response.body.data.photo).toMatchObject({ status: 'REGISTERED', hiddenBy: null });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
  });

  it('ha az eredeti fájl hiányzik: 500 (naplózva), a kép rejtett marad, nyilvános fájl nem marad', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    await createLocalStorage(uploadDir).delete(photo.originalKey);
    const { target, lines } = appWithLog();

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
    expect(listStoredFiles(uploadDir)).toEqual([]);
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({ photoId: photo.id, level: 50 }),
    );
  });

  it('ha a félbemaradt visszaállítás után a takarítás sem sikerül, az is a naplóba kerül (a válasz 500)', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const local = createLocalStorage(uploadDir);
    const brokenStorage: StorageService = {
      ...local,
      read: async () => Promise.reject(new Error('a tárhely nem érhető el')),
      delete: async () => Promise.reject(new Error('a tárhely nem érhető el')),
    };
    const lines: string[] = [];
    const target = createApp({
      env: { ...TEST_ENV, UPLOAD_DIR: uploadDir },
      logger: pino({ level: 'error' }, { write: (line: string) => lines.push(line) }),
      prisma,
      storage: brokenStorage,
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(500);
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({ photoId: photo.id, keys: [photo.previewKey, photo.thumbnailKey] }),
    );
  });

  it('ha közben (pl. egy másik szerverpéldányon) már visszaállították: 409, a nyilvános fájlok megmaradnak', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const restoredMeanwhile = intercepting(prisma, 'photo', 'updateMany', (target) =>
      target.photo.update({
        where: { id: photo.id },
        data: { status: 'REGISTERED', hiddenBy: null },
      }),
    );
    const { target } = appWithLog(restoredMeanwhile);

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(409);
    expect((await storedPhoto(photo.id)).status).toBe('REGISTERED');
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
  });

  it('ha az állapot írása hibára fut: 500, a kép rejtett marad, és nyilvános fájl sem marad', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const { target } = appWithLog(intercepting(prisma, 'photo', 'updateMany', databaseDown));

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(500);
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN' });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('ha az írás sikerül, de a válasza elvész (pl. megszakad a kapcsolat): 500, a már nyilvános kép fájljai megmaradnak', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    // Az írás lefut (mintha a COMMIT megtörtént volna), a hívó mégis hibát kap
    const committedThenLost = intercepting(prisma, 'photo', 'updateMany', async (target) => {
      await target.photo.update({
        where: { id: photo.id },
        data: { status: 'REGISTERED', hiddenBy: null },
      });
      await databaseDown();
    });
    const { target } = appWithLog(committedThenLost);

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(500);
    expect((await storedPhoto(photo.id)).status).toBe('REGISTERED');
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
  });

  it('ha a lánc-regisztráció a visszaállítás közben zárul le: 409, az újabb kísérlet már REGISTERED-et ad', async () => {
    chain.failRegistration(sha256Of(PUDDLE), new ChainError('UNAVAILABLE', 'a lánc nem érhető el'));
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const registeredMeanwhile = intercepting(prisma, 'photo', 'updateMany', (target) =>
      target.photo.update({ where: { id: photo.id }, data: { registeredAt: new Date() } }),
    );
    const { target } = appWithLog(registeredMeanwhile);

    const conflict = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);
    const retried = await patchPhoto(photo.id, { hidden: false });

    expect(conflict.status).toBe(409);
    expect(retried.status).toBe(200);
    expect(retried.body.data.photo.status).toBe('REGISTERED');
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
  });

  it('a visszaállítások képfeldolgozása a közös soron egymás után fut (egy hellyel, L32)', async () => {
    const first = await uploadAndSettle(PUDDLE);
    const second = await uploadAndSettle(CANDLES);
    for (const photo of [first, second]) await patchPhoto(photo.id, { hidden: true }).expect(200);
    const gate = deferred();
    const local = createLocalStorage(uploadDir);
    let reads = 0;
    const slowStorage: StorageService = {
      ...local,
      async read(key) {
        reads += 1;
        await gate.promise;
        return local.read(key);
      },
    };
    const target = createApp({
      env: { ...TEST_ENV, UPLOAD_DIR: uploadDir, IMAGE_PROCESSING_CONCURRENCY: 1 },
      logger: pino({ level: 'silent' }),
      prisma,
      storage: slowStorage,
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });

    const restores = [first, second].map((photo) =>
      patchPhoto(photo.id, { hidden: false }, adminCookie, target).then((r) => r),
    );
    await vi.waitFor(() => expect(reads).toBe(1));
    // A második kép eredetije addig be sem olvasódik, amíg az első feldolgozása tart
    await new Promise((resolve) => setTimeout(resolve, 300));
    const readsWhileFirstRuns = reads;
    gate.resolve();
    const responses = await Promise.all(restores);

    expect(readsWhileFirstRuns).toBe(1);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(reads).toBe(2);
  });

  // L32 kódátnézés: a sor valóban közös – egy hellyel a hitelesség-ellenőrzés képbontása is
  // megvárja a folyamatban lévő visszaállítást
  it('a visszaállítás és a hitelesség-ellenőrzés ugyanazt a közös sort használja (egy hellyel)', async () => {
    const photo = await uploadAndSettle(PUDDLE);
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const gate = deferred();
    const local = createLocalStorage(uploadDir);
    let reads = 0;
    const slowStorage: StorageService = {
      ...local,
      async read(key) {
        reads += 1;
        await gate.promise;
        return local.read(key);
      },
    };
    const target = createApp({
      env: { ...TEST_ENV, UPLOAD_DIR: uploadDir, IMAGE_PROCESSING_CONCURRENCY: 1 },
      logger: pino({ level: 'silent' }),
      prisma,
      storage: slowStorage,
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });

    const restore = patchPhoto(photo.id, { hidden: false }, adminCookie, target).then((r) => r);
    await vi.waitFor(() => expect(reads).toBe(1));
    let verified = false;
    const verify = request(target)
      .post('/api/verify')
      .attach('image', CANDLES, 'gyertyak.jpg')
      .then((response) => {
        verified = true;
        return response;
      });
    // Amíg a visszaállítás a soron van, az ellenőrzés képbontása nem indul el
    await new Promise((resolve) => setTimeout(resolve, 300));
    const verifiedWhileRestoreRuns = verified;
    gate.resolve();
    const [restoreResponse, verifyResponse] = await Promise.all([restore, verify]);

    expect(verifiedWhileRestoreRuns).toBe(false);
    expect(restoreResponse.status).toBe(200);
    expect(verifyResponse.status).toBe(200);
  });

  it('ha a tulajdonos közben maga is elrejti: 409, és a már elkészült nyilvános fájlok törlődnek', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    const { target } = appWithLog(ownerHidingBeforeWrite(prisma, photo.id));

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(409);
    expect(await storedPhoto(photo.id)).toMatchObject({
      status: 'HIDDEN',
      hiddenBy: 'OWNER_AND_ADMIN',
    });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('ha az ütközés után a kép állapota sem olvasható: a nyilvános fájlok biztonságból akkor is törlődnek', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    // Az első olvasás (a visszaállítás eleje) sikerül, a takarítás előtti már nem
    let reads = 0;
    const statusUnreadable = intercepting(
      ownerHidingBeforeWrite(prisma, photo.id),
      'photo',
      'findUnique',
      async () => {
        reads += 1;
        if (reads > 1) await databaseDown();
      },
    );
    const { target } = appWithLog(statusUnreadable);

    const response = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);

    expect(response.status).toBe(409);
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('ismeretlen kép 404', async () => {
    expect((await patchPhoto(UNKNOWN_USER_ID, { hidden: false })).status).toBe(404);
  });

  it('ugyanannak a képnek egyszerre csak egy visszaállítása fut: a közben érkező második 409', async () => {
    const photo = await uploadAndSettle();
    await patchPhoto(photo.id, { hidden: true }).expect(200);
    // Az első visszaállítás az eredeti fájl beolvasásánál vár, amíg a teszt el nem engedi
    const gate = deferred();
    const local = createLocalStorage(uploadDir);
    let reads = 0;
    const slowStorage: StorageService = {
      ...local,
      async read(key) {
        reads += 1;
        await gate.promise;
        return local.read(key);
      },
    };
    const target = createApp({
      env: { ...TEST_ENV, UPLOAD_DIR: uploadDir },
      logger: pino({ level: 'silent' }),
      prisma,
      storage: slowStorage,
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });

    const first = patchPhoto(photo.id, { hidden: false }, adminCookie, target).then((r) => r);
    await vi.waitFor(() => expect(reads).toBe(1));
    const second = await patchPhoto(photo.id, { hidden: false }, adminCookie, target);
    gate.resolve();

    expect(second.status).toBe(409);
    expect((await first).status).toBe(200);
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'REGISTERED', hiddenBy: null });
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey, ...publicFilesOf(photo)]);
  });

  it('a visszaállítás csak a saját kép fájljait állítja elő (egy másik kép fájljaihoz nem nyúl)', async () => {
    const kept = await uploadAndSettle(CANDLES);
    const photo = await uploadAndSettle(PUDDLE);
    await patchPhoto(photo.id, { hidden: true }).expect(200);

    await patchPhoto(photo.id, { hidden: false }).expect(200);

    expect(listStoredFiles(uploadDir)).toEqual(
      [kept.originalKey, photo.originalKey, ...publicFilesOf(kept), ...publicFilesOf(photo)].sort(),
    );
  });
});

describe('POST /api/admin/photos/:id/retry-registration', () => {
  it('a CHAIN_FAILED kép regisztrációja újraindul: 202, majd a háttérben REGISTERED lesz', async () => {
    const photo = await photoOf({ status: 'CHAIN_FAILED' });
    const { target, lines } = appWithLog();

    const response = await retry(photo.id, adminCookie, target);
    await chain.photoRegistration.whenIdle();

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ data: { photo: { id: photo.id, status: 'PENDING_CHAIN' } } });
    const stored = await storedPhoto(photo.id);
    expect(stored.status).toBe('REGISTERED');
    expect(stored.chainTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.records.has(photo.sha256)).toBe(true);
    expect(logEntries(lines)).toContainEqual(
      expect.objectContaining({
        photoId: photo.id,
        actorId: admin.id,
        action: 'retry-registration',
      }),
    );
  });

  it('a nem sikertelen (regisztrált, rejtett) kép nem próbálható újra: 409 az állapottal', async () => {
    for (const status of ['REGISTERED', 'HIDDEN'] as const) {
      const photo = await photoOf({ status });

      const response = await retry(photo.id);

      expect(response.status, status).toBe(409);
      expect(response.body.error).toMatchObject({ code: 'CONFLICT', details: { status } });
      expect((await storedPhoto(photo.id)).status, status).toBe(status);
    }
    expect(chain.blockchain.registerPhoto).not.toHaveBeenCalled();
  });

  it('ismeretlen kép 404, érvénytelen azonosító 400', async () => {
    expect((await retry(UNKNOWN_USER_ID)).status).toBe(404);
    expect((await retry('abc')).status).toBe(400);
  });

  it('a letiltott fotós képe nem próbálható újra (a regisztráció a tiltás idejére vár): 409', async () => {
    const photo = await photoOf({ status: 'CHAIN_FAILED' });
    await prisma.user.update({ where: { id: owner.id }, data: { isBlocked: true } });

    const response = await retry(photo.id);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'CONFLICT',
      details: { status: 'CHAIN_FAILED' },
    });
    expect((await storedPhoto(photo.id)).status).toBe('CHAIN_FAILED');
    expect(chain.blockchain.registerPhoto).not.toHaveBeenCalled();
  });

  it('adminonként korlátozott (minden újrapróbálás gázdíjba kerül): a korlát felett 429', async () => {
    const limited = createTestApp(
      { UPLOAD_DIR: uploadDir, CHAIN_RETRY_RATE_LIMIT_MAX: 2 },
      prisma,
      chain,
    );
    const photo = await photoOf({ status: 'REGISTERED' });
    const otherAdminCookie = sessionCookieFor(
      (await createUser(prisma, undefined, { role: 'ADMIN' })).id,
    );

    expect((await retry(photo.id, adminCookie, limited)).status).toBe(409);
    expect((await retry(photo.id, adminCookie, limited)).status).toBe(409);
    const third = await retry(photo.id, adminCookie, limited);
    // A korlát adminonként számol: a másik admin kérése még átmegy
    const other = await retry(photo.id, otherAdminCookie, limited);

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    expect(other.status).toBe(409);
  });

  it('két különböző sikertelen kép egymás után újrapróbálható', async () => {
    const first = await photoOf({ status: 'CHAIN_FAILED' });
    const second = await photoOf({ status: 'CHAIN_FAILED' });

    await retry(first.id).expect(202);
    await retry(second.id).expect(202);
    await chain.photoRegistration.whenIdle();

    expect((await storedPhoto(first.id)).status).toBe('REGISTERED');
    expect((await storedPhoto(second.id)).status).toBe('REGISTERED');
  });
});
