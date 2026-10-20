// A publikus fotósprofil (GET /api/users/:id), a saját profil módosítása (PATCH /api/me) és a saját
// képek listája (GET /api/me/photos) a tesztadatbázison.
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp, sessionCookieFor, UNKNOWN_USER_ID } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  type PhotoFixture,
  resetDatabase,
} from '../helpers/testDatabase.js';

const NUL = String.fromCodePoint(0);

let prisma: PrismaClient;
let app: Express;
let user: { id: string; createdAt: Date };
let cookie: string;
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
  user = await createUser(prisma, 'fanni@photochain.test', { displayName: 'Fotós Fanni' });
  cookie = sessionCookieFor(user.id);
  categoryId = (await createCategory(prisma)).id;
});

const photoOf = (ownerId: string, fixture: Partial<PhotoFixture> = {}) =>
  createPhoto(prisma, { ownerId, categoryId, ...fixture });

const storedUser = () => prisma.user.findUniqueOrThrow({ where: { id: user.id } });

/** Időpont 2026 októberének megadott napján – a rendezési tesztekhez. */
const onDay = (day: number): Date => new Date(Date.UTC(2026, 9, day, 10));

describe('GET /api/users/:id – publikus fotósprofil', () => {
  it('név, bemutatkozás, regisztráció ideje és a nyilvános képek száma – e-mail, szerepkör és tiltás nélkül', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { bio: 'Tájképek és portrék' } });
    await photoOf(user.id, { status: 'REGISTERED' });
    await photoOf(user.id, { status: 'REGISTERED' });
    await photoOf(user.id, { status: 'PENDING_CHAIN' });
    await photoOf(user.id, { status: 'HIDDEN' });
    await photoOf((await createUser(prisma)).id, { status: 'REGISTERED' });

    const response = await request(app).get(`/api/users/${user.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        user: {
          id: user.id,
          displayName: 'Fotós Fanni',
          bio: 'Tájképek és portrék',
          createdAt: user.createdAt.toISOString(),
          photoCount: 2,
          rating: { average: null, count: 0 },
        },
      },
    });
  });

  it('a fotós átlagos értékelése és az értékelések száma – csak a nyilvános képei értékeléseiből, két tizedesre kerekítve', async () => {
    const first = await photoOf(user.id, { status: 'REGISTERED' });
    const second = await photoOf(user.id, { status: 'REGISTERED' });
    const hidden = await photoOf(user.id, { status: 'HIDDEN' });
    const foreign = await photoOf((await createUser(prisma)).id, { status: 'REGISTERED' });
    const reviewers = [await createUser(prisma), await createUser(prisma)];
    const review = (authorId: string, photoId: string, rating: number) =>
      prisma.review.create({ data: { authorId, photoId, rating } });
    await review(reviewers[0]!.id, first.id, 5);
    await review(reviewers[1]!.id, first.id, 4);
    await review(reviewers[0]!.id, second.id, 4);
    // Nem számítanak bele: a rejtett képe és a más fotós képének értékelése
    await review(reviewers[0]!.id, hidden.id, 1);
    await review(reviewers[0]!.id, foreign.id, 1);

    const response = await request(app).get(`/api/users/${user.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.rating).toEqual({ average: 4.33, count: 3 });
  });

  it('a letiltott fotós profilja a tiltás idejére 404 (L16) – a tiltás ténye sem derül ki', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isBlocked: true } });

    const response = await request(app).get(`/api/users/${user.id}`);

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('A felhasználó nem található');
  });

  it('ismeretlen felhasználó: 404; érvénytelen azonosító: 400', async () => {
    const missing = await request(app).get(`/api/users/${UNKNOWN_USER_ID}`);
    const invalid = await request(app).get('/api/users/abc');

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/me – saját profil', () => {
  const patchMe = (body: unknown, as = cookie) =>
    request(app)
      .patch('/api/me')
      .set('Cookie', as)
      .send(body as object);

  it('a név és a bemutatkozás módosítható; a válasz a saját adatai, nem tárolható (no-store)', async () => {
    const response = await patchMe({ displayName: '  Kiss Fanni ', bio: 'Tájképek\r\nés portrék' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        user: {
          id: user.id,
          email: 'fanni@photochain.test',
          displayName: 'Kiss Fanni',
          bio: 'Tájképek\nés portrék',
          role: 'USER',
          createdAt: user.createdAt.toISOString(),
        },
      },
    });
    expect(await storedUser()).toMatchObject({
      displayName: 'Kiss Fanni',
      bio: 'Tájképek\nés portrék',
    });
  });

  it('a bemutatkozás törölhető; a meg nem adott név nem változik', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { bio: 'Régi bemutatkozás' } });

    await patchMe({ bio: null }).expect(200);

    expect(await storedUser()).toMatchObject({ displayName: 'Fotós Fanni', bio: null });
  });

  it.each([
    ['role', 'ADMIN'],
    ['isBlocked', false],
    ['email', 'uj@photochain.test'],
    ['passwordHash', 'x'],
  ])('a(z) %s nem módosítható: 400, és semmi nem változik', async (field, value) => {
    const response = await patchMe({ displayName: 'Kiss Fanni', [field]: value });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: '', message: `ismeretlen mező: ${field}` },
    ]);
    expect(await storedUser()).toMatchObject({
      displayName: 'Fotós Fanni',
      role: 'USER',
      isBlocked: false,
      email: 'fanni@photochain.test',
    });
  });

  it.each([
    ['üres törzs', {}],
    ['NUL a bemutatkozásban', { bio: `a${NUL}b` }],
    ['túl hosszú bemutatkozás', { bio: 'a'.repeat(501) }],
    ['túl rövid név', { displayName: 'A' }],
    ['szám a név helyén', { displayName: 42 }],
    ['tömb', []],
  ])('hibás törzs (%s): 400 VALIDATION_ERROR, soha 500', async (_name, body) => {
    const response = await patchMe(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  // L30: a platformra vagy a moderátorokra emlékeztető név megtévesztésre adna módot
  it('foglalt névre (pl. „Adminisztrátor”) 400, a név nem változik', async () => {
    for (const displayName of ['Adminisztrátor', 'Ph0t0Chain Support']) {
      const response = await patchMe({ displayName, bio: 'Új bemutatkozás' });

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Érvénytelen bemenet',
        details: [
          {
            path: 'displayName',
            message: 'ez a név foglalt (a platform vagy a moderátorok nevére emlékeztet)',
          },
        ],
      });
    }
    expect(await storedUser()).toMatchObject({ displayName: 'Fotós Fanni', bio: null });
  });

  it('a már meglévő foglalt nevét megtarthatja (pl. a bemutatkozás módosításakor újra elküldve)', async () => {
    await prisma.user.update({ where: { id: user.id }, data: { displayName: 'Moderátor Kati' } });

    await patchMe({ displayName: 'Moderátor Kati', bio: 'Új' }).expect(200);

    expect(await storedUser()).toMatchObject({ displayName: 'Moderátor Kati', bio: 'Új' });
  });

  it('az adminisztrátor viselhet foglalt nevet', async () => {
    const admin = await createUser(prisma, 'admin@photochain.test', { role: 'ADMIN' });

    await patchMe({ displayName: 'Adminisztrátor' }, sessionCookieFor(admin.id)).expect(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).displayName).toBe(
      'Adminisztrátor',
    );
  });

  it('bejelentkezés nélkül 401; letiltott fiókkal 403', async () => {
    expect((await request(app).patch('/api/me').send({ bio: 'x' })).status).toBe(401);

    await prisma.user.update({ where: { id: user.id }, data: { isBlocked: true } });

    expect((await patchMe({ bio: 'x' })).status).toBe(403);
    expect((await storedUser()).bio).toBeNull();
  });

  it('más webhelyről indított kérés: 403 (CSRF-védelem), és semmi nem változik', async () => {
    const response = await request(app)
      .patch('/api/me')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ bio: 'x' });

    expect(response.status).toBe(403);
    expect((await storedUser()).bio).toBeNull();
  });
});

describe('GET /api/me/photos – saját képek', () => {
  const myPhotos = (query = '') => request(app).get(`/api/me/photos${query}`).set('Cookie', cookie);

  it('a saját képek minden állapotban (a rejtett is), a legújabb elöl – mások képei nem', async () => {
    const statuses = ['REGISTERED', 'PENDING_CHAIN', 'CHAIN_FAILED', 'HIDDEN'] as const;
    for (const [index, status] of statuses.entries()) {
      await photoOf(user.id, { status, title: status, createdAt: onDay(index + 1) });
    }
    await photoOf((await createUser(prisma)).id, { status: 'REGISTERED', title: 'Másé' });

    const response = await myPhotos();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.photos.map((photo: { title: string }) => photo.title)).toEqual([
      'HIDDEN',
      'CHAIN_FAILED',
      'PENDING_CHAIN',
      'REGISTERED',
    ]);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 4, totalPages: 1 });
    // Az elrejtett kép nyilvános fájljai törlődtek: nincs bélyegkép-URL-je
    expect(response.body.data.photos[0]).toMatchObject({ status: 'HIDDEN', thumbnailUrl: null });
    expect(response.body.data.photos[1].thumbnailUrl).toMatch(/^\/media\/thumbnails\//);
  });

  it('a tulajdonos látja, ki rejtette el a képét (hiddenBy), és a függő regisztrációs tranzakciót (L22)', async () => {
    const txHash = `0x${'ab'.repeat(32)}`;
    await photoOf(user.id, { status: 'REGISTERED', title: 'Hitelesítve', createdAt: onDay(1) });
    await photoOf(user.id, {
      status: 'PENDING_CHAIN',
      title: 'Függő',
      chainTxHash: txHash,
      createdAt: onDay(2),
    });
    await photoOf(user.id, { status: 'HIDDEN', title: 'Saját levétel', createdAt: onDay(3) });
    await photoOf(user.id, {
      status: 'HIDDEN',
      hiddenBy: 'ADMIN',
      title: 'Moderátori levétel',
      createdAt: onDay(4),
    });

    const response = await myPhotos();

    const photos = response.body.data.photos as {
      title: string;
      hiddenBy: string | null;
      pendingTransaction: unknown;
    }[];
    expect(
      photos.map(({ title, hiddenBy, pendingTransaction }) => [
        title,
        hiddenBy,
        pendingTransaction,
      ]),
    ).toEqual([
      ['Moderátori levétel', 'ADMIN', null],
      ['Saját levétel', 'OWNER', null],
      // A tesztkörnyezet lánca a lokális Hardhat-hálózat: a tranzakciónak nincs nyilvános linkje
      ['Függő', null, { txHash, txUrl: null }],
      ['Hitelesítve', null, null],
    ]);
  });

  it('a saját képek listájában is ott az értékelések összesítése', async () => {
    const photo = await photoOf(user.id, { status: 'REGISTERED' });
    const reviewer = await createUser(prisma);
    await prisma.review.create({ data: { authorId: reviewer.id, photoId: photo.id, rating: 4 } });

    const response = await myPhotos();

    expect(response.body.data.photos[0].rating).toEqual({ average: 4, count: 1 });
  });

  it('lapozás a meta adataival', async () => {
    for (const day of [1, 2, 3]) {
      await photoOf(user.id, { title: `${day}. nap`, createdAt: onDay(day) });
    }

    const response = await myPhotos('?page=2&pageSize=2');

    expect(response.body.data.photos.map((photo: { title: string }) => photo.title)).toEqual([
      '1. nap',
    ]);
    expect(response.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('bejelentkezés nélkül 401; hibás lapozás 400', async () => {
    expect((await request(app).get('/api/me/photos')).status).toBe(401);

    for (const query of ['?page=0', '?pageSize=51', '?page=abc', '?page=1&page=2']) {
      const response = await myPhotos(query);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
