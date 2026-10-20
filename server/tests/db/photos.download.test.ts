// Az eredeti kép védett letöltése (GET /api/photos/:id/download) a tesztadatbázison: csak a
// tulajdonos és a kifizetett (PAID) rendeléssel rendelkező vásárló töltheti le; másnak 403, ha a kép
// nyilvános, és 404, ha nem látja (az L13 láthatósági szabálya). A fájl a tárhelyről, streamként,
// letöltendő mellékletként (Content-Disposition: attachment) érkezik.
import { randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';

import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { OrderStatus, PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import type { StorageService } from '../../src/services/storage/storage.types.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import { createTestApp, createTestChain, sessionCookieFor, TEST_ENV } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  type PhotoFixture,
  resetDatabase,
} from '../helpers/testDatabase.js';

const UNKNOWN_PHOTO_ID = '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f';
/** Az eredeti fájl tartalma – a letöltésnek bájtra pontosan ezt kell visszaadnia */
const ORIGINAL = randomBytes(256 * 1024);

const storage = createLocalStorage(TEST_ENV.UPLOAD_DIR);
const savedKeys: string[] = [];

let prisma: PrismaClient;
let app: Express;
let owner: { id: string };
let buyer: { id: string };
let stranger: { id: string };
let admin: { id: string };
let categoryId: number;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  app = createTestApp({}, prisma);
  owner = await createUser(prisma, 'fanni@photochain.test');
  buyer = await createUser(prisma, 'vera@photochain.test');
  stranger = await createUser(prisma, 'oszkar@photochain.test');
  admin = await createUser(prisma, 'admin@photochain.test', { role: 'ADMIN' });
  categoryId = (await createCategory(prisma)).id;
});

afterEach(async () => {
  await Promise.all(savedKeys.splice(0).map((key) => storage.delete(key)));
});

/** Kép az eredeti fájljával együtt (a tesztkonfiguráció tárhelyén). */
async function photoWithOriginal(fixture: Partial<PhotoFixture> = {}) {
  const photo = await createPhoto(prisma, {
    ownerId: owner.id,
    categoryId,
    status: 'REGISTERED',
    title: 'Naplemente a Balatonnál',
    ...fixture,
  });
  await storage.save(photo.originalKey, ORIGINAL);
  savedKeys.push(photo.originalKey);
  return photo;
}

const orderFor = (photoId: string, status: OrderStatus, buyerId = buyer.id) =>
  prisma.order.create({
    data: {
      buyerId,
      photoId,
      amountHuf: 2500,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
    },
  });

/**
 * A válasz törzse nyers bájtokként (a típusától függetlenül). Node alatt a Superagent a válasz
 * folyamát (http.IncomingMessage) adja át – a típusleírása ezt nem így írja le, ezért unknown.
 */
function binary(response: unknown, callback: (error: Error | null, body: Buffer) => void): void {
  const stream = response as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
}

const download = (photoId: string, userId?: string) => {
  const call = request(app).get(`/api/photos/${photoId}/download`);
  if (userId) call.set('Cookie', sessionCookieFor(userId));
  return call.buffer(true).parse(binary);
};

const errorOf = (body: Buffer) => JSON.parse(body.toString('utf8')) as { error: { code: string } };

describe('GET /api/photos/:id/download – jogosult letöltés', () => {
  it('a tulajdonos letölti az eredetit: melléklet, a címből képzett (ékezetes) név, helyes típus, no-store', async () => {
    const photo = await photoWithOriginal();

    const response = await download(photo.id, owner.id);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-length']).toBe(String(ORIGINAL.length));
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Naplemente a Balatonnal.jpg"; filename*=UTF-8''Naplemente%20a%20Balatonn%C3%A1l.jpg`,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(response.body as Buffer, ORIGINAL)).toBe(0);
  });

  it('a kifizetett (PAID) rendeléssel rendelkező vásárló letölti', async () => {
    const photo = await photoWithOriginal();
    await orderFor(photo.id, 'PAID');

    const response = await download(photo.id, buyer.id);

    expect(response.status).toBe(200);
    expect(Buffer.compare(response.body as Buffer, ORIGINAL)).toBe(0);
  });

  it('a vásárló a később elrejtett képet is letöltheti – a megvásárolt licenc nem vész el', async () => {
    const photo = await photoWithOriginal();
    await orderFor(photo.id, 'PAID');
    await prisma.photo.update({
      where: { id: photo.id },
      data: { status: 'HIDDEN', hiddenBy: 'OWNER' },
    });

    expect((await download(photo.id, buyer.id)).status).toBe(200);
    // Aki nem vette meg, annak a rejtett kép nem létezik
    expect((await download(photo.id, stranger.id)).status).toBe(404);
  });

  it('a moderátor (admin) által elrejtett képet a vásárló sem töltheti le (L16) – a tulajdonos igen; a visszaállítás után újra letölthető', async () => {
    const photo = await photoWithOriginal();
    await orderFor(photo.id, 'PAID');
    const setHidden = (hidden: boolean) =>
      prisma.photo.update({
        where: { id: photo.id },
        data: hidden
          ? { status: 'HIDDEN', hiddenBy: 'ADMIN' }
          : { status: 'REGISTERED', hiddenBy: null },
      });
    await setHidden(true);

    const byBuyer = await download(photo.id, buyer.id);
    const byOwner = await download(photo.id, owner.id);
    const byStranger = await download(photo.id, stranger.id);
    await setHidden(false);

    expect(byBuyer.status).toBe(403);
    expect(errorOf(byBuyer.body).error.code).toBe('FORBIDDEN');
    expect(byOwner.status).toBe(200);
    expect(byStranger.status).toBe(404);
    expect((await download(photo.id, buyer.id)).status).toBe(200);
  });

  it('a tulajdonos saját elrejtése nem szünteti meg a moderátori levételt: a vásárló továbbra sem tölthet le', async () => {
    const photo = await photoWithOriginal();
    await orderFor(photo.id, 'PAID');
    await prisma.photo.update({
      where: { id: photo.id },
      data: { status: 'HIDDEN', hiddenBy: 'OWNER_AND_ADMIN' },
    });

    expect((await download(photo.id, buyer.id)).status).toBe(403);
    expect((await download(photo.id, owner.id)).status).toBe(200);
  });

  it.each<PhotoStatus>(['PENDING_CHAIN', 'CHAIN_FAILED', 'HIDDEN'])(
    'a tulajdonos a még nem nyilvános (%s) képét is letöltheti',
    async (status) => {
      const photo = await photoWithOriginal({ status });

      expect((await download(photo.id, owner.id)).status).toBe(200);
    },
  );

  it('a PNG eredeti image/png típussal és .png kiterjesztéssel megy', async () => {
    const photo = await photoWithOriginal({ title: 'Hajnal' });
    const pngKey = photo.originalKey.replace(/\.jpg$/, '.png');
    await prisma.photo.update({ where: { id: photo.id }, data: { originalKey: pngKey } });
    await storage.save(pngKey, ORIGINAL);
    savedKeys.push(pngKey);

    const response = await download(photo.id, owner.id);

    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-disposition']).toBe('attachment; filename=Hajnal.png');
  });
});

describe('GET /api/photos/:id/download – a letöltési hivatkozás hibája a böngészőben', () => {
  /** Mint a letöltési hivatkozásra kattintás: a böngésző dokumentumként navigál az URL-re. */
  const navigateToDownload = (photoId: string, userId?: string) => {
    const call = request(app)
      .get(`/api/photos/${photoId}/download`)
      .set('Sec-Fetch-Dest', 'document');
    if (userId) call.set('Cookie', sessionCookieFor(userId));
    return call;
  };

  it('lejárt munkamenetnél olvasható oldal (nem nyers JSON): bejelentkezés és vissza a képhez', async () => {
    const photo = await photoWithOriginal();

    const response = await navigateToDownload(photo.id);

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('<h1>A letöltés nem sikerült</h1>');
    expect(response.text).toContain('<a href="/login">');
    expect(response.text).toContain(`<a href="/photos/${photo.id}">`);
  });

  it('jogosulatlan letöltésnél (403) is oldal – a fájl és a kulcsa nélkül; hibás azonosítónál a galériába mutat', async () => {
    const photo = await photoWithOriginal();

    const forbidden = await navigateToDownload(photo.id, stranger.id);
    const malformed = await navigateToDownload('nem-uuid', stranger.id);

    expect(forbidden.status).toBe(403);
    expect(forbidden.headers['content-type']).toMatch(/^text\/html/);
    expect(forbidden.headers['content-disposition']).toBeUndefined();
    expect(forbidden.text).not.toContain('originals/');
    expect(forbidden.text).not.toContain('/login');
    expect(malformed.status).toBe(400);
    expect(malformed.text).toContain('<a href="/">');
  });
});

describe('GET /api/photos/:id/download – elutasított letöltés', () => {
  it.each<OrderStatus>(['PENDING', 'EXPIRED', 'FAILED'])(
    'nem kifizetett (%s) rendeléssel 403',
    async (status) => {
      const photo = await photoWithOriginal();
      await orderFor(photo.id, status);

      const response = await download(photo.id, buyer.id);

      expect(response.status).toBe(403);
      expect(errorOf(response.body as Buffer).error.code).toBe('FORBIDDEN');
    },
  );

  it('más felhasználó: nyilvános képnél 403 (a fájl és a kulcsa nélkül), nem nyilvánosnál 404', async () => {
    const publicPhoto = await photoWithOriginal();
    const hiddenPhoto = await photoWithOriginal({ status: 'HIDDEN' });
    const pendingPhoto = await photoWithOriginal({ status: 'PENDING_CHAIN' });

    const forbidden = await download(publicPhoto.id, stranger.id);

    expect(forbidden.status).toBe(403);
    expect(forbidden.headers['content-disposition']).toBeUndefined();
    expect((forbidden.body as Buffer).toString('utf8')).not.toContain('originals/');
    expect((await download(hiddenPhoto.id, stranger.id)).status).toBe(404);
    expect((await download(pendingPhoto.id, stranger.id)).status).toBe(404);
  });

  it('a másik vevő kifizetett rendelése nem jogosít fel', async () => {
    const photo = await photoWithOriginal();
    await orderFor(photo.id, 'PAID', stranger.id);

    expect((await download(photo.id, buyer.id)).status).toBe(403);
  });

  it('az admin sem töltheti le más eredetijét (a nem nyilvánosat sem): 403', async () => {
    const publicPhoto = await photoWithOriginal();
    const hiddenPhoto = await photoWithOriginal({ status: 'HIDDEN' });

    expect((await download(publicPhoto.id, admin.id)).status).toBe(403);
    expect((await download(hiddenPhoto.id, admin.id)).status).toBe(403);
  });

  it('bejelentkezés nélkül 401; hibás azonosító 400; ismeretlen kép 404', async () => {
    const photo = await photoWithOriginal();

    expect((await download(photo.id)).status).toBe(401);
    expect((await download('abc', owner.id)).status).toBe(400);
    expect((await download('..%2F..%2Foriginals', owner.id)).status).toBe(400);
    expect((await download(UNKNOWN_PHOTO_ID, owner.id)).status).toBe(404);
  });

  it('ha az eredeti fájl hiányzik a tárhelyről: 500 – a fájl útvonala nélkül', async () => {
    const photo = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      status: 'REGISTERED',
    });

    const response = await download(photo.id, owner.id);

    expect(response.status).toBe(500);
    expect(errorOf(response.body as Buffer).error.code).toBe('INTERNAL_ERROR');
    expect((response.body as Buffer).toString('utf8')).not.toMatch(/originals|ENOENT/);
  });
});

describe('GET /api/photos/:id/download – erőforrások', () => {
  /** Az alkalmazás egy saját tárhely-burokkal (a megnyitott fájlfolyamok megfigyeléséhez). */
  function appWithStorage(wrapped: StorageService): Express {
    const chain = createTestChain(prisma);
    return createApp({
      env: TEST_ENV,
      logger: createLogger(TEST_ENV),
      prisma,
      storage: wrapped,
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });
  }

  it('HEAD kérésre a fejlécek jönnek, de a fájl tartalma nem olvasódik be (a fájl lezárul)', async () => {
    const photo = await photoWithOriginal();
    const opened: Readable[] = [];
    const target = appWithStorage({
      ...storage,
      async openRead(key) {
        const file = await storage.openRead(key);
        opened.push(file.stream);
        return file;
      },
    });

    const response = await request(target)
      .head(`/api/photos/${photo.id}/download`)
      .set('Cookie', sessionCookieFor(owner.id));

    expect(response.status).toBe(200);
    expect(response.headers['content-length']).toBe(String(ORIGINAL.length));
    expect(response.headers['content-disposition']).toMatch(/^attachment; /);
    expect(opened).toHaveLength(1);
    expect(opened[0]!.readableDidRead).toBe(false);
    expect(opened[0]!.destroyed).toBe(true);
  });

  it('felhasználónként egyszerre legfeljebb 2 letöltés (a többi 429) – a többi felhasználót nem érinti', async () => {
    const photo = await photoWithOriginal();
    const otherOwner = await createUser(prisma);
    const otherPhoto = await photoWithOriginal({ ownerId: otherOwner.id });
    // A fájl megnyitása addig vár, amíg a teszt el nem engedi: a letöltések közben folyamatban vannak
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waiting = 0;
    const target = appWithStorage({
      ...storage,
      async openRead(key) {
        waiting += 1;
        await gate;
        return storage.openRead(key);
      },
    });
    const get = (photoId: string, userId: string) =>
      request(target)
        .get(`/api/photos/${photoId}/download`)
        .set('Cookie', sessionCookieFor(userId))
        .buffer(true)
        .parse(binary);

    const first = get(photo.id, owner.id).then((response) => response);
    const second = get(photo.id, owner.id).then((response) => response);
    await vi.waitFor(() => expect(waiting).toBe(2));

    const third = await get(photo.id, owner.id);
    const other = get(otherPhoto.id, otherOwner.id).then((response) => response);
    await vi.waitFor(() => expect(waiting).toBe(3));
    release();

    expect(third.status).toBe(429);
    expect(errorOf(third.body as Buffer).error.code).toBe('RATE_LIMITED');
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect((await other).status).toBe(200);
  });
});
