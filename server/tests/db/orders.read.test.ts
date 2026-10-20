// A rendelések lekérdezése a tesztadatbázison: a rendelés állapota a Stripe-munkamenet azonosítója
// alapján (GET /api/orders/by-session/:sessionId – a sikeres fizetés oldala ezt kérdezi), és a
// vásárlásaim lista (GET /api/me/purchases). Mindkettő csak a saját rendelést mutatja.
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { OrderStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { PaymentError } from '../../src/services/payment.service.js';
import { createFakePayments, type FakePayments } from '../helpers/fakePayments.js';
import { createTestApp, sessionCookieFor } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  randomHex,
  resetDatabase,
} from '../helpers/testDatabase.js';

let prisma: PrismaClient;
let app: Express;
let owner: { id: string };
let buyer: { id: string };
let other: { id: string };
let categoryId: number;
let buyerCookie: string;

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
  buyer = await createUser(prisma, 'vera@photochain.test');
  other = await createUser(prisma, 'oszkar@photochain.test');
  buyerCookie = sessionCookieFor(buyer.id);
  categoryId = (await createCategory(prisma)).id;
});

const newSessionId = (): string => `cs_test_${randomHex(16)}`;

const photoTitled = (title: string) =>
  createPhoto(prisma, { ownerId: owner.id, categoryId, status: 'REGISTERED', title });

interface OrderFixture {
  buyerId?: string;
  photoId: string;
  status?: OrderStatus;
  paidAt?: Date | null;
  stripeSessionId?: string;
}

const orderOf = ({ buyerId = buyer.id, status = 'PAID', ...rest }: OrderFixture) =>
  prisma.order.create({
    data: {
      buyerId,
      amountHuf: 2500,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
      stripeSessionId: newSessionId(),
      ...rest,
    },
  });

const bySession = (sessionId: string, cookie = buyerCookie) =>
  request(app).get(`/api/orders/by-session/${sessionId}`).set('Cookie', cookie);

const purchases = (query = '', cookie = buyerCookie) =>
  request(app).get(`/api/me/purchases${query}`).set('Cookie', cookie);

describe('GET /api/orders/by-session/:sessionId', () => {
  it('a saját rendelés állapota: explicit mezők, a Stripe-azonosító nélkül; no-store', async () => {
    const photo = await photoTitled('Naplemente');
    const order = await orderOf({ photoId: photo.id, status: 'PENDING' });

    const response = await bySession(order.stripeSessionId!);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        order: {
          id: order.id,
          status: 'PENDING',
          amountHuf: 2500,
          createdAt: order.createdAt.toISOString(),
          paidAt: null,
          downloadable: false,
          reviewable: false,
          review: null,
          photo: {
            id: photo.id,
            title: 'Naplemente',
            thumbnailUrl: `/media/${photo.thumbnailKey}`,
            ownerDisplayName: 'Fotós Fanni',
          },
        },
      },
    });
    expect(response.text).not.toContain(order.stripeSessionId);
  });

  it('a kifizetett rendelésnél a fizetés ideje is látszik; az eredeti letölthető, a kép értékelhető', async () => {
    const photo = await photoTitled('Naplemente');
    const order = await orderOf({ photoId: photo.id });

    const response = await bySession(order.stripeSessionId!);

    expect(response.body.data.order).toMatchObject({
      status: 'PAID',
      paidAt: order.paidAt!.toISOString(),
      downloadable: true,
      reviewable: true,
    });
  });

  it('más felhasználó rendelése 404 (a létezését sem árulja el); az ismeretlen is 404', async () => {
    const photo = await photoTitled('Naplemente');
    const foreign = await orderOf({ buyerId: other.id, photoId: photo.id });

    const response = await bySession(foreign.stripeSessionId!);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect((await bySession(newSessionId())).status).toBe(404);
  });

  it('hibás munkamenet-azonosító 400 – soha nem 500', async () => {
    for (const sessionId of [
      'abc',
      'cs_live_a1B2c3',
      'cs_test_a%27b',
      `cs_test_${'a'.repeat(300)}`,
    ]) {
      const response = await bySession(sessionId);
      expect(response.status).toBe(400);
    }
  });

  it('bejelentkezés nélkül 401', async () => {
    const response = await request(app).get(`/api/orders/by-session/${newSessionId()}`);

    expect(response.status).toBe(401);
  });

  it('az elrejtett kép bélyegképe törlődött: thumbnailUrl null', async () => {
    const photo = await createPhoto(prisma, { ownerId: owner.id, categoryId, status: 'HIDDEN' });
    const order = await orderOf({ photoId: photo.id });

    const response = await bySession(order.stripeSessionId!);

    expect(response.body.data.order.photo.thumbnailUrl).toBeNull();
  });
});

// A Stripe ajánlása szerint a sikeroldal is lezárja a rendelést (a webhook késhet vagy elmaradhat): a
// függő rendelés munkamenetét a szerver lekérdezi a Stripe-tól, és ugyanazokkal a szabályokkal zárja
// le, mint a webhook (csak fizetett munkamenetből, egyező összeggel és pénznemmel).
describe('GET /api/orders/by-session/:sessionId – a sikeroldal is lezárja a függő rendelést', () => {
  let fake: FakePayments;

  beforeEach(() => {
    fake = createFakePayments();
    app = createTestApp({}, prisma, undefined, fake.payments);
  });

  /** Függő rendelés a fizetési utánzatban létező munkamenettel (a munkamenet összege megadható). */
  async function pendingOrder(sessionAmountHuf = 2500) {
    const photo = await photoTitled('Naplemente');
    const order = await prisma.order.create({
      data: { buyerId: buyer.id, photoId: photo.id, amountHuf: 2500, status: 'PENDING' },
    });
    const session = fake.createSession({
      orderId: order.id,
      amountHuf: sessionAmountHuf,
      productName: 'Naplemente',
      successUrl: 'http://localhost:5173/checkout/success',
      cancelUrl: 'http://localhost:5173/checkout/cancel',
      expiresAt: new Date(Date.now() + 31 * 60_000),
    });
    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return { order, sessionId: session.id };
  }

  const storedStatus = async (orderId: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

  it('a kifizetett munkamenet rendelése PAID lesz, ha a webhook még nem érkezett meg – letölthető', async () => {
    const { order, sessionId } = await pendingOrder();
    fake.pay(sessionId);

    const response = await bySession(sessionId);

    expect(response.status).toBe(200);
    expect(response.body.data.order).toMatchObject({
      id: order.id,
      status: 'PAID',
      downloadable: true,
      reviewable: true,
    });
    expect(response.body.data.order.paidAt).not.toBeNull();
    expect(await storedStatus(order.id)).toBe('PAID');
    expect(fake.payments.getCheckoutSession).toHaveBeenCalledExactlyOnceWith(sessionId);
  });

  it('a még nyitott (nem fizetett) munkamenet rendelése függő marad', async () => {
    const { order, sessionId } = await pendingOrder();

    const response = await bySession(sessionId);

    expect(response.body.data.order.status).toBe('PENDING');
    expect(await storedStatus(order.id)).toBe('PENDING');
  });

  it('a lejárt munkamenet rendelése EXPIRED lesz', async () => {
    const { order, sessionId } = await pendingOrder();
    fake.expire(sessionId);

    const response = await bySession(sessionId);

    expect(response.body.data.order.status).toBe('EXPIRED');
    expect(await storedStatus(order.id)).toBe('EXPIRED');
  });

  it('eltérő fizetett összegnél nem lesz PAID (ugyanaz a szabály, mint a webhooknál)', async () => {
    const { order, sessionId } = await pendingOrder(1000);
    fake.pay(sessionId);

    const response = await bySession(sessionId);

    expect(response.body.data.order.status).toBe('PENDING');
    expect(await storedStatus(order.id)).toBe('PENDING');
  });

  it('ha a munkamenet metaadata más rendelésre mutat, egyik rendelés sem záródik le', async () => {
    const { order } = await pendingOrder();
    const second = await pendingOrder();
    // A másik rendelés munkamenete kerül ehhez a rendeléshez (hibás adat): fizetett, de nem ezé
    await prisma.order.update({
      where: { id: second.order.id },
      data: { stripeSessionId: null },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: second.sessionId },
    });
    fake.pay(second.sessionId);

    const response = await bySession(second.sessionId);

    expect(response.body.data.order).toMatchObject({ id: order.id, status: 'PENDING' });
    expect(await storedStatus(order.id)).toBe('PENDING');
    expect(await storedStatus(second.order.id)).toBe('PENDING');
  });

  it('ha a Stripe nem érhető el, a tárolt állapot jön vissza – nem hiba', async () => {
    const { sessionId } = await pendingOrder();
    fake.payments.getCheckoutSession.mockRejectedValueOnce(new PaymentError('nem érhető el'));

    const response = await bySession(sessionId);

    expect(response.status).toBe(200);
    expect(response.body.data.order.status).toBe('PENDING');
  });

  it('a lezárt rendelésnél és más vevő rendelésénél a Stripe-ot nem kérdezi', async () => {
    const { order, sessionId } = await pendingOrder();
    fake.pay(sessionId);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

    expect((await bySession(sessionId)).body.data.order.status).toBe('PAID');
    expect((await bySession(sessionId, sessionCookieFor(other.id))).status).toBe(404);
    expect(fake.payments.getCheckoutSession).not.toHaveBeenCalled();
  });
});

describe('GET /api/me/purchases', () => {
  it('csak a saját, kifizetett (PAID) rendelések, a legutóbb fizetett elöl, meta objektummal; no-store', async () => {
    const first = await photoTitled('Első');
    const second = await photoTitled('Második');
    const pending = await photoTitled('Függő');
    const older = await orderOf({ photoId: first.id, paidAt: new Date('2026-10-01T10:00:00Z') });
    const newer = await orderOf({ photoId: second.id, paidAt: new Date('2026-10-03T10:00:00Z') });
    await orderOf({ photoId: pending.id, status: 'PENDING' });
    await orderOf({ photoId: pending.id, status: 'EXPIRED' });
    await orderOf({ buyerId: other.id, photoId: first.id });

    const response = await purchases();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.orders.map((order: { id: string }) => order.id)).toEqual([
      newer.id,
      older.id,
    ]);
    expect(response.body.data.orders[0]).toEqual({
      id: newer.id,
      status: 'PAID',
      amountHuf: 2500,
      createdAt: newer.createdAt.toISOString(),
      paidAt: '2026-10-03T10:00:00.000Z',
      downloadable: true,
      reviewable: true,
      review: null,
      photo: {
        id: second.id,
        title: 'Második',
        thumbnailUrl: `/media/${second.thumbnailKey}`,
        ownerDisplayName: 'Fotós Fanni',
      },
    });
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(response.text).not.toMatch(/cs_test_|originals\//);
  });

  it('a vevő saját értékelése a rendelésben – másé nem; aki már értékelt, nem értékelhet újra (L22)', async () => {
    const reviewed = await photoTitled('Értékelt');
    const unreviewed = await photoTitled('Értékeletlen');
    await orderOf({ photoId: reviewed.id, paidAt: new Date('2026-10-02T10:00:00Z') });
    await orderOf({ photoId: unreviewed.id, paidAt: new Date('2026-10-01T10:00:00Z') });
    await orderOf({ buyerId: other.id, photoId: unreviewed.id });
    const own = await prisma.review.create({
      data: { photoId: reviewed.id, authorId: buyer.id, rating: 4, comment: 'Szép' },
    });
    await prisma.review.create({ data: { photoId: unreviewed.id, authorId: other.id, rating: 2 } });

    const response = await purchases();

    const [first, second] = response.body.data.orders as {
      review: unknown;
      reviewable: boolean;
    }[];
    expect(first).toMatchObject({ review: { id: own.id, rating: 4 }, reviewable: false });
    expect(second).toMatchObject({ review: null, reviewable: true });
    expect(response.text).not.toContain('Szép');
  });

  it('a moderátor által levett kép rendelése nem tölthető le és nem értékelhető; a tulajdonos által elrejtett letölthető marad (L16, L22)', async () => {
    const takenDown = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      status: 'HIDDEN',
      hiddenBy: 'ADMIN',
      title: 'Levett',
    });
    const ownerHidden = await createPhoto(prisma, {
      ownerId: owner.id,
      categoryId,
      status: 'HIDDEN',
      hiddenBy: 'OWNER',
      title: 'Elrejtett',
    });
    await orderOf({ photoId: takenDown.id, paidAt: new Date('2026-10-02T10:00:00Z') });
    await orderOf({ photoId: ownerHidden.id, paidAt: new Date('2026-10-01T10:00:00Z') });

    const response = await purchases();

    const [first, second] = response.body.data.orders as {
      photo: { title: string; thumbnailUrl: string | null };
      downloadable: boolean;
      reviewable: boolean;
    }[];
    expect(first).toMatchObject({
      photo: { title: 'Levett', thumbnailUrl: null },
      downloadable: false,
      reviewable: false,
    });
    expect(second).toMatchObject({
      photo: { title: 'Elrejtett', thumbnailUrl: null },
      downloadable: true,
      reviewable: false,
    });
    // A döntés oka (ki rejtette el, tiltás) és a fájl helye nem kerül a válaszba
    expect(response.text).not.toMatch(/hiddenBy|isBlocked|originals\//);
  });

  it('a letiltott fotós képe: a megvett eredeti letölthető, de a kép (nem nyilvános) nem értékelhető; a tiltás mezője nem kerül a válaszba (L22)', async () => {
    const blocked = await createUser(prisma, 'tiltott@photochain.test', {
      displayName: 'Tiltott Tamás',
      isBlocked: true,
    });
    const photo = await createPhoto(prisma, {
      ownerId: blocked.id,
      categoryId,
      status: 'REGISTERED',
      title: 'Tiltott fotós képe',
    });
    await orderOf({ photoId: photo.id });

    const response = await purchases();

    expect(response.body.data.orders[0]).toMatchObject({
      photo: { title: 'Tiltott fotós képe', ownerDisplayName: 'Tiltott Tamás' },
      downloadable: true,
      reviewable: false,
    });
    expect(response.text).not.toMatch(/isBlocked|hiddenBy/);
  });

  it('lapozás page és pageSize szerint; a hibás érték 400', async () => {
    for (let day = 1; day <= 3; day += 1) {
      const photo = await photoTitled(`Kép ${day}`);
      await orderOf({ photoId: photo.id, paidAt: new Date(Date.UTC(2026, 9, day, 10)) });
    }

    const response = await purchases('?page=2&pageSize=2');

    expect(
      response.body.data.orders.map((order: { photo: { title: string } }) => order.photo.title),
    ).toEqual(['Kép 1']);
    expect(response.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    for (const query of ['?page=0', '?pageSize=51', '?page=abc', '?page=1&page=2']) {
      expect((await purchases(query)).status).toBe(400);
    }
  });

  it('vásárlás nélkül üres lista', async () => {
    const response = await purchases();

    expect(response.body).toEqual({
      data: { orders: [] },
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  it('bejelentkezés nélkül 401', async () => {
    expect((await request(app).get('/api/me/purchases')).status).toBe(401);
  });
});
