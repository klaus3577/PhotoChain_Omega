// Az értékelések a tesztadatbázison (terv 5.1, L15): a kép értékeléseinek listája
// (GET /api/photos/:id/reviews), az értékelés írása – csak a kép kifizetett vásárlója, képenként
// egyszer, 1–5 csillaggal (POST /api/photos/:id/reviews) –, és a törlés – a szerző és az admin
// (DELETE /api/reviews/:id). A nem nyilvános kép értékeléseit csak az látja, aki a képet is.
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { OrderStatus, PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  TEST_ENV,
  UNKNOWN_USER_ID,
} from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  randomHex,
  resetDatabase,
} from '../helpers/testDatabase.js';

const UNKNOWN_ID = UNKNOWN_USER_ID;
const NUL = String.fromCodePoint(0);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
/** Címke-karakter: láthatatlan, de géppel olvasható „A” betű */
const TAG_LETTER_A = String.fromCodePoint(0xe0041);
const LONE_SURROGATE = String.fromCodePoint(0xd800);
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);

let prisma: PrismaClient;
let app: Express;
let owner: { id: string };
let buyer: { id: string };
let stranger: { id: string };
let admin: { id: string };
let categoryId: number;
let ownerCookie: string;
let buyerCookie: string;
let strangerCookie: string;
let adminCookie: string;

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

/** Időpont 2026 októberének megadott napján – a rendezési tesztekhez. */
const onDay = (day: number): Date => new Date(Date.UTC(2026, 9, day, 10));

const photoWithStatus = (status: PhotoStatus) =>
  createPhoto(prisma, { ownerId: owner.id, categoryId, status });

const registeredPhoto = () => photoWithStatus('REGISTERED');

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

interface ReviewFixture {
  rating?: number;
  comment?: string | null;
  createdAt?: Date;
}

const reviewOf = (authorId: string, photoId: string, fixture: ReviewFixture = {}) =>
  prisma.review.create({ data: { authorId, photoId, rating: 5, ...fixture } });

const reviewCount = () => prisma.review.count();

const listReviews = (photoId: string, query = '', cookie?: string, target = app) => {
  const call = request(target).get(`/api/photos/${photoId}/reviews${query}`);
  return cookie === undefined ? call : call.set('Cookie', cookie);
};

const postReview = (photoId: string, body: unknown, cookie = buyerCookie, target = app) =>
  request(target)
    .post(`/api/photos/${photoId}/reviews`)
    .set('Cookie', cookie)
    .send(body as object);

const deleteReview = (reviewId: string, cookie = buyerCookie, target = app) =>
  request(target).delete(`/api/reviews/${reviewId}`).set('Cookie', cookie);

/** Az alkalmazás, amelynek naplósorait a teszt elolvashatja. */
function appWithLog(): { target: Express; lines: string[] } {
  const lines: string[] = [];
  const chain = createTestChain(prisma);
  const target = createApp({
    env: TEST_ENV,
    logger: pino({ level: 'info' }, { write: (line: string) => lines.push(line) }),
    prisma,
    storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
    blockchain: chain.blockchain,
    photoRegistration: chain.photoRegistration,
    payments: createFakePayments().payments,
  });
  return { target, lines };
}

const logEntries = (lines: string[]): Array<Record<string, unknown>> =>
  lines.map((line) => JSON.parse(line) as Record<string, unknown>);

/**
 * A Prisma-kliens, amely a review-delegált megadott műveletét egy beavatkozással előzi meg: hibát dob,
 * vagy egy párhuzamos kérést utánoz (pl. egy másik lapon éppen törölt értékelés).
 */
function interceptingReview(
  method: 'create' | 'deleteMany',
  before: () => Promise<void>,
): PrismaClient {
  return new Proxy(prisma, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property !== 'review') return typeof value === 'function' ? value.bind(target) : value;
      return new Proxy(target.review, {
        get(delegate, name) {
          const member: unknown = Reflect.get(delegate, name);
          if (typeof member !== 'function') return member;
          if (name !== method) return member.bind(delegate);
          return async (...args: unknown[]) => {
            await before();
            return member.apply(delegate, args);
          };
        },
      });
    },
  });
}

describe('GET /api/photos/:id/reviews – a kép értékelései', () => {
  it('a legújabb elöl, a szerző nevével (e-mail nélkül), az átlaggal és a lapozás adataival', async () => {
    const photo = await registeredPhoto();
    const otherPhoto = await registeredPhoto();
    const second = await createUser(prisma, 'szilvi@photochain.test', {
      displayName: 'Vásárló Szilvi',
    });
    const older = await reviewOf(buyer.id, photo.id, {
      rating: 5,
      comment: 'Gyönyörű fények.',
      createdAt: onDay(1),
    });
    const newer = await reviewOf(second.id, photo.id, { rating: 4, createdAt: onDay(2) });
    // Másik kép értékelése: nem keveredhet bele
    await reviewOf(stranger.id, otherPhoto.id, { rating: 1 });

    const response = await listReviews(photo.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        reviews: [
          {
            id: newer.id,
            rating: 4,
            comment: null,
            createdAt: onDay(2).toISOString(),
            author: { id: second.id, displayName: 'Vásárló Szilvi' },
          },
          {
            id: older.id,
            rating: 5,
            comment: 'Gyönyörű fények.',
            createdAt: onDay(1).toISOString(),
            author: { id: buyer.id, displayName: 'Vásárló Vera' },
          },
        ],
        rating: { average: 4.5, count: 2 },
      },
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    });
    expect(response.text).not.toContain('@photochain.test');
  });

  it('értékelés nélkül: üres lista, az átlag null', async () => {
    const photo = await registeredPhoto();

    const response = await listReviews(photo.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { reviews: [], rating: { average: null, count: 0 } },
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  it('lapozás: azonos időpontnál az azonosító dönt (stabil sorrend); az átlag az összes értékelésből', async () => {
    const photo = await registeredPhoto();
    const ratings = [5, 4, 4];
    const reviews = [];
    for (const rating of ratings) {
      const author = await createUser(prisma);
      reviews.push(await reviewOf(author.id, photo.id, { rating, createdAt: onDay(3) }));
    }
    const expectedOrder = reviews
      .map((review) => review.id)
      .sort()
      .reverse();

    const first = await listReviews(photo.id, '?pageSize=2');
    const second = await listReviews(photo.id, '?pageSize=2&page=2');

    expect(first.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(second.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    const ids = [...first.body.data.reviews, ...second.body.data.reviews].map(
      (review: { id: string }) => review.id,
    );
    expect(ids).toEqual(expectedOrder);
    // 13 / 3 = 4,333… → két tizedesre kerekítve, mindkét oldalon ugyanaz
    expect(first.body.data.rating).toEqual({ average: 4.33, count: 3 });
    expect(second.body.data.rating).toEqual({ average: 4.33, count: 3 });
  });

  it('a nem nyilvános kép értékeléseit csak a tulajdonos és az admin látja – másnak (a szerzőnek is) 404', async () => {
    const hidden = await photoWithStatus('HIDDEN');
    await reviewOf(buyer.id, hidden.id, { rating: 2 });

    expect((await listReviews(hidden.id)).status).toBe(404);
    expect((await listReviews(hidden.id, '', strangerCookie)).status).toBe(404);
    expect((await listReviews(hidden.id, '', buyerCookie)).status).toBe(404);
    const forOwner = await listReviews(hidden.id, '', ownerCookie);
    const forAdmin = await listReviews(hidden.id, '', adminCookie);
    expect(forOwner.status).toBe(200);
    expect(forOwner.body.data.rating).toEqual({ average: 2, count: 1 });
    expect(forAdmin.status).toBe(200);
  });

  it('a bejelentkezett nézőnek szóló válasz nem tárolható, és a válasz a sütitől függ (Vary: Cookie)', async () => {
    const photo = await registeredPhoto();

    const anonymous = await listReviews(photo.id);
    const signedIn = await listReviews(photo.id, '', strangerCookie);

    expect(anonymous.headers.vary).toContain('Cookie');
    // A névtelen válasz csak újraellenőrzéssel használható fel (az API alapértelmezése, L31)
    expect(anonymous.headers['cache-control']).toBe('no-cache');
    expect(signedIn.headers.vary).toContain('Cookie');
    expect(signedIn.headers['cache-control']).toBe('no-store');
  });

  it('a hibaválasz (404) is a sütitől függ, és a bejelentkezett nézőnek az sem tárolható', async () => {
    const hidden = await photoWithStatus('HIDDEN');

    const response = await listReviews(hidden.id, '', strangerCookie);

    expect(response.status).toBe(404);
    expect(response.headers.vary).toContain('Cookie');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('az utolsó oldalon túl: üres lista, a lapozás adataival', async () => {
    const photo = await registeredPhoto();
    await reviewOf(buyer.id, photo.id, { rating: 3 });

    const response = await listReviews(photo.id, '?page=5');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ reviews: [], rating: { average: 3, count: 1 } });
    expect(response.body.meta).toEqual({ page: 5, pageSize: 20, total: 1, totalPages: 1 });
  });

  it('a nem támogatott metódus (PATCH, PUT): 404 – semmi nem változik', async () => {
    const photo = await registeredPhoto();
    const review = await reviewOf(buyer.id, photo.id, { rating: 3 });

    const patched = await request(app)
      .patch(`/api/photos/${photo.id}/reviews`)
      .set('Cookie', buyerCookie)
      .send({ rating: 1 });
    const put = await request(app)
      .put(`/api/reviews/${review.id}`)
      .set('Cookie', buyerCookie)
      .send({ rating: 1 });

    expect(patched.status).toBe(404);
    expect(put.status).toBe(404);
    expect(put.body.error.code).toBe('NOT_FOUND');
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).rating).toBe(3);
  });

  it('érvénytelen azonosító vagy lapozás: 400; ismeretlen kép: 404', async () => {
    const photo = await registeredPhoto();

    const invalidId = await listReviews('abc');
    const unknown = await listReviews(UNKNOWN_ID);

    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('VALIDATION_ERROR');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect((await listReviews(photo.id, '?page=0')).status).toBe(400);
    expect((await listReviews(photo.id, '?pageSize=51')).status).toBe(400);
  });
});

describe('POST /api/photos/:id/reviews – értékelés írása', () => {
  it('a kép kifizetett vásárlója értékelhet: 201, a válasz az új értékelés (no-store)', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);

    const response = await postReview(photo.id, {
      rating: 5,
      comment: '  Gyönyörű fények.\r\nKöszönöm!  ',
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const stored = await prisma.review.findFirstOrThrow({ where: { photoId: photo.id } });
    expect(stored).toMatchObject({
      authorId: buyer.id,
      rating: 5,
      comment: 'Gyönyörű fények.\nKöszönöm!',
    });
    expect(response.body).toEqual({
      data: {
        review: {
          id: stored.id,
          rating: 5,
          comment: 'Gyönyörű fények.\nKöszönöm!',
          createdAt: stored.createdAt.toISOString(),
          author: { id: buyer.id, displayName: 'Vásárló Vera' },
        },
      },
    });
  });

  it('a szöveg nem kötelező: a hiányzó, a null és az üres szöveg egyaránt null', async () => {
    const photo = await registeredPhoto();
    const bodies = [{ rating: 3 }, { rating: 3, comment: null }, { rating: 3, comment: '   ' }];
    for (const body of bodies) {
      const author = await createUser(prisma);
      await orderOf(author.id, photo.id);

      const response = await postReview(photo.id, body, sessionCookieFor(author.id));

      expect(response.status).toBe(201);
      expect(response.body.data.review.comment).toBeNull();
    }
    const stored = await prisma.review.findMany({ where: { photoId: photo.id } });
    expect(stored.map((review) => review.comment)).toEqual([null, null, null]);
  });

  it('nem vásárló: 403 – a függő, lejárt vagy sikertelen rendelés sem elég; semmi nem jön létre', async () => {
    const photo = await registeredPhoto();
    const attempts = [strangerCookie];
    for (const status of ['PENDING', 'EXPIRED', 'FAILED'] as const) {
      const user = await createUser(prisma);
      await orderOf(user.id, photo.id, status);
      attempts.push(sessionCookieFor(user.id));
    }

    for (const cookie of attempts) {
      const response = await postReview(photo.id, { rating: 1 }, cookie);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }
    expect(await reviewCount()).toBe(0);
  });

  it('a fotós a saját képét nem értékelheti: 403', async () => {
    const photo = await registeredPhoto();

    const response = await postReview(photo.id, { rating: 5 }, ownerCookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await reviewCount()).toBe(0);
  });

  it('a fotós akkor sem értékelheti a saját képét, ha (pl. régi adat miatt) kifizetett rendelése van rá', async () => {
    const photo = await registeredPhoto();
    await orderOf(owner.id, photo.id);

    const response = await postReview(photo.id, { rating: 5 }, ownerCookie);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('A saját képedet nem értékelheted');
    expect(await reviewCount()).toBe(0);
  });

  it('más vevő kifizetett rendelése nem jogosít: az idegen 403-at kap', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);

    const response = await postReview(photo.id, { rating: 1 }, strangerCookie);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await reviewCount()).toBe(0);
  });

  it('egy kép egyszer értékelhető: a második kísérlet 409 ALREADY_REVIEWED, az első változatlan', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);
    await postReview(photo.id, { rating: 5, comment: 'Első' }).expect(201);

    const again = await postReview(photo.id, { rating: 1, comment: 'Második' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REVIEWED');
    const stored = await prisma.review.findMany({ where: { photoId: photo.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ rating: 5, comment: 'Első' });
  });

  it('párhuzamos kérésekből is egyetlen értékelés lesz (az egyedi index dönt)', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) => postReview(photo.id, { rating: index + 1 })),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await reviewCount()).toBe(1);
  });

  it('a nem nyilvános kép: a (később elrejtett kép) vevőjének 404; a képet látó adminnak 409', async () => {
    const hidden = await photoWithStatus('HIDDEN');
    await orderOf(buyer.id, hidden.id);

    const forBuyer = await postReview(hidden.id, { rating: 5 });
    const forAdmin = await postReview(hidden.id, { rating: 5 }, adminCookie);

    expect(forBuyer.status).toBe(404);
    expect(forAdmin.status).toBe(409);
    expect(forAdmin.body.error.code).toBe('CONFLICT');
    expect(await reviewCount()).toBe(0);
  });

  it('hibás törzs: 400 (soha 500) – semmi nem jön létre', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);
    const bodies: unknown[] = [
      {},
      { rating: 0 },
      { rating: 6 },
      { rating: 4.5 },
      { rating: '5' },
      { rating: 5, comment: 'a'.repeat(1001) },
      { rating: 5, comment: `jó${NUL}kép` },
      { rating: 5, comment: ZERO_WIDTH_SPACE },
      { rating: 5, authorId: stranger.id },
      { rating: 5, photoId: UNKNOWN_ID },
      [{ rating: 5 }],
    ];

    for (const body of bodies) {
      const response = await postReview(photo.id, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    const broken = await request(app)
      .post(`/api/photos/${photo.id}/reviews`)
      .set('Cookie', buyerCookie)
      .set('Content-Type', 'application/json')
      .send('{"rating":');
    expect(broken.status).toBe(400);
    expect(await reviewCount()).toBe(0);
  });

  it('bejelentkezés nélkül 401, letiltott fiókkal 403, más webhelyről 403 – semmi nem jön létre', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);
    const blocked = await createUser(prisma, undefined, { isBlocked: true });
    await orderOf(blocked.id, photo.id);

    const anonymous = await request(app)
      .post(`/api/photos/${photo.id}/reviews`)
      .send({ rating: 5 });
    const blockedResponse = await postReview(photo.id, { rating: 5 }, sessionCookieFor(blocked.id));
    const crossSite = await request(app)
      .post(`/api/photos/${photo.id}/reviews`)
      .set('Cookie', buyerCookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ rating: 5 });

    expect(anonymous.status).toBe(401);
    expect(blockedResponse.status).toBe(403);
    expect(blockedResponse.body.error.code).toBe('ACCOUNT_BLOCKED');
    expect(crossSite.status).toBe(403);
    expect(await reviewCount()).toBe(0);
  });

  it('törzs nélküli kérés (nincs Content-Type): 400', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);

    const response = await request(app)
      .post(`/api/photos/${photo.id}/reviews`)
      .set('Cookie', buyerCookie);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await reviewCount()).toBe(0);
  });

  it('a szövegben rejtett karakterek kimaradnak; a párosítatlan helyettesítő helyén cserekarakter (soha 500)', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);
    const hidden = TAG_LETTER_A.repeat(20) + ZERO_WIDTH_SPACE;

    const response = await postReview(photo.id, {
      rating: 4,
      comment: `Szép${hidden} fények${LONE_SURROGATE}`,
    });

    expect(response.status).toBe(201);
    const stored = await prisma.review.findFirstOrThrow({ where: { photoId: photo.id } });
    expect(stored.comment).toBe(`Szép fények${REPLACEMENT_CHARACTER}`);
    expect(response.body.data.review.comment).toBe(stored.comment);
  });

  it('egyéb adatbázishiba az íráskor: 500 – nem 409 (a „már értékelted” csak az egyedi index ütközése)', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);
    const failing = interceptingReview('create', async () => {
      throw new Error('megszakadt az adatbázis-kapcsolat');
    });

    const response = await postReview(
      photo.id,
      { rating: 5 },
      buyerCookie,
      createTestApp({}, failing),
    );

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(await reviewCount()).toBe(0);
  });

  it('érvénytelen képazonosító: 400; ismeretlen kép: 404', async () => {
    expect((await postReview('abc', { rating: 5 })).status).toBe(400);
    expect((await postReview(UNKNOWN_ID, { rating: 5 })).status).toBe(404);
  });

  it('a jogosulatlan kísérletek nyoma a naplóban (ki, melyik képen)', async () => {
    const photo = await registeredPhoto();
    const { target, lines } = appWithLog();

    await postReview(photo.id, { rating: 5 }, strangerCookie, target).expect(403);
    await postReview(photo.id, { rating: 5 }, ownerCookie, target).expect(403);

    const denied = logEntries(lines).filter((entry) => entry.action === 'review');
    // pino: 40 = warn
    expect(denied).toHaveLength(2);
    expect(denied.every((entry) => entry.level === 40 && entry.photoId === photo.id)).toBe(true);
    expect(denied.map((entry) => entry.actorId).sort()).toEqual([owner.id, stranger.id].sort());
  });
});

describe('DELETE /api/reviews/:id – értékelés törlése', () => {
  it('a szerző törölheti a sajátját: 204 (no-store); utána újat írhat', async () => {
    const photo = await registeredPhoto();
    await orderOf(buyer.id, photo.id);
    const review = await reviewOf(buyer.id, photo.id, { rating: 2 });

    const response = await deleteReview(review.id);

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await reviewCount()).toBe(0);
    await postReview(photo.id, { rating: 4 }).expect(201);
  });

  it('az admin bármelyik értékelést törölheti', async () => {
    const photo = await registeredPhoto();
    const review = await reviewOf(buyer.id, photo.id);

    expect((await deleteReview(review.id, adminCookie)).status).toBe(204);
    expect(await reviewCount()).toBe(0);
  });

  it('más felhasználó – a kép fotósa is –: 403, az értékelés megmarad; nem nyilvános képnél 404', async () => {
    const photo = await registeredPhoto();
    const hidden = await photoWithStatus('HIDDEN');
    const review = await reviewOf(buyer.id, photo.id);
    const onHidden = await reviewOf(buyer.id, hidden.id);

    const byStranger = await deleteReview(review.id, strangerCookie);
    const byOwner = await deleteReview(review.id, ownerCookie);
    const hiddenByStranger = await deleteReview(onHidden.id, strangerCookie);

    expect(byStranger.status).toBe(403);
    expect(byStranger.body.error.code).toBe('FORBIDDEN');
    expect(byOwner.status).toBe(403);
    expect(hiddenByStranger.status).toBe(404);
    expect(await reviewCount()).toBe(2);
  });

  it('versenyhelyzet: ha közben (pl. egy másik lapon) már törölték, 404', async () => {
    const photo = await registeredPhoto();
    const review = await reviewOf(buyer.id, photo.id);
    const racing = interceptingReview('deleteMany', async () => {
      await prisma.review.delete({ where: { id: review.id } });
    });

    const response = await deleteReview(review.id, buyerCookie, createTestApp({}, racing));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('a szerző a később elrejtett kép értékelését is törölheti (a saját tartalma)', async () => {
    const hidden = await photoWithStatus('HIDDEN');
    const review = await reviewOf(buyer.id, hidden.id);

    expect((await deleteReview(review.id)).status).toBe(204);
    expect(await reviewCount()).toBe(0);
  });

  it('ismeretlen (a már törölt is): 404; érvénytelen azonosító: 400; bejelentkezés nélkül 401; más webhelyről 403', async () => {
    const photo = await registeredPhoto();
    const review = await reviewOf(buyer.id, photo.id);

    const crossSite = await deleteReview(review.id).set('Sec-Fetch-Site', 'cross-site');
    const anonymous = await request(app).delete(`/api/reviews/${review.id}`);
    expect(crossSite.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await reviewCount()).toBe(1);

    await deleteReview(review.id).expect(204);
    const again = await deleteReview(review.id);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_FOUND');
    expect((await deleteReview(UNKNOWN_ID)).status).toBe(404);
    expect((await deleteReview('abc')).status).toBe(400);
  });

  it('a napló megőrzi, ki törölte (szerző vagy admin), és a jogosulatlan kísérletet is', async () => {
    const photo = await registeredPhoto();
    const first = await reviewOf(buyer.id, photo.id);
    const second = await reviewOf(stranger.id, photo.id);
    const { target, lines } = appWithLog();

    await deleteReview(first.id, strangerCookie, target).expect(403);
    await deleteReview(first.id, buyerCookie, target).expect(204);
    await deleteReview(second.id, adminCookie, target).expect(204);

    const entries = logEntries(lines);
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        reviewId: first.id,
        photoId: photo.id,
        actorId: stranger.id,
        action: 'delete-review',
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ reviewId: first.id, actorId: buyer.id, deletedBy: 'AUTHOR' }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ reviewId: second.id, actorId: admin.id, deletedBy: 'ADMIN' }),
    );
  });
});
