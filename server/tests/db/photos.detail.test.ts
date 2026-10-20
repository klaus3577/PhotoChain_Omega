// A kép adatlapja (GET /api/photos/:id), módosítása (PATCH) és elrejtése (DELETE) a tesztadatbázison,
// ideiglenes tárhelymappával és a saját tesztfotókkal: láthatóság (nyilvános kép, tulajdonos, admin),
// tanúsítvány, jogosultságok (401/403/404), a rejtett kép nyilvános fájljainak törlése, és hogy a
// hitelesség-ellenőrző (L12) a rejtett képre is helyesen válaszol.
import { rmSync } from 'node:fs';

import type { Express } from 'express';
import { pino } from 'pino';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { OrderStatus, PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { resolveContractAddress } from '../../src/services/blockchain.service.js';
import { restrictImageDecoders } from '../../src/services/imageDecoding.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import type { StorageService } from '../../src/services/storage/storage.types.js';
import { randomTxHash } from '../helpers/fakeBlockchain.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  sessionCookieHeader,
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
const REGISTERED_AT = new Date('2026-10-01T10:00:00.000Z');
const SEPOLIA_CHAIN_ID = 11_155_111;
const NON_PUBLIC_STATUSES: PhotoStatus[] = ['PENDING_CHAIN', 'CHAIN_FAILED', 'HIDDEN'];
/** Érvényes formájú azonosító, amelyhez nem tartozik kép. */
const UNKNOWN_ID = UNKNOWN_USER_ID;

let prisma: PrismaClient;
let uploadDir: string;
let app: Express;
let chain: TestChain;
let owner: { id: string; email: string };
let ownerCookie: string;
let strangerId: string;
let strangerCookie: string;
let adminId: string;
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
  owner = await createUser(prisma, undefined, { displayName: 'Fotós Fanni' });
  ownerCookie = sessionCookieFor(owner.id);
  strangerId = (await createUser(prisma)).id;
  strangerCookie = sessionCookieFor(strangerId);
  adminId = (await createUser(prisma, undefined, { role: 'ADMIN' })).id;
  adminCookie = sessionCookieFor(adminId);
  categoryId = (await createCategory(prisma)).id;
});

// A háttérben futó lánc-regisztráció a teszt végéig befejeződik (nem nyúl át a következő tesztbe)
afterEach(() => chain.photoRegistration.whenIdle());

/** Az adatlap lekérése – alapból bejelentkezés nélkül. */
function getPhoto(id: string, cookie?: string, target: Express = app) {
  const pending = request(target).get(`/api/photos/${id}`);
  return cookie ? pending.set('Cookie', cookie) : pending;
}

const patchPhoto = (id: string, body: unknown, cookie = ownerCookie) =>
  request(app)
    .patch(`/api/photos/${id}`)
    .set('Cookie', cookie)
    .send(body as object);

const hidePhoto = (id: string, cookie = ownerCookie, target: Express = app) =>
  request(target).delete(`/api/photos/${id}`).set('Cookie', cookie);

const storedPhoto = (id: string) => prisma.photo.findUniqueOrThrow({ where: { id } });

/** A tulajdonos nyilvános (REGISTERED), lezárt tranzakciójú képe – csak adatbázis-sor, fájl nélkül. */
const registeredPhoto = (fixture: Partial<PhotoFixture> = {}) =>
  createPhoto(prisma, {
    ownerId: owner.id,
    categoryId,
    status: 'REGISTERED',
    description: 'A Balaton felett',
    chainTxHash: randomTxHash(),
    chainBlockNumber: 4321,
    registeredAt: REGISTERED_AT,
    ...fixture,
  });

/** A tulajdonos nem nyilvános képe a megadott állapotban. */
const photoInStatus = (status: PhotoStatus) =>
  createPhoto(prisma, { ownerId: owner.id, categoryId, status, chainTxHash: randomTxHash() });

/** A vevő rendelése a képre (alapból kifizetett). */
const orderOf = (buyerId: string, photoId: string, status: OrderStatus = 'PAID') =>
  prisma.order.create({
    data: {
      buyerId,
      photoId,
      amountHuf: 2500,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
      stripeSessionId: `cs_test_${randomHex(16)}`,
    },
  });

/** Alkalmazás a megadott Prisma-klienssel, amelynek naplósorai (info szinttől) a tesztben olvashatók. */
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

/**
 * Versenyhelyzet: a Prisma-kliens a kép módosítása (update, updateMany) előtt elrejti a képet –
 * mintha a tulajdonos egy másik lapon éppen az ellenőrzés és a módosítás között rejtené el.
 */
function hidingBeforeWrite(client: PrismaClient, photoId: string): PrismaClient {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property !== 'photo') return typeof value === 'function' ? value.bind(target) : value;
      return new Proxy(target.photo, {
        get(delegate, method) {
          const member: unknown = Reflect.get(delegate, method);
          if (typeof member !== 'function') return member;
          if (method !== 'update' && method !== 'updateMany') return member.bind(delegate);
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

/** Feltöltés a tulajdonos nevében, a valódi fájlokkal (a regisztráció a háttérben indul). */
async function upload(image: Buffer): Promise<{ id: string }> {
  const response = await request(app)
    .post('/api/photos')
    .set('Cookie', ownerCookie)
    .field('title', 'Tócsa')
    .field('priceHuf', '2500')
    .field('categoryId', String(categoryId))
    .attach('image', image, 'feltoltes.jpg');
  expect(response.status).toBe(201);
  return response.body.data.photo;
}

/** Feltöltés és a háttérben futó lánc-regisztráció megvárása. */
async function uploadAndRegister(image: Buffer) {
  const { id } = await upload(image);
  await chain.photoRegistration.whenIdle();
  const photo = await storedPhoto(id);
  expect(photo.status).toBe('REGISTERED');
  return photo;
}

describe('GET /api/photos/:id – adatlap és tanúsítvány', () => {
  it('a nyilvános kép adatlapja bárkinek: a kép adatai és a regisztráció tanúsítványa', async () => {
    const photo = await registeredPhoto();
    const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });

    const response = await getPhoto(photo.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        photo: {
          id: photo.id,
          title: 'Naplemente',
          description: 'A Balaton felett',
          priceHuf: 2500,
          status: 'REGISTERED',
          sha256: photo.sha256,
          dHash: photo.dHash,
          width: 4000,
          height: 3000,
          previewUrl: `/media/${photo.previewKey}`,
          thumbnailUrl: `/media/${photo.thumbnailKey}`,
          category: { id: category.id, name: category.name, slug: category.slug },
          owner: { id: owner.id, displayName: 'Fotós Fanni' },
          createdAt: photo.createdAt.toISOString(),
          certificate: {
            registeredAt: REGISTERED_AT.toISOString(),
            blockNumber: 4321,
            txHash: photo.chainTxHash,
            txUrl: null,
            chainId: TEST_ENV.CHAIN_ID,
            contractAddress: resolveContractAddress(TEST_ENV.CHAIN_ID),
            contractUrl: null,
          },
          viewer: null,
          pendingTransaction: null,
        },
      },
    });
  });

  it('a tulajdonos és az admin a regisztrációra váró kép függő tranzakcióját is látja (L21); a többi állapotban null', async () => {
    const pending = await photoInStatus('PENDING_CHAIN');
    // Hash nélkül: a tranzakció még nem indult el (a sorban áll)
    const queued = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      status: 'PENDING_CHAIN',
    });
    const failed = await photoInStatus('CHAIN_FAILED');
    const sepoliaApp = createTestApp(
      { UPLOAD_DIR: uploadDir, CHAIN_ID: SEPOLIA_CHAIN_ID },
      prisma,
      chain,
    );
    const pendingTransactionOf = async (id: string, cookie: string, target: Express = app) =>
      (await getPhoto(id, cookie, target)).body.data.photo.pendingTransaction;

    for (const cookie of [ownerCookie, adminCookie]) {
      expect(await pendingTransactionOf(pending.id, cookie)).toEqual({
        txHash: pending.chainTxHash,
        txUrl: null,
      });
    }
    expect(await pendingTransactionOf(pending.id, ownerCookie, sepoliaApp)).toEqual({
      txHash: pending.chainTxHash,
      txUrl: `https://sepolia.etherscan.io/tx/${pending.chainTxHash}`,
    });
    // Még a sorban áll (nincs hash), illetve sikertelen: nincs függő tranzakció
    expect(await pendingTransactionOf(queued.id, ownerCookie)).toBeNull();
    expect(await pendingTransactionOf(failed.id, ownerCookie)).toBeNull();
    // A nyilvános képnél a lezárt tranzakció a tanúsítványban van
    expect(await pendingTransactionOf((await registeredPhoto()).id, ownerCookie)).toBeNull();
  });

  it('Sepolián a tanúsítványban a tranzakció Etherscan-linkje', async () => {
    const photo = await registeredPhoto();
    const sepoliaApp = createTestApp(
      { UPLOAD_DIR: uploadDir, CHAIN_ID: SEPOLIA_CHAIN_ID },
      prisma,
      chain,
    );

    const response = await getPhoto(photo.id, undefined, sepoliaApp);

    expect(response.body.data.photo.certificate).toMatchObject({
      txUrl: `https://sepolia.etherscan.io/tx/${photo.chainTxHash}`,
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: resolveContractAddress(SEPOLIA_CHAIN_ID),
      contractUrl: `https://sepolia.etherscan.io/address/${resolveContractAddress(SEPOLIA_CHAIN_ID)}`,
    });
  });

  it('a néző jelzői: névtelennek nincs (null); purchased csak a kép kifizetett rendelésének vevőjénél igaz, ő értékelhet is (canReview), amíg nem tette meg', async () => {
    const photo = await registeredPhoto();
    const otherPhoto = await registeredPhoto();
    const buyer = await createUser(prisma);
    await orderOf(buyer.id, photo.id);
    const waiting = await createUser(prisma);
    await orderOf(waiting.id, photo.id, 'PENDING');
    // Egy másik képre szóló kifizetett rendelés erre a képre nem számít
    await orderOf(strangerId, otherPhoto.id);

    const viewerOf = async (cookie?: string) =>
      (await getPhoto(photo.id, cookie)).body.data.photo.viewer;
    const notBuyer = { purchased: false, canReview: false, ownReviewId: null };

    expect(await viewerOf()).toBeNull();
    expect(await viewerOf(sessionCookieFor(buyer.id))).toEqual({
      purchased: true,
      canReview: true,
      ownReviewId: null,
    });
    expect(await viewerOf(sessionCookieFor(waiting.id))).toEqual(notBuyer);
    expect(await viewerOf(strangerCookie)).toEqual(notBuyer);
    expect(await viewerOf(ownerCookie)).toEqual(notBuyer);
  });

  it('ownReviewId a vevő saját értékelésének azonosítója (ekkor canReview hamis, másé nem számít); a tulajdonos saját rendeléssel sem értékelhet; a nem nyilvános kép a vásárlójának sem értékelhető (L23)', async () => {
    const photo = await registeredPhoto();
    const buyer = await createUser(prisma);
    await orderOf(buyer.id, photo.id);
    const review = await prisma.review.create({
      data: { photoId: photo.id, authorId: buyer.id, rating: 4 },
    });
    const otherBuyer = await createUser(prisma);
    await orderOf(otherBuyer.id, photo.id);
    // A tulajdonos „megvette” a saját képét: akkor sem értékelheti (a reviews.service 403-at adna)
    await orderOf(owner.id, photo.id);
    // Az admin megvett egy még regisztrációra váró képet: látja, de nem nyilvános – nem értékelhető
    const pending = await photoInStatus('PENDING_CHAIN');
    await orderOf(adminId, pending.id);

    const viewerOf = async (id: string, cookie: string) =>
      (await getPhoto(id, cookie)).body.data.photo.viewer;

    expect(await viewerOf(photo.id, sessionCookieFor(buyer.id))).toEqual({
      purchased: true,
      canReview: false,
      ownReviewId: review.id,
    });
    expect(await viewerOf(photo.id, sessionCookieFor(otherBuyer.id))).toEqual({
      purchased: true,
      canReview: true,
      ownReviewId: null,
    });
    expect(await viewerOf(photo.id, ownerCookie)).toEqual({
      purchased: true,
      canReview: false,
      ownReviewId: null,
    });
    expect(await viewerOf(pending.id, adminCookie)).toEqual({
      purchased: true,
      canReview: false,
      ownReviewId: null,
    });
  });

  it('a válaszban nincs e-mail, jelszó-hash, tárhelykulcs és gázadat (a tulajdonosnak sem)', async () => {
    const photo = await registeredPhoto();

    const body = JSON.stringify((await getPhoto(photo.id, ownerCookie)).body);

    for (const secret of [
      owner.email,
      'passwordHash',
      'nem-valodi-hash',
      photo.originalKey,
      'Key":',
      'gasUsed',
    ]) {
      expect(body).not.toContain(secret);
    }
  });

  it.each(NON_PUBLIC_STATUSES)(
    'a nem nyilvános (%s) kép mások számára nem létezik: 404',
    async (status) => {
      const photo = await photoInStatus(status);

      for (const cookie of [undefined, strangerCookie]) {
        const response = await getPhoto(photo.id, cookie);
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    },
  );

  it.each(NON_PUBLIC_STATUSES)(
    'a tulajdonos és az admin a nem nyilvános (%s) képet is látja – tanúsítvány nélkül',
    async (status) => {
      const photo = await photoInStatus(status);

      for (const cookie of [ownerCookie, adminCookie]) {
        const response = await getPhoto(photo.id, cookie);
        expect(response.status).toBe(200);
        expect(response.body.data.photo).toMatchObject({ id: photo.id, status, certificate: null });
      }
    },
  );

  it('a bejelentkezett nézőnek szóló válasz nem tárolható (no-store); a névtelené csak újraellenőrzéssel (no-cache, L31)', async () => {
    const photo = await registeredPhoto();
    const anonymous = await getPhoto(photo.id);

    expect((await getPhoto(photo.id, ownerCookie)).headers['cache-control']).toBe('no-store');
    expect(anonymous.headers['cache-control']).toBe('no-cache');
    // A válasz a sütitől függ: egy köztes gyorsítótár a névtelen változatot mást nem adhatja ki
    expect(anonymous.headers.vary).toMatch(/Cookie/);
  });

  it('érvénytelen süti, ismeretlen vagy letiltott felhasználó: névtelen nézőként kezeli (nem 401)', async () => {
    const publicPhoto = await registeredPhoto();
    const pending = await photoInStatus('PENDING_CHAIN');
    await prisma.user.update({ where: { id: strangerId }, data: { isBlocked: true } });

    for (const cookie of [
      sessionCookieHeader('hamis.token.ertek'),
      sessionCookieFor(UNKNOWN_USER_ID),
      strangerCookie,
    ]) {
      expect((await getPhoto(publicPhoto.id, cookie)).status).toBe(200);
      expect((await getPhoto(pending.id, cookie)).status).toBe(404);
    }
  });

  it('a letiltott tulajdonos a saját képeit sem látja (névtelen néző), a tiltás alatt mások sem (L16)', async () => {
    const publicPhoto = await registeredPhoto();
    const pending = await photoInStatus('PENDING_CHAIN');
    await prisma.user.update({ where: { id: owner.id }, data: { isBlocked: true } });

    for (const cookie of [ownerCookie, strangerCookie, undefined]) {
      expect((await getPhoto(publicPhoto.id, cookie)).status).toBe(404);
      expect((await getPhoto(pending.id, cookie)).status).toBe(404);
    }
    expect((await getPhoto(publicPhoto.id, adminCookie)).status).toBe(200);
  });

  it('ismeretlen azonosító: 404; érvénytelen azonosító: 400 (soha 500)', async () => {
    expect((await getPhoto(UNKNOWN_ID)).status).toBe(404);

    for (const id of ['abc', '1', `${UNKNOWN_ID}0`, '%zz']) {
      const response = await getPhoto(id);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('PATCH /api/photos/:id – módosítás', () => {
  it('a tulajdonos módosíthatja a címet, a leírást, az árat és a kategóriát; a válasz az új adatlap', async () => {
    const photo = await registeredPhoto();
    const other = await createCategory(prisma);

    const response = await patchPhoto(photo.id, {
      title: '  Naplemente a tónál ',
      description: 'Első sor\r\nmásodik sor',
      priceHuf: 4900,
      categoryId: other.id,
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.photo).toMatchObject({
      id: photo.id,
      title: 'Naplemente a tónál',
      description: 'Első sor\nmásodik sor',
      priceHuf: 4900,
      category: { id: other.id, name: other.name, slug: other.slug },
      status: 'REGISTERED',
      sha256: photo.sha256,
      certificate: { txHash: photo.chainTxHash },
    });
    expect(await storedPhoto(photo.id)).toMatchObject({
      title: 'Naplemente a tónál',
      priceHuf: 4900,
      categoryId: other.id,
      sha256: photo.sha256,
      dHash: photo.dHash,
      chainTxHash: photo.chainTxHash,
    });
  });

  it('a meg nem adott mezők nem változnak; a leírás null-lal törölhető', async () => {
    const photo = await registeredPhoto();

    await patchPhoto(photo.id, { description: null }).expect(200);

    expect(await storedPhoto(photo.id)).toMatchObject({
      title: photo.title,
      description: null,
      priceHuf: photo.priceHuf,
      categoryId,
    });
  });

  it('a regisztrációra váró kép adatai is módosíthatók (a lánc csak a hash-eket rögzíti)', async () => {
    const photo = await photoInStatus('PENDING_CHAIN');

    const response = await patchPhoto(photo.id, { title: 'Javított cím' });

    expect(response.status).toBe(200);
    expect(response.body.data.photo).toMatchObject({ title: 'Javított cím', certificate: null });
  });

  it.each(['sha256', 'dHash', 'status', 'ownerId', 'originalKey', 'image'])(
    'a kép és a hitelesítés adatai nem módosíthatók (%s): 400, és semmi nem változik',
    async (field) => {
      const photo = await registeredPhoto();

      const response = await patchPhoto(photo.id, { title: 'Új cím', [field]: 'x' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        { path: '', message: `ismeretlen mező: ${field}` },
      ]);
      expect((await storedPhoto(photo.id)).title).toBe(photo.title);
    },
  );

  it('ismeretlen kategória: 400 a mező megnevezésével', async () => {
    const photo = await registeredPhoto();

    const response = await patchPhoto(photo.id, { categoryId: 9999 });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'categoryId', message: 'ismeretlen kategória' },
    ]);
  });

  it('idegen kép: nyilvánosnál 403, nem nyilvánosnál 404; az admin sem módosíthatja (403)', async () => {
    const publicPhoto = await registeredPhoto();
    const pending = await photoInStatus('PENDING_CHAIN');

    expect((await patchPhoto(publicPhoto.id, { priceHuf: 1000 }, strangerCookie)).status).toBe(403);
    expect((await patchPhoto(pending.id, { priceHuf: 1000 }, strangerCookie)).status).toBe(404);
    expect((await patchPhoto(publicPhoto.id, { priceHuf: 1000 }, adminCookie)).status).toBe(403);
    expect((await patchPhoto(pending.id, { priceHuf: 1000 }, adminCookie)).status).toBe(403);
    const prices = await prisma.photo.findMany({ select: { priceHuf: true } });
    expect(prices.map((photo) => photo.priceHuf)).not.toContain(1);
  });

  it('bejelentkezés nélkül 401', async () => {
    const photo = await registeredPhoto();

    const response = await request(app).patch(`/api/photos/${photo.id}`).send({ priceHuf: 1000 });

    expect(response.status).toBe(401);
  });

  it('ha a képet a módosítás közben elrejtik, a módosítás nem fut le: 409', async () => {
    const photo = await registeredPhoto();
    const { target } = appWithLog(hidingBeforeWrite(prisma, photo.id));

    const response = await request(target)
      .patch(`/api/photos/${photo.id}`)
      .set('Cookie', ownerCookie)
      .send({ priceHuf: 1000 });

    expect(response.status).toBe(409);
    expect(await storedPhoto(photo.id)).toMatchObject({ status: 'HIDDEN', priceHuf: 2500 });
  });

  it('az elrejtett kép nem módosítható: 409', async () => {
    const photo = await photoInStatus('HIDDEN');

    const response = await patchPhoto(photo.id, { priceHuf: 1000 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect((await storedPhoto(photo.id)).priceHuf).toBe(2500);
  });

  it.each([
    ['érvénytelen JSON', '{"title":', 'INVALID_JSON'],
    ['JSON-szöveg', '"Új cím"', 'INVALID_JSON'],
    ['tömb', '[]', 'VALIDATION_ERROR'],
    ['üres objektum', '{}', 'VALIDATION_ERROR'],
    ['szövegként küldött ár', '{"priceHuf":"4900"}', 'VALIDATION_ERROR'],
    ['óriási szám', '{"priceHuf":1e400}', 'VALIDATION_ERROR'],
  ])('hibás törzs (%s): 400, soha 500', async (_name, body, code) => {
    const photo = await registeredPhoto();

    const response = await request(app)
      .patch(`/api/photos/${photo.id}`)
      .set('Cookie', ownerCookie)
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(code);
  });

  it('nem JSON törzs (pl. űrlap): 400', async () => {
    const photo = await registeredPhoto();

    const response = await request(app)
      .patch(`/api/photos/${photo.id}`)
      .set('Cookie', ownerCookie)
      .type('form')
      .send({ title: 'Új cím' });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ path: '', message: 'JSON-objektum kell' }]);
  });

  it('érvénytelen azonosító: 400; ismeretlen: 404', async () => {
    expect((await patchPhoto('abc', { priceHuf: 1000 })).status).toBe(400);
    expect((await patchPhoto(UNKNOWN_ID, { priceHuf: 1000 })).status).toBe(404);
  });

  it('más webhelyről indított kérés: 403 (CSRF-védelem), és semmi nem változik', async () => {
    const photo = await registeredPhoto();

    const response = await request(app)
      .patch(`/api/photos/${photo.id}`)
      .set('Cookie', ownerCookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ priceHuf: 1000 });

    expect(response.status).toBe(403);
    expect((await storedPhoto(photo.id)).priceHuf).toBe(2500);
  });
});

describe('DELETE /api/photos/:id – elrejtés', () => {
  it('a tulajdonos elrejtheti: 204, a kép eltűnik a galériából és mások elől', async () => {
    const photo = await uploadAndRegister(PUDDLE);

    const response = await hidePhoto(photo.id);

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await storedPhoto(photo.id)).status).toBe('HIDDEN');
    expect((await request(app).get('/api/photos')).body.data.photos).toEqual([]);
    expect((await getPhoto(photo.id)).status).toBe(404);
    expect((await getPhoto(photo.id, strangerCookie)).status).toBe(404);
  });

  it('az előnézet és a bélyegkép törlődik (URL-en sem érhető el), az eredeti megmarad', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const { previewUrl, thumbnailUrl } = (await getPhoto(photo.id)).body.data.photo;
    await request(app).get(previewUrl).expect(200);

    await hidePhoto(photo.id).expect(204);

    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
    await request(app).get(previewUrl).expect(404);
    await request(app).get(thumbnailUrl).expect(404);
    // A tulajdonos látja az állapotot; a törölt fájloknak nincs URL-je, és tanúsítvány sincs
    expect((await getPhoto(photo.id, ownerCookie)).body.data.photo).toMatchObject({
      status: 'HIDDEN',
      previewUrl: null,
      thumbnailUrl: null,
      certificate: null,
    });
  });

  it('az ismételt elrejtés is 204 (idempotens)', async () => {
    const photo = await uploadAndRegister(PUDDLE);

    await hidePhoto(photo.id).expect(204);
    await hidePhoto(photo.id).expect(204);

    expect((await storedPhoto(photo.id)).status).toBe('HIDDEN');
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('az admin bárki képét elrejtheti', async () => {
    const photo = await uploadAndRegister(PUDDLE);

    await hidePhoto(photo.id, adminCookie).expect(204);

    expect((await storedPhoto(photo.id)).status).toBe('HIDDEN');
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('idegen kép: nyilvánosnál 403, nem nyilvánosnál 404; bejelentkezés nélkül 401 – és semmi nem változik', async () => {
    const publicPhoto = await registeredPhoto();
    const pending = await photoInStatus('PENDING_CHAIN');

    expect((await hidePhoto(publicPhoto.id, strangerCookie)).status).toBe(403);
    expect((await hidePhoto(pending.id, strangerCookie)).status).toBe(404);
    expect((await request(app).delete(`/api/photos/${publicPhoto.id}`)).status).toBe(401);
    expect((await storedPhoto(publicPhoto.id)).status).toBe('REGISTERED');
    expect((await storedPhoto(pending.id)).status).toBe('PENDING_CHAIN');
  });

  it('érvénytelen azonosító: 400; ismeretlen: 404', async () => {
    expect((await hidePhoto('abc')).status).toBe(400);
    expect((await hidePhoto(UNKNOWN_ID)).status).toBe(404);
  });

  it('a napló megőrzi, ki rejtette el a képet, és a jogosulatlan kísérleteket is', async () => {
    const photo = await registeredPhoto();
    const { target, lines } = appWithLog();

    await request(target)
      .patch(`/api/photos/${photo.id}`)
      .set('Cookie', strangerCookie)
      .send({ priceHuf: 1000 })
      .expect(403);
    await hidePhoto(photo.id, strangerCookie, target).expect(403);
    await hidePhoto(photo.id, adminCookie, target).expect(204);

    const entries: Array<Record<string, unknown>> = lines.map((line) => JSON.parse(line));
    const denied = entries.filter((entry) => entry.actorId === strangerId);
    expect(denied).toHaveLength(2);
    // pino: 40 = warn
    expect(denied.every((entry) => entry.level === 40 && entry.photoId === photo.id)).toBe(true);
    expect(denied.map((entry) => entry.action).sort()).toEqual(['hide', 'update']);
    expect(entries).toContainEqual(
      expect.objectContaining({ photoId: photo.id, actorId: adminId, hiddenBy: 'ADMIN' }),
    );
  });

  it('más webhelyről indított kérés: 403 (CSRF-védelem), és a kép nyilvános marad', async () => {
    const photo = await registeredPhoto();

    const response = await hidePhoto(photo.id).set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect((await storedPhoto(photo.id)).status).toBe('REGISTERED');
  });

  it('ha a fájlok törlése nem sikerül: 500 (naplózva), a kép rejtett marad; az újrapróbálás befejezi', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const local = createLocalStorage(uploadDir);
    let remainingFailures = 1;
    const flakyStorage: StorageService = {
      ...local,
      async delete(key) {
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error('a tárhely átmenetileg nem érhető el');
        }
        await local.delete(key);
      },
    };
    const logLines: string[] = [];
    const flakyApp = createApp({
      env: { ...TEST_ENV, UPLOAD_DIR: uploadDir },
      logger: pino({ level: 'error' }, { write: (line: string) => logLines.push(line) }),
      prisma,
      storage: flakyStorage,
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });

    const failed = await hidePhoto(photo.id, ownerCookie, flakyApp);

    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('INTERNAL_ERROR');
    expect((await storedPhoto(photo.id)).status).toBe('HIDDEN');
    expect(logLines.join('\n')).toContain(photo.id);

    await hidePhoto(photo.id, ownerCookie, flakyApp).expect(204);
    expect(listStoredFiles(uploadDir)).toEqual([photo.originalKey]);
  });

  it('a regisztrációra váró kép elrejtése után nem megy ki tranzakció (a láncra nem kerül)', async () => {
    const gate = deferred();
    chain.blockchain.registerPhoto.mockImplementation(async (input, options) => {
      await gate.promise;
      return chain.registerPhoto(input, options);
    });
    const { id } = await upload(PUDDLE);

    const hidden = await hidePhoto(id);
    // A sorompó az ellenőrzés előtt nyílik: bukó teszt után se várjon a regisztráció örökké
    gate.resolve();
    await chain.photoRegistration.whenIdle();

    expect(hidden.status).toBe(204);
    const photo = await storedPhoto(id);
    expect(photo.status).toBe('HIDDEN');
    expect(photo.chainTxHash).toBeNull();
    expect(chain.records.has(photo.sha256)).toBe(false);
  });

  it('a lánc rekordja megmarad: a /api/verify a rejtett képre VERIFIED a kép adatai nélkül, hasonlóként nem hivatkozik rá', async () => {
    const photo = await uploadAndRegister(PUDDLE);
    const copy = await sharp(PUDDLE).resize({ width: 800 }).jpeg({ quality: 85 }).toBuffer();
    const verifyCopy = () => request(app).post('/api/verify').attach('image', copy, 'masolat.jpg');
    expect((await verifyCopy()).body.data).toMatchObject({
      result: 'SIMILAR',
      photo: { id: photo.id },
    });

    await hidePhoto(photo.id).expect(204);

    const exact = await request(app).get(`/api/verify/${photo.sha256}`);
    expect(exact.status).toBe(200);
    expect(exact.body.data).toMatchObject({
      result: 'VERIFIED',
      registration: {
        registeredAt: photo.registeredAt?.toISOString(),
        blockNumber: photo.chainBlockNumber,
        txHash: photo.chainTxHash,
      },
      photo: null,
    });
    expect((await verifyCopy()).body.data).toMatchObject({
      result: 'NOT_FOUND',
      registration: null,
      photo: null,
    });
  });
});
