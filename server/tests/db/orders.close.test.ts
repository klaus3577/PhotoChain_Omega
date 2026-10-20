// A nyitott fizetések lezárása a tesztadatbázison, a Stripe utánzatával (L16, szerzői döntés,
// 2026-10-06): a kép elrejtésekor (tulajdonos vagy admin) és a felhasználó tiltásakor a még
// fizetetlen Checkout-munkameneteket a szerver lejárttá teszi (Stripe expire), a rendelés EXPIRED
// lesz; a munkamenet nélküli (épp induló) rendelés FAILED – a munkamenete így már nem kerül hozzá.
// Ha a Stripe nem érhető el, az elrejtés és a tiltás akkor is megtörténik, és a hiba a naplóba kerül.
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { OrderStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { CHECKOUT_CLOSE_CONCURRENCY } from '../../src/modules/orders/orders.service.js';
import { PaymentError } from '../../src/services/payment.service.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments, type FakePayments } from '../helpers/fakePayments.js';
import { databaseDown, intercepting } from '../helpers/intercepting.js';
import { createTestApp, createTestChain, sessionCookieFor, TEST_ENV } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  randomHex,
  resetDatabase,
} from '../helpers/testDatabase.js';
import { deferred } from '../helpers/uploads.js';

let prisma: PrismaClient;
let app: Express;
let fake: FakePayments;
let owner: { id: string };
let ownerCookie: string;
let adminCookie: string;
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
  fake = createFakePayments();
  app = createTestApp({}, prisma, undefined, fake.payments);
  owner = await createUser(prisma, 'fanni@photochain.test');
  ownerCookie = sessionCookieFor(owner.id);
  adminCookie = sessionCookieFor((await createUser(prisma, undefined, { role: 'ADMIN' })).id);
  categoryId = (await createCategory(prisma)).id;
});

const registeredPhoto = (ownerId = owner.id) =>
  createPhoto(prisma, { ownerId, categoryId, status: 'REGISTERED' });

/** Új vevő, aki fizetést indít a képre (nyitott Checkout-munkamenet). */
async function openCheckout(photoId: string, buyerId?: string) {
  const id = buyerId ?? (await createUser(prisma)).id;
  const response = await request(app)
    .post('/api/orders/checkout')
    .set('Cookie', sessionCookieFor(id))
    .send({ photoId });
  expect(response.status).toBe(201);
  return prisma.order.findUniqueOrThrow({ where: { id: response.body.data.orderId as string } });
}

/** A rendelés közvetlenül az adatbázisban (pl. a munkamenet nélküli, éppen induló fizetés). */
const orderOf = (photoId: string, status: OrderStatus, stripeSessionId: string | null) =>
  createUser(prisma).then((buyer) =>
    prisma.order.create({
      data: {
        buyerId: buyer.id,
        photoId,
        amountHuf: 2500,
        status,
        paidAt: status === 'PAID' ? new Date() : null,
        stripeSessionId,
      },
    }),
  );

const statusOf = async (orderId: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

const hideAsOwner = (photoId: string, target: Express = app) =>
  request(target).delete(`/api/photos/${photoId}`).set('Cookie', ownerCookie);

const setBlocked = (userId: string, isBlocked: boolean) =>
  request(app)
    .patch(`/api/admin/users/${userId}`)
    .set('Cookie', adminCookie)
    .send({ isBlocked })
    .expect(200);

describe('a kép elrejtésekor', () => {
  it('a kép nyitott fizetései lejárnak (EXPIRED), a munkamenet nélküli FAILED, a kifizetett és a más képé nem változik', async () => {
    const photo = await registeredPhoto();
    const other = await registeredPhoto();
    const open = await openCheckout(photo.id);
    const starting = await orderOf(photo.id, 'PENDING', null);
    const paid = await orderOf(photo.id, 'PAID', `cs_test_${randomHex(16)}`);
    const otherOpen = await openCheckout(other.id);

    await hideAsOwner(photo.id).expect(204);

    expect(await statusOf(open.id)).toBe('EXPIRED');
    expect(fake.sessions.get(open.stripeSessionId!)?.status).toBe('expired');
    expect(await statusOf(starting.id)).toBe('FAILED');
    expect(await statusOf(paid.id)).toBe('PAID');
    expect(await statusOf(otherOpen.id)).toBe('PENDING');
    expect(fake.sessions.get(otherOpen.stripeSessionId!)?.status).toBe('open');
    expect(fake.payments.expireCheckoutSession).toHaveBeenCalledExactlyOnceWith(
      open.stripeSessionId,
    );
  });

  it('az admin elrejtése is lezárja a nyitott fizetéseket', async () => {
    const photo = await registeredPhoto();
    const open = await openCheckout(photo.id);

    await request(app)
      .patch(`/api/admin/photos/${photo.id}`)
      .set('Cookie', adminCookie)
      .send({ hidden: true })
      .expect(200);

    expect(await statusOf(open.id)).toBe('EXPIRED');
  });

  it('ha a Stripe nem érhető el: az elrejtés megtörténik, a rendelés függő marad, a hiba a naplóba kerül', async () => {
    const photo = await registeredPhoto();
    const open = await openCheckout(photo.id);
    fake.payments.expireCheckoutSession.mockRejectedValueOnce(
      new PaymentError('A Checkout-munkamenet nem tehető lejárttá'),
    );
    const lines: string[] = [];
    const chain = createTestChain(prisma);
    const logged = createApp({
      env: TEST_ENV,
      logger: pino({ level: 'info' }, { write: (line: string) => lines.push(line) }),
      prisma,
      storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: fake.payments,
    });

    const response = await hideAsOwner(photo.id, logged);

    expect(response.status).toBe(204);
    expect((await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } })).status).toBe(
      'HIDDEN',
    );
    expect(await statusOf(open.id)).toBe('PENDING');
    const warning = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.orderId === open.id && entry.level === 40);
    expect(warning).toMatchObject({ sessionId: open.stripeSessionId });
  });

  it('a már kifizetett (de még le nem zárt) munkamenet nem jár le: a Stripe eseménye dönt róla', async () => {
    const photo = await registeredPhoto();
    const open = await openCheckout(photo.id);
    fake.pay(open.stripeSessionId!);

    await hideAsOwner(photo.id).expect(204);

    expect(fake.sessions.get(open.stripeSessionId!)?.status).toBe('complete');
    expect(await statusOf(open.id)).toBe('PENDING');
  });

  it('az elrejtés közben induló fizetés munkamenete nem kerül a rendeléshez: 404, fizetési oldal nélkül', async () => {
    const photo = await registeredPhoto();
    const buyerCookie = sessionCookieFor((await createUser(prisma)).id);
    const gate = deferred();
    let createdId = '';
    fake.payments.createCheckoutSession.mockImplementationOnce(async (checkoutRequest) => {
      await gate.promise;
      const created = fake.createSession(checkoutRequest);
      createdId = created.id;
      return created;
    });

    const checkout = request(app)
      .post('/api/orders/checkout')
      .set('Cookie', buyerCookie)
      .send({ photoId: photo.id })
      .then((response) => response);
    // A rendelés már létrejött, a Stripe-munkamenet létrehozása folyamatban
    await vi.waitFor(() => expect(fake.payments.createCheckoutSession).toHaveBeenCalled());
    await hideAsOwner(photo.id).expect(204);
    gate.resolve();
    const response = await checkout;

    // A vevő a valódi okot kapja (a kép már nem látható), nem a „próbáld újra” 409-et
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(response.body)).not.toContain('checkout.stripe.com');
    const order = await prisma.order.findFirstOrThrow({ where: { photoId: photo.id } });
    expect(order).toMatchObject({ status: 'FAILED', stripeSessionId: null });
    // A közben létrejött, gazdátlan munkamenet sem marad nyitva (a címe ki sem ment)
    expect(fake.sessions.get(createdId)?.status).toBe('expired');
  });

  it('ha a munkamenet épp a lezárás közben kerül a rendeléshez, az is lejár', async () => {
    const photo = await registeredPhoto();
    const order = await orderOf(photo.id, 'PENDING', null);
    const session = fake.createSession({
      orderId: order.id,
      amountHuf: 2500,
      productName: 'Tócsa',
      successUrl: 'http://localhost:5173/checkout/success',
      cancelUrl: 'http://localhost:5173/checkout/cancel',
      expiresAt: new Date(Date.now() + 31 * 60_000),
    });
    // A fizetés indítása épp a FAILED-lezárás előtt csatolja a munkamenetét a rendeléshez
    let attached = false;
    const racing = intercepting(prisma, 'order', 'updateMany', async (target) => {
      if (attached) return;
      attached = true;
      await target.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    });

    await hideAsOwner(photo.id, createTestApp({}, racing, undefined, fake.payments)).expect(204);

    expect(fake.payments.expireCheckoutSession).toHaveBeenCalledExactlyOnceWith(session.id);
    expect(await statusOf(order.id)).toBe('EXPIRED');
  });

  it('ha a munkamenet nélküli rendelést közben más zárta le, nincs több teendő', async () => {
    const photo = await registeredPhoto();
    const order = await orderOf(photo.id, 'PENDING', null);
    // Pl. a fizetés indítása a Stripe hibája miatt maga zárta le (FAILED)
    let closed = false;
    const racing = intercepting(prisma, 'order', 'updateMany', async (target) => {
      if (closed) return;
      closed = true;
      await target.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
    });

    await hideAsOwner(photo.id, createTestApp({}, racing, undefined, fake.payments)).expect(204);

    expect(fake.payments.expireCheckoutSession).not.toHaveBeenCalled();
    expect(await statusOf(order.id)).toBe('FAILED');
  });

  it('a Stripe-hívások párhuzamosan, de korlátozott számban futnak – több egyidejű elrejtésnél együttvéve is', async () => {
    const photos = [await registeredPhoto(), await registeredPhoto()];
    const orders = [];
    for (const photo of photos) {
      for (let index = 0; index < CHECKOUT_CLOSE_CONCURRENCY; index += 1) {
        orders.push(await openCheckout(photo.id));
      }
    }
    const expireSession = fake.payments.expireCheckoutSession.getMockImplementation()!;
    let inFlight = 0;
    let maxInFlight = 0;
    fake.payments.expireCheckoutSession.mockImplementation(async (id: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return await expireSession(id);
      } finally {
        inFlight -= 1;
      }
    });

    const hides = await Promise.all(photos.map((photo) => hideAsOwner(photo.id)));

    expect(hides.map((response) => response.status)).toEqual([204, 204]);
    expect(maxInFlight).toBe(CHECKOUT_CLOSE_CONCURRENCY);
    for (const order of orders) expect(await statusOf(order.id)).toBe('EXPIRED');
  });
});

describe('a fizetés indításakor (versenyhelyzet az elrejtéssel és a tiltással)', () => {
  /** Az ellenőrzés UTÁN, de a rendelés beszúrása ELŐTT bekövetkező változás. */
  const changedBeforeOrderCreate = (change: (target: PrismaClient) => Promise<unknown>) =>
    intercepting(prisma, 'order', 'create', change);

  const checkoutVia = (client: PrismaClient, buyerId: string, photoId: string) =>
    request(createTestApp({}, client, undefined, fake.payments))
      .post('/api/orders/checkout')
      .set('Cookie', sessionCookieFor(buyerId))
      .send({ photoId });

  /** A rendelés lezárult, Stripe-munkamenet nem jött létre (fizetési oldal sem ment ki). */
  async function expectNoPayableSession(photoId: string): Promise<void> {
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
    const order = await prisma.order.findFirstOrThrow({ where: { photoId } });
    expect(order).toMatchObject({ status: 'FAILED', stripeSessionId: null });
  }

  it('ha a képet az ellenőrzés után rejtik el: 404 (a vevő már nem látja)', async () => {
    const photo = await registeredPhoto();
    const buyer = await createUser(prisma);
    const client = changedBeforeOrderCreate((target) =>
      target.photo.update({
        where: { id: photo.id },
        data: { status: 'HIDDEN', hiddenBy: 'OWNER' },
      }),
    );

    const response = await checkoutVia(client, buyer.id, photo.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    await expectNoPayableSession(photo.id);
  });

  it('ha a fotóst az ellenőrzés után tiltják le: 404 (a vevő már nem látja)', async () => {
    const photo = await registeredPhoto();
    const buyer = await createUser(prisma);
    const client = changedBeforeOrderCreate((target) =>
      target.user.update({ where: { id: owner.id }, data: { isBlocked: true } }),
    );

    const response = await checkoutVia(client, buyer.id, photo.id);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    await expectNoPayableSession(photo.id);
  });

  it('ha a vevőt az ellenőrzés után tiltják le: 403 ACCOUNT_BLOCKED', async () => {
    const photo = await registeredPhoto();
    const buyer = await createUser(prisma);
    const client = changedBeforeOrderCreate((target) =>
      target.user.update({ where: { id: buyer.id }, data: { isBlocked: true } }),
    );

    const response = await checkoutVia(client, buyer.id, photo.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_BLOCKED');
    await expectNoPayableSession(photo.id);
  });

  it('ha a képet látó adminnak rejtik el közben: 409 NOT_PURCHASABLE (neki a kép létezik)', async () => {
    const photo = await registeredPhoto();
    const admin = await createUser(prisma, undefined, { role: 'ADMIN' });
    const client = changedBeforeOrderCreate((target) =>
      target.photo.update({
        where: { id: photo.id },
        data: { status: 'HIDDEN', hiddenBy: 'OWNER' },
      }),
    );

    const response = await checkoutVia(client, admin.id, photo.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NOT_PURCHASABLE');
    await expectNoPayableSession(photo.id);
  });

  it('ha az újraellenőrzés és a lezárás is hibára fut: 500, a lezárás hibája a naplóba kerül', async () => {
    const photo = await registeredPhoto();
    const buyer = await createUser(prisma);
    let reads = 0;
    const readFails = intercepting(prisma, 'photo', 'findUnique', async () => {
      reads += 1;
      if (reads > 1) await databaseDown();
    });
    const client = intercepting(readFails, 'order', 'updateMany', databaseDown);
    const lines: string[] = [];
    const chain = createTestChain(client);
    const logged = createApp({
      env: TEST_ENV,
      logger: pino({ level: 'error' }, { write: (line: string) => lines.push(line) }),
      prisma: client,
      storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: fake.payments,
    });

    const response = await request(logged)
      .post('/api/orders/checkout')
      .set('Cookie', sessionCookieFor(buyer.id))
      .send({ photoId: photo.id });

    expect(response.status).toBe(500);
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'A függő rendelés nem zárható le' }),
    );
  });

  it('ha az újraellenőrzés olvasása hibára fut: 500, de a függő rendelés nem marad félbe (FAILED)', async () => {
    const photo = await registeredPhoto();
    const buyer = await createUser(prisma);
    // Az első olvasás (az ellenőrzés) sikerül, a beszúrás utáni újraellenőrzésé már nem
    let reads = 0;
    const client = intercepting(prisma, 'photo', 'findUnique', async () => {
      reads += 1;
      if (reads > 1) await databaseDown();
    });

    const response = await checkoutVia(client, buyer.id, photo.id);

    expect(response.status).toBe(500);
    await expectNoPayableSession(photo.id);
  });
});

describe('a lezárás hibái', () => {
  it('ha egy rendelés lezárása hibára fut, a többi akkor is lezárul; minden hiba a naplóba kerül', async () => {
    const photo = await registeredPhoto();
    const failing = await openCheckout(photo.id);
    const others = [await openCheckout(photo.id), await openCheckout(photo.id)];
    const client = intercepting(prisma, 'order', 'updateMany', async (_target, args) => {
      const [query] = args as Array<{ where?: { id?: string } }>;
      if (query?.where?.id === failing.id) await databaseDown();
    });
    const lines: string[] = [];
    const chain = createTestChain(client);
    const logged = createApp({
      env: TEST_ENV,
      logger: pino({ level: 'error' }, { write: (line: string) => lines.push(line) }),
      prisma: client,
      storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: fake.payments,
    });

    const response = await hideAsOwner(photo.id, logged);

    expect(response.status).toBe(500);
    for (const order of others) expect(await statusOf(order.id)).toBe('EXPIRED');
    expect(await statusOf(failing.id)).toBe('PENDING');
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries).toContainEqual(expect.objectContaining({ orderId: failing.id, level: 50 }));
  });

  it('ha a nyilvános fájlok törlése hibára fut, a nyitott fizetések akkor is lezárulnak', async () => {
    const photo = await registeredPhoto();
    const open = await openCheckout(photo.id);
    const local = createLocalStorage(TEST_ENV.UPLOAD_DIR);
    const chain = createTestChain(prisma);
    const brokenStorage = createApp({
      env: TEST_ENV,
      logger: pino({ level: 'silent' }),
      prisma,
      storage: { ...local, delete: async () => databaseDown() },
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: fake.payments,
    });

    const response = await hideAsOwner(photo.id, brokenStorage);

    expect(response.status).toBe(500);
    expect(await statusOf(open.id)).toBe('EXPIRED');
  });
});

describe('a felhasználó tiltásakor', () => {
  it('lezárulnak a képeire indított és a saját (vevőként indított) nyitott fizetései; a feloldás nem nyit újat', async () => {
    const ownPhoto = await registeredPhoto();
    const foreignPhoto = await registeredPhoto((await createUser(prisma)).id);
    const unrelatedPhoto = await registeredPhoto((await createUser(prisma)).id);
    const asSeller = await openCheckout(ownPhoto.id);
    const asBuyer = await openCheckout(foreignPhoto.id, owner.id);
    const unrelated = await openCheckout(unrelatedPhoto.id);

    await setBlocked(owner.id, true);
    await setBlocked(owner.id, false);

    expect(await statusOf(asSeller.id)).toBe('EXPIRED');
    expect(await statusOf(asBuyer.id)).toBe('EXPIRED');
    expect(await statusOf(unrelated.id)).toBe('PENDING');
    expect(fake.payments.expireCheckoutSession).toHaveBeenCalledTimes(2);
  });

  it('ha a Stripe nem érhető el, a tiltás akkor is érvényes', async () => {
    const photo = await registeredPhoto();
    const open = await openCheckout(photo.id);
    fake.payments.expireCheckoutSession.mockRejectedValueOnce(new PaymentError('nem érhető el'));

    await setBlocked(owner.id, true);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).isBlocked).toBe(true);
    expect(await statusOf(open.id)).toBe('PENDING');
  });
});
