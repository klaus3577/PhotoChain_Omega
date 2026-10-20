// A letiltott felhasználó nyilvános tartalma a tesztadatbázison (L16, szerzői döntés,
// 2026-10-06): a tiltás idejére a képei, a profilja és az értékelései eltűnnek a nyilvános
// felületekről (galéria, adatlap, profil, értékelések és átlagaik, vásárlás, hitelesség-ellenőrzés
// adatai), a feloldás után minden visszajön. Semmi nem törlődik: a fájlok, a lánc rekordja és a
// vásárlók letöltési joga megmarad; az admin a tiltás alatt is látja a képeket.
import { rmSync } from 'node:fs';

import type { Express } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { restrictImageDecoders } from '../../src/services/imageDecoding.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
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
import { createTempUploadDir, fixtureImage } from '../helpers/uploads.js';

const PUDDLE = fixtureImage('01_tocsa_tukrozodes.jpg');

let prisma: PrismaClient;
let uploadDir: string;
let app: Express;
let chain: TestChain;
let owner: { id: string };
let buyer: { id: string };
let stranger: { id: string };
let admin: { id: string };
let ownerCookie: string;
let buyerCookie: string;
let strangerCookie: string;
let adminCookie: string;
let categoryId: number;

beforeAll(() => {
  prisma = createTestPrisma();
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
  buyer = await createUser(prisma, 'vera@photochain.test', { displayName: 'Vásárló Vera' });
  stranger = await createUser(prisma, 'oszkar@photochain.test', { displayName: 'Idegen Oszkár' });
  admin = await createUser(prisma, 'admin@photochain.test', { role: 'ADMIN' });
  ownerCookie = sessionCookieFor(owner.id);
  buyerCookie = sessionCookieFor(buyer.id);
  strangerCookie = sessionCookieFor(stranger.id);
  adminCookie = sessionCookieFor(admin.id);
  categoryId = (await createCategory(prisma)).id;
});

afterEach(() => chain.photoRegistration.whenIdle());

const registeredPhoto = (ownerId = owner.id, title = 'Tócsa') =>
  createPhoto(prisma, { ownerId, categoryId, status: 'REGISTERED', title });

const setBlocked = (userId: string, isBlocked: boolean) =>
  request(app)
    .patch(`/api/admin/users/${userId}`)
    .set('Cookie', adminCookie)
    .send({ isBlocked })
    .expect(200);

const paidOrder = (buyerId: string, photoId: string) =>
  prisma.order.create({
    data: {
      buyerId,
      photoId,
      amountHuf: 2500,
      status: 'PAID',
      paidAt: new Date(),
      stripeSessionId: `cs_test_${randomHex(16)}`,
    },
  });

const reviewOf = (authorId: string, photoId: string, rating: number) =>
  prisma.review.create({ data: { authorId, photoId, rating } });

const gallery = (query = '') => request(app).get(`/api/photos${query}`);

const titlesOf = (response: request.Response): string[] =>
  (response.body.data.photos as Array<{ title: string }>).map((photo) => photo.title);

const getPhoto = (id: string, cookie?: string) => {
  const pending = request(app).get(`/api/photos/${id}`);
  return cookie ? pending.set('Cookie', cookie) : pending;
};

const listReviews = (photoId: string) => request(app).get(`/api/photos/${photoId}/reviews`);

/** Feltöltés a tulajdonos nevében a valódi fájllal, megvárva a lánc-regisztrációt. */
async function uploadAndRegister(image: Buffer = PUDDLE): Promise<string> {
  const response = await request(app)
    .post('/api/photos')
    .set('Cookie', ownerCookie)
    .field('title', 'Tócsa')
    .field('priceHuf', '2500')
    .field('categoryId', String(categoryId))
    .attach('image', image, 'feltoltes.jpg');
  expect(response.status).toBe(201);
  await chain.photoRegistration.whenIdle();
  return response.body.data.photo.id as string;
}

describe('a letiltott fotós képei', () => {
  it('eltűnnek a galériából (a fotós szűrőjével és a nevére keresve is), a feloldás után visszajönnek', async () => {
    await registeredPhoto(owner.id, 'Tócsa');
    await registeredPhoto(stranger.id, 'Gyertyák');

    await setBlocked(owner.id, true);
    const whileBlocked = [
      await gallery(),
      await gallery(`?ownerId=${owner.id}`),
      await gallery('?q=Fanni'),
    ];
    await setBlocked(owner.id, false);

    expect(titlesOf(whileBlocked[0]!)).toEqual(['Gyertyák']);
    expect(titlesOf(whileBlocked[1]!)).toEqual([]);
    expect(titlesOf(whileBlocked[2]!)).toEqual([]);
    expect(whileBlocked[0]!.body.meta.total).toBe(1);
    expect(titlesOf(await gallery()).sort()).toEqual(['Gyertyák', 'Tócsa']);
  });

  it('az adatlapjuk névtelenül és más felhasználónak 404, az adminnak látható', async () => {
    const photo = await registeredPhoto();
    await setBlocked(owner.id, true);

    expect((await getPhoto(photo.id)).status).toBe(404);
    expect((await getPhoto(photo.id, strangerCookie)).status).toBe(404);
    const forAdmin = await getPhoto(photo.id, adminCookie);
    expect(forAdmin.status).toBe(200);
    expect(forAdmin.body.data.photo.status).toBe('REGISTERED');
  });

  it('nem vásárolhatók meg és nem értékelhetők: 404 (mint a nem létező kép)', async () => {
    const photo = await registeredPhoto();
    await paidOrder(buyer.id, photo.id);
    const other = await registeredPhoto(owner.id, 'Gyertyák');
    await setBlocked(owner.id, true);

    const checkout = await request(app)
      .post('/api/orders/checkout')
      .set('Cookie', strangerCookie)
      .send({ photoId: other.id });
    const review = await request(app)
      .post(`/api/photos/${photo.id}/reviews`)
      .set('Cookie', buyerCookie)
      .send({ rating: 5 });

    expect(checkout.status).toBe(404);
    expect(review.status).toBe(404);
    expect(await prisma.order.count({ where: { photoId: other.id } })).toBe(0);
    expect(await prisma.review.count()).toBe(0);
    expect((await listReviews(photo.id)).status).toBe(404);
  });

  it('a kifizetett vásárló a tiltás alatt is letöltheti az eredetit (a megvásárolt licenc nem vész el)', async () => {
    const photo = await registeredPhoto();
    await createLocalStorage(uploadDir).save(photo.originalKey, PUDDLE);
    await paidOrder(buyer.id, photo.id);
    await setBlocked(owner.id, true);

    const bought = await request(app)
      .get(`/api/photos/${photo.id}/download`)
      .set('Cookie', buyerCookie);
    const foreign = await request(app)
      .get(`/api/photos/${photo.id}/download`)
      .set('Cookie', strangerCookie);

    expect(bought.status).toBe(200);
    expect(bought.headers['content-length']).toBe(String(PUDDLE.length));
    // Másnak a kép nem létezik
    expect(foreign.status).toBe(404);
  });

  it('a hitelesség-ellenőrző a lánc szerint VERIFIED-et ad, de a kép adatai nélkül; hasonlóként nem hivatkozik rá', async () => {
    const photoId = await uploadAndRegister();
    const copy = await sharp(PUDDLE).resize({ width: 800 }).jpeg({ quality: 85 }).toBuffer();
    const verify = (image: Buffer) =>
      request(app).post('/api/verify').attach('image', image, 'ellenorzes.jpg');
    await setBlocked(owner.id, true);

    const exact = await verify(PUDDLE);
    const similar = await verify(copy);
    await setBlocked(owner.id, false);
    const afterUnblock = await verify(PUDDLE);

    expect(exact.body.data).toMatchObject({ result: 'VERIFIED', photo: null });
    expect(similar.body.data.result).toBe('NOT_FOUND');
    expect(afterUnblock.body.data).toMatchObject({ result: 'VERIFIED', photo: { id: photoId } });
  });

  it('a képükkel azonos feltöltés 409, de a kép és a fotós adatai nélkül', async () => {
    await uploadAndRegister();
    await setBlocked(owner.id, true);

    const response = await request(app)
      .post('/api/photos')
      .set('Cookie', strangerCookie)
      .field('title', 'Másolat')
      .field('priceHuf', '2500')
      .field('categoryId', String(categoryId))
      .attach('image', PUDDLE, 'masolat.jpg');

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'DUPLICATE_EXACT',
      message: expect.any(String),
      details: { distance: 0 },
    });
  });
});

describe('a letiltott felhasználó profilja és értékelései', () => {
  it('a profilja 404, a feloldás után újra látható', async () => {
    await setBlocked(owner.id, true);
    const whileBlocked = await request(app).get(`/api/users/${owner.id}`);
    await setBlocked(owner.id, false);

    expect(whileBlocked.status).toBe(404);
    expect((await request(app).get(`/api/users/${owner.id}`)).status).toBe(200);
  });

  it('az értékelései kimaradnak a kép listájából, átlagából és a fotós profiljának átlagából', async () => {
    const photo = await registeredPhoto();
    await reviewOf(buyer.id, photo.id, 1);
    await reviewOf(stranger.id, photo.id, 5);

    await setBlocked(buyer.id, true);
    const list = await listReviews(photo.id);
    const profile = await request(app).get(`/api/users/${owner.id}`);
    await setBlocked(buyer.id, false);

    expect(list.status).toBe(200);
    expect(list.body.data.reviews).toHaveLength(1);
    expect(list.body.data.reviews[0].author.id).toBe(stranger.id);
    expect(list.body.data.rating).toEqual({ average: 5, count: 1 });
    expect(list.body.meta.total).toBe(1);
    expect(profile.body.data.user.rating).toEqual({ average: 5, count: 1 });
    // A feloldás után újra számít
    expect((await listReviews(photo.id)).body.data.rating).toEqual({ average: 3, count: 2 });
  });

  it('a letiltott szerző értékelését más nem látja, ezért a törlési kísérlet 404; az admin törölheti', async () => {
    const photo = await registeredPhoto();
    const review = await reviewOf(buyer.id, photo.id, 2);
    await setBlocked(buyer.id, true);

    const byStranger = await request(app)
      .delete(`/api/reviews/${review.id}`)
      .set('Cookie', strangerCookie);
    const byAdmin = await request(app)
      .delete(`/api/reviews/${review.id}`)
      .set('Cookie', adminCookie);

    expect(byStranger.status).toBe(404);
    expect(byAdmin.status).toBe(204);
    expect(await prisma.review.count()).toBe(0);
  });
});
