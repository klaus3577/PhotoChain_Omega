// A fizetés indítása (POST /api/orders/checkout) a tesztadatbázison. A Stripe helyett a fizetési
// szolgáltatás utánzata fut (tests/helpers/fakePayments.ts) – a valódi Stripe-ot a tesztek nem hívják.
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { sensitiveValues } from '../../src/config/env.js';
import type { PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { PaymentError, type PaymentService } from '../../src/services/payment.service.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments, type FakePayments } from '../helpers/fakePayments.js';
import { createTestApp, createTestChain, sessionCookieFor, TEST_ENV } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';

const UNKNOWN_PHOTO_ID = '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f';
/** A munkamenet élettartama: a Stripe minimuma (30 perc) és 1 perc tartalék */
const SESSION_LIFETIME_MS = 31 * 60_000;

let prisma: PrismaClient;
let fake: FakePayments;
let app: Express;
let owner: { id: string };
let buyer: { id: string };
let admin: { id: string };
let categoryId: number;
let photo: { id: string };
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
  fake = createFakePayments();
  app = createTestApp({}, prisma, undefined, fake.payments);
  owner = await createUser(prisma, 'fanni@photochain.test', { displayName: 'Fotós Fanni' });
  buyer = await createUser(prisma, 'vera@photochain.test', { displayName: 'Vevő Vera' });
  admin = await createUser(prisma, 'admin@photochain.test', { role: 'ADMIN' });
  buyerCookie = sessionCookieFor(buyer.id);
  categoryId = (await createCategory(prisma)).id;
  photo = await createPhoto(prisma, {
    ownerId: owner.id,
    categoryId,
    status: 'REGISTERED',
    priceHuf: 2500,
    title: 'Naplemente a Balatonnál',
  });
});

const checkout = (body: unknown, cookie = buyerCookie, target = app) =>
  request(target)
    .post('/api/orders/checkout')
    .set('Cookie', cookie)
    .send(body as object);

const ordersOf = (buyerId: string) =>
  prisma.order.findMany({ where: { buyerId }, orderBy: { createdAt: 'asc' } });

const onlyOrderOf = async (buyerId: string) => {
  const orders = await ordersOf(buyerId);
  expect(orders).toHaveLength(1);
  return orders[0]!;
};

describe('POST /api/orders/checkout – a fizetés indítása', () => {
  it('201: PENDING rendelés a checkoutkori árral; a válasz a Stripe Checkout URL-je (no-store)', async () => {
    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const order = await onlyOrderOf(buyer.id);
    expect(order).toMatchObject({
      photoId: photo.id,
      status: 'PENDING',
      amountHuf: 2500,
      paidAt: null,
    });
    expect(order.stripeSessionId).toMatch(/^cs_test_/);
    expect(response.body).toEqual({
      data: { orderId: order.id, checkoutUrl: fake.sessions.get(order.stripeSessionId!)?.url },
    });
  });

  it('a Stripe-hoz a rendelés azonosítója, az összeg, a kép címe és a szerver konfigurációjából vett visszatérési URL-ek mennek; 31 perc múlva lejár (a Stripe minimuma + tartalék)', async () => {
    const target = createTestApp(
      { APP_BASE_URL: 'https://photochain.example' },
      prisma,
      undefined,
      fake.payments,
    );
    const before = Date.now();

    await checkout({ photoId: photo.id }, buyerCookie, target).expect(201);

    const order = await onlyOrderOf(buyer.id);
    expect(fake.payments.createCheckoutSession).toHaveBeenCalledExactlyOnceWith({
      orderId: order.id,
      amountHuf: 2500,
      productName: 'Naplemente a Balatonnál',
      successUrl: 'https://photochain.example/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: `https://photochain.example/checkout/cancel?photoId=${photo.id}`,
      expiresAt: expect.any(Date),
    });
    const { expiresAt } = fake.payments.createCheckoutSession.mock.calls[0]![0];
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_LIFETIME_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + SESSION_LIFETIME_MS);
  });

  it('a kliens nem adhat meg összeget vagy visszatérési URL-t: az ismeretlen mező 400, rendelés nélkül', async () => {
    for (const extra of [
      { amountHuf: 1 },
      { successUrl: 'https://tamado.example' },
      { cancelUrl: 'https://tamado.example' },
    ]) {
      const response = await checkout({ photoId: photo.id, ...extra });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await ordersOf(buyer.id)).toEqual([]);
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('a kép árának későbbi módosítása az elindított rendelés összegét nem változtatja meg', async () => {
    await checkout({ photoId: photo.id }).expect(201);

    await prisma.photo.update({ where: { id: photo.id }, data: { priceHuf: 9000 } });

    expect((await onlyOrderOf(buyer.id)).amountHuf).toBe(2500);
  });
});

describe('ismételt indítás függő (PENDING) rendelésnél', () => {
  it('nyitott munkamenetnél ugyanazt az URL-t adja vissza (200) – új rendelés és munkamenet nélkül', async () => {
    const first = await checkout({ photoId: photo.id }).expect(201);

    const second = await checkout({ photoId: photo.id });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await ordersOf(buyer.id)).toHaveLength(1);
    expect(fake.payments.createCheckoutSession).toHaveBeenCalledOnce();
  });

  it('lejárt munkamenetnél a régi rendelés EXPIRED lesz, és új indul az aktuális árral (201)', async () => {
    await checkout({ photoId: photo.id }).expect(201);
    const old = await onlyOrderOf(buyer.id);
    fake.expire(old.stripeSessionId!);
    await prisma.photo.update({ where: { id: photo.id }, data: { priceHuf: 3000 } });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(201);
    const [expired, current] = await ordersOf(buyer.id);
    expect(expired).toMatchObject({ id: old.id, status: 'EXPIRED' });
    expect(current).toMatchObject({ status: 'PENDING', amountHuf: 3000 });
    expect(response.body.data.orderId).toBe(current!.id);
  });

  it('kifizetett munkamenetnél (a webhook még nem érkezett meg) a rendelés PAID lesz, a válasz 409', async () => {
    await checkout({ photoId: photo.id }).expect(201);
    const order = await onlyOrderOf(buyer.id);
    fake.pay(order.stripeSessionId!);

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_PURCHASED');
    const paid = await onlyOrderOf(buyer.id);
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).toBeInstanceOf(Date);
  });

  it('munkamenet nélküli, friss rendelésnél 409 (az indítás folyamatban) – új rendelés nélkül', async () => {
    await prisma.order.create({ data: { buyerId: buyer.id, photoId: photo.id, amountHuf: 2500 } });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CHECKOUT_IN_PROGRESS');
    expect(await ordersOf(buyer.id)).toHaveLength(1);
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('a 2 percnél régebbi, munkamenet nélküli (félbemaradt) rendelés FAILED lesz, és új indul', async () => {
    const stale = await prisma.order.create({
      data: {
        buyerId: buyer.id,
        photoId: photo.id,
        amountHuf: 2500,
        createdAt: new Date(Date.now() - 3 * 60_000),
      },
    });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(201);
    const [failed, current] = await ordersOf(buyer.id);
    expect(failed).toMatchObject({ id: stale.id, status: 'FAILED' });
    expect(current).toMatchObject({ status: 'PENDING', amountHuf: 2500 });
  });

  it('párhuzamos kérésekből is legfeljebb egy élő rendelés és egy munkamenet lesz', async () => {
    // A munkamenet létrehozása lassú, mint a valódi hálózati hívás: a kérések közben átfedik egymást
    fake.payments.createCheckoutSession.mockImplementation(async (checkoutRequest) => {
      await sleep(100);
      return fake.createSession(checkoutRequest);
    });

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => checkout({ photoId: photo.id })),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.every((status) => [200, 201, 409].includes(status))).toBe(true);
    const live = await prisma.order.findMany({
      where: { buyerId: buyer.id, photoId: photo.id, status: { in: ['PENDING', 'PAID'] } },
    });
    expect(live).toHaveLength(1);
    expect(fake.payments.createCheckoutSession).toHaveBeenCalledOnce();
  });

  it('az adatbázis is kikényszeríti: egy vevőnek egy képre legfeljebb egy élő (PENDING vagy PAID) rendelése lehet', async () => {
    const order = (status?: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED') =>
      prisma.order.create({
        data: { buyerId: buyer.id, photoId: photo.id, amountHuf: 2500, status },
      });
    // A lezárt (EXPIRED, FAILED) rendelések nem számítanak – ezek mellett lehet új
    await order('EXPIRED');
    await order('FAILED');
    await order('FAILED');
    await order('PENDING');

    await expect(order('PENDING')).rejects.toThrow();
    await expect(order('PAID')).rejects.toThrow();
    // Másik vevőnek ugyanarra a képre lehet élő rendelése
    await expect(
      prisma.order.create({ data: { buyerId: admin.id, photoId: photo.id, amountHuf: 2500 } }),
    ).resolves.toBeDefined();
  });

  it('ha az élő rendelés keresése és a létrehozás között egy párhuzamos kérés megelőzi: 409 – Stripe-hívás nélkül', async () => {
    // A párhuzamos kérés pontosan a keresés után hozza létre a saját rendelését (determinisztikus
    // versenyhelyzet: a keresés még nem látja, a létrehozást már az egyedi index akadályozza meg)
    const racing = prisma.$extends({
      query: {
        order: {
          async findFirst({ args, query }) {
            const result = await query(args);
            await prisma.order.create({
              data: { buyerId: buyer.id, photoId: photo.id, amountHuf: 2500 },
            });
            return result;
          },
        },
      },
    }) as unknown as PrismaClient;
    const target = createTestApp({}, racing, undefined, fake.payments);

    const response = await checkout({ photoId: photo.id }, buyerCookie, target);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CHECKOUT_IN_PROGRESS');
    expect(await ordersOf(buyer.id)).toHaveLength(1);
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('ha a meglévő munkamenet a Stripe-tól nem kérdezhető le: 503, a függő rendelés megmarad', async () => {
    await checkout({ photoId: photo.id }).expect(201);
    fake.payments.getCheckoutSession.mockRejectedValueOnce(new Error('kapcsolódási hiba'));

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PAYMENT_UNAVAILABLE');
    expect((await onlyOrderOf(buyer.id)).status).toBe('PENDING');
  });

  it('lezárt, de még nem fizetett munkamenetnél (függő fizetés) 409 CHECKOUT_IN_PROGRESS – PENDING marad', async () => {
    await checkout({ photoId: photo.id }).expect(201);
    const order = await onlyOrderOf(buyer.id);
    const session = fake.sessions.get(order.stripeSessionId!)!;
    fake.sessions.set(session.id, { ...session, status: 'complete', url: null });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CHECKOUT_IN_PROGRESS');
    expect((await onlyOrderOf(buyer.id)).status).toBe('PENDING');
  });

  it('ha a kifizetett rendelés lezárását a webhook épp megelőzi: 409 ALREADY_PURCHASED (nem „folyamatban”)', async () => {
    await checkout({ photoId: photo.id }).expect(201);
    const order = await onlyOrderOf(buyer.id);
    fake.pay(order.stripeSessionId!);
    // A webhook közvetlenül a feltételes írás előtt zárja le a rendelést (determinisztikus verseny)
    const racing = prisma.$extends({
      query: {
        order: {
          async updateMany({ args, query }) {
            if (args.data.status === 'PAID') {
              await prisma.order.update({
                where: { id: order.id },
                data: { status: 'PAID', paidAt: new Date() },
              });
            }
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
    const target = createTestApp({}, racing, undefined, fake.payments);

    const response = await checkout({ photoId: photo.id }, buyerCookie, target);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_PURCHASED');
  });

  it('ha a munkamenet létrehozása közben a rendelést lezárták, a munkamenet nem kerül hozzá: 409', async () => {
    fake.payments.createCheckoutSession.mockImplementationOnce(async (checkoutRequest) => {
      await prisma.order.update({
        where: { id: checkoutRequest.orderId },
        data: { status: 'FAILED' },
      });
      return fake.createSession(checkoutRequest);
    });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CHECKOUT_IN_PROGRESS');
    expect(await onlyOrderOf(buyer.id)).toMatchObject({ status: 'FAILED', stripeSessionId: null });
  });
});

describe('elutasított indítás', () => {
  it('bejelentkezés nélkül 401, rendelés nélkül', async () => {
    const response = await request(app).post('/api/orders/checkout').send({ photoId: photo.id });

    expect(response.status).toBe(401);
    expect(await prisma.order.count()).toBe(0);
  });

  it('a már kifizetett kép újbóli vásárlása 409 ALREADY_PURCHASED – Stripe-hívás nélkül', async () => {
    await prisma.order.create({
      data: {
        buyerId: buyer.id,
        photoId: photo.id,
        amountHuf: 2500,
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_PURCHASED');
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
    expect(fake.payments.getCheckoutSession).not.toHaveBeenCalled();
  });

  it('a saját kép nem vásárolható meg: 403', async () => {
    const response = await checkout({ photoId: photo.id }, sessionCookieFor(owner.id));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.order.count()).toBe(0);
  });

  it.each<PhotoStatus>(['HIDDEN', 'PENDING_CHAIN', 'CHAIN_FAILED'])(
    'nem nyilvános (%s) kép: másnak 404 (a létezését sem árulja el), a látó adminnak 409 NOT_PURCHASABLE',
    async (status) => {
      await prisma.photo.update({
        where: { id: photo.id },
        data: { status, registeredAt: null, hiddenBy: status === 'HIDDEN' ? 'OWNER' : null },
      });

      const stranger = await checkout({ photoId: photo.id });
      const byAdmin = await checkout({ photoId: photo.id }, sessionCookieFor(admin.id));

      expect(stranger.status).toBe(404);
      expect(stranger.body.error.code).toBe('NOT_FOUND');
      expect(byAdmin.status).toBe(409);
      expect(byAdmin.body.error.code).toBe('NOT_PURCHASABLE');
      expect(await prisma.order.count()).toBe(0);
    },
  );

  it('a fizetési minimumnál (175 Ft) olcsóbb régi kép nem vásárolható: 409 NOT_PURCHASABLE', async () => {
    // A minimum előtt feltöltött kép (a séma ma már nem engedné)
    await prisma.photo.update({ where: { id: photo.id }, data: { priceHuf: 174 } });

    const response = await checkout({ photoId: photo.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('NOT_PURCHASABLE');
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('ismeretlen kép 404; hibás törzs 400 – soha nem 500', async () => {
    expect((await checkout({ photoId: UNKNOWN_PHOTO_ID })).status).toBe(404);

    for (const body of [{}, { photoId: 'abc' }, { photoId: 5 }, [], [photo.id], null]) {
      const response = await checkout(body);
      expect(response.status).toBe(400);
    }
    for (const raw of ['{"photoId":', 'nem json', '"szöveg"', '5']) {
      const response = await request(app)
        .post('/api/orders/checkout')
        .set('Cookie', buyerCookie)
        .set('Content-Type', 'application/json')
        .send(raw);
      expect(response.status).toBe(400);
    }
    expect(await prisma.order.count()).toBe(0);
  });

  it('idegen webhelyről indított kérés 403 (a same-origin védelem marad)', async () => {
    const response = await request(app)
      .post('/api/orders/checkout')
      .set('Cookie', buyerCookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ photoId: photo.id });

    expect(response.status).toBe(403);
    expect(await prisma.order.count()).toBe(0);
  });

  it('adatbázishiba a rendelés létrehozásakor: 500 a belső részletek nélkül – Stripe-hívás nélkül', async () => {
    const failing = prisma.$extends({
      query: {
        order: {
          create: () => Promise.reject(new Error('belső részlet: megszakadt a kapcsolat')),
        },
      },
    }) as unknown as PrismaClient;
    const target = createTestApp({}, failing, undefined, fake.payments);

    const response = await checkout({ photoId: photo.id }, buyerCookie, target);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('belső részlet');
    expect(fake.payments.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('ha a Stripe nem érhető el: 503 PAYMENT_UNAVAILABLE, a rendelés FAILED, és újrapróbálható', async () => {
    fake.payments.createCheckoutSession.mockRejectedValueOnce(
      new PaymentError('A Checkout-munkamenet nem jött létre', new Error('kapcsolódási hiba')),
    );

    const failed = await checkout({ photoId: photo.id });

    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('PAYMENT_UNAVAILABLE');
    expect((await onlyOrderOf(buyer.id)).status).toBe('FAILED');

    await checkout({ photoId: photo.id }).expect(201);
    expect((await ordersOf(buyer.id)).map((order) => order.status)).toEqual(['FAILED', 'PENDING']);
  });

  it('a Stripe hibaüzenete és a titkos kulcsok sem a válaszba, sem a naplóba nem kerülnek', async () => {
    const env = { ...TEST_ENV, LOG_LEVEL: 'info' as const };
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const payments: PaymentService = createFakePayments().payments;
    vi.mocked(payments.createCheckoutSession).mockRejectedValueOnce(
      new Error(
        `Invalid API Key provided: ${env.STRIPE_SECRET_KEY} (webhook: ${env.STRIPE_WEBHOOK_SECRET})`,
      ),
    );
    const chain = createTestChain(prisma);
    const target = createApp({
      env,
      logger: createLogger(env, { secrets: sensitiveValues(env), destination }),
      prisma,
      storage: createLocalStorage(env.UPLOAD_DIR),
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments,
    });

    const response = await checkout({ photoId: photo.id }, buyerCookie, target);

    expect(response.status).toBe(503);
    expect(response.text).not.toMatch(/Invalid API Key|sk_test_|whsec_/);
    // A hiba a naplóba kerül, de a titkok helyén [REJTETT] áll
    await vi.waitFor(() => expect(lines.join('')).toContain('[REJTETT]'));
    const log = lines.join('');
    expect(log).not.toContain(env.STRIPE_SECRET_KEY);
    expect(log).not.toContain(env.STRIPE_WEBHOOK_SECRET);
  });

  it('felhasználónkénti sebességkorlát: a korlát felett 429 – a többi felhasználót nem érinti', async () => {
    const target = createTestApp({ CHECKOUT_RATE_LIMIT_MAX: 2 }, prisma, undefined, fake.payments);
    const other = await createUser(prisma);

    await checkout({ photoId: photo.id }, buyerCookie, target).expect(201);
    await checkout({ photoId: photo.id }, buyerCookie, target).expect(200);
    const limited = await checkout({ photoId: photo.id }, buyerCookie, target);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    await checkout({ photoId: photo.id }, sessionCookieFor(other.id), target).expect(201);
  });
});
