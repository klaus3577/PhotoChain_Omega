// A Stripe-webhook (POST /api/webhooks/stripe) a tesztadatbázison. Az eseményeket a Stripe SDK
// generateTestHeaderString segédfüggvénye írja alá a tesztkonfiguráció webhook-titkával, így a szerver
// valódi aláírás-ellenőrzése fut (tests/helpers/stripeEvents.ts). A kérések – mint a Stripe-éi –
// süti és Sec-Fetch-Site fejléc nélkül érkeznek.
import { Writable } from 'node:stream';

import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { OrderStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  checkoutSessionObject,
  postWebhook,
  sendEvent,
  signatureFor,
  stripeEvent,
} from '../helpers/stripeEvents.js';
import { createTestApp, createTestChain, TEST_ENV } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';

const SESSION_ID = 'cs_test_a1B2c3D4e5F6g7H8i9J0';
/** A Stripe-könyvtár alapértelmezett tűréshatára: ennél régebbi aláírás érvénytelen */
const TOLERANCE_SECONDS = 300;
/** A webhook nyers törzsének felső korlátja (256 kB) fölött */
const OVERSIZED_BYTES = 300 * 1024;

let prisma: PrismaClient;
let app: Express;
let order: { id: string };

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
  const owner = await createUser(prisma);
  const buyer = await createUser(prisma);
  const photo = await createPhoto(prisma, {
    ownerId: owner.id,
    categoryId: (await createCategory(prisma)).id,
    status: 'REGISTERED',
    priceHuf: 2500,
  });
  order = await prisma.order.create({
    data: { buyerId: buyer.id, photoId: photo.id, amountHuf: 2500, stripeSessionId: SESSION_ID },
  });
});

/** A rendeléshez tartozó, kifizetett munkamenet (a Stripe így küldi a completed eseményben). */
const paidSession = (overrides: Record<string, unknown> = {}) =>
  checkoutSessionObject({ id: SESSION_ID, metadata: { orderId: order.id }, ...overrides });

const completed = (overrides: Record<string, unknown> = {}) =>
  stripeEvent('checkout.session.completed', paidSession(overrides));

const storedOrder = () => prisma.order.findUniqueOrThrow({ where: { id: order.id } });

const setStatus = (status: OrderStatus) =>
  prisma.order.update({ where: { id: order.id }, data: { status } });

async function expectStillPending(): Promise<void> {
  expect(await storedOrder()).toMatchObject({ status: 'PENDING', paidAt: null });
}

describe('POST /api/webhooks/stripe – aláírás-ellenőrzés', () => {
  it('hiányzó Stripe-Signature fejlécre 400 INVALID_WEBHOOK – feldolgozás nélkül', async () => {
    const response = await postWebhook(app, JSON.stringify(completed()));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WEBHOOK');
    await expectStillPending();
  });

  it('más titokkal aláírt (hamis) eseményre 400', async () => {
    const response = await sendEvent(app, completed(), {
      secret: 'whsec_tamadoTitokNemAPlatforme0123456789',
    });

    expect(response.status).toBe(400);
    await expectStillPending();
  });

  it('az aláírás után módosított törzsre 400', async () => {
    const signed = JSON.stringify(completed({ amount_total: 100 }));
    const tampered = signed.replace('"amount_total":100', '"amount_total":250000');

    const response = await postWebhook(app, tampered, signatureFor(signed));

    expect(response.status).toBe(400);
    await expectStillPending();
  });

  it('a tűréshatárnál (5 perc) régebbi aláírásra 400 – a visszajátszott esemény sem dolgozódik fel', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - TOLERANCE_SECONDS - 60;

    const response = await sendEvent(app, completed(), { timestamp });

    expect(response.status).toBe(400);
    await expectStillPending();
  });

  it('érvényes aláírású, de nem JSON törzsre 400 (soha 500)', async () => {
    for (const payload of ['nem json', '{"id":', '']) {
      const response = await postWebhook(app, payload, signatureFor(payload));
      expect(response.status).toBe(400);
    }
  });

  it('érvényes aláírású JSON-ra, amely nem Stripe-esemény alakú (null, szám, tömb, data nélkül), 400 – soha 500', async () => {
    const payloads = [
      'null',
      '42',
      '"esemény"',
      '[]',
      '{}',
      JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed', livemode: false }),
      JSON.stringify({
        id: 'evt_x',
        type: 'checkout.session.completed',
        livemode: false,
        data: null,
      }),
      JSON.stringify({ ...completed(), type: 42 }),
    ];
    for (const payload of payloads) {
      const response = await postWebhook(app, payload, signatureFor(payload));
      expect(response.status, payload).toBe(400);
      expect(response.body.error.code).toBe('INVALID_WEBHOOK');
    }
    await expectStillPending();
  });

  it('nem JSON tartalomtípusú kérésre 400', async () => {
    const payload = JSON.stringify(completed());

    const response = await postWebhook(app, payload, signatureFor(payload), 'text/plain');

    expect(response.status).toBe(400);
    await expectStillPending();
  });

  it('a 256 kB-nál nagyobb törzsre 413 – feldolgozás nélkül', async () => {
    const payload = JSON.stringify(completed({ padding: 'x'.repeat(OVERSIZED_BYTES) }));

    const response = await postWebhook(app, payload, signatureFor(payload));

    expect(response.status).toBe(413);
    await expectStillPending();
  });

  it('a hibaválasz nem árul el részleteket (aláírás, titok, a Stripe-könyvtár üzenete)', async () => {
    const response = await postWebhook(app, JSON.stringify(completed()), 't=1,v1=hamis');

    expect(response.body).toEqual({
      error: { code: 'INVALID_WEBHOOK', message: 'Érvénytelen webhook-kérés' },
    });
  });
});

describe('checkout.session.completed', () => {
  it('a kifizetett munkamenet a rendelést PAID-re állítja; a válasz 200 { received: true }', async () => {
    const before = Date.now();

    const response = await sendEvent(app, completed());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    const paid = await storedOrder();
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('ugyanaz az esemény többször (a Stripe újraküldi): csak az első hat, a fizetés ideje nem változik', async () => {
    const event = completed();
    await sendEvent(app, event).expect(200);
    const { paidAt } = await storedOrder();

    await sendEvent(app, event).expect(200);
    // Külön esemény ugyanarról a fizetésről (pl. async_payment_succeeded) sem okoz kettős hatást
    await sendEvent(
      app,
      stripeEvent('checkout.session.async_payment_succeeded', paidSession()),
    ).expect(200);

    expect(await storedOrder()).toMatchObject({ status: 'PAID', paidAt });
  });

  it('ugyanaz az esemény egyszerre kétszer (párhuzamos újraküldés): egyszer lesz PAID', async () => {
    const event = completed();

    const responses = await Promise.all([sendEvent(app, event), sendEvent(app, event)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await storedOrder()).status).toBe('PAID');
  });

  // A platform csak teszt módú kulccsal fut: éles eseménynek nem lehet hatása (mélységi védelem)
  it('éles módú (livemode) eseményt figyelmen kívül hagy – 200, hatás nélkül', async () => {
    const event = { ...completed(), livemode: true };

    await sendEvent(app, event).expect(200);

    await expectStillPending();
  });

  it('a mód jelzése nélküli eseményt is figyelmen kívül hagyja (zárt alapállás)', async () => {
    const { livemode: _livemode, ...event } = completed();

    await sendEvent(app, event).expect(200);

    await expectStillPending();
  });

  it('a már kifizetett rendelésre egy MÁSIK munkamenet fizetése (kettős fizetés) hibaként naplózódik', async () => {
    const lines: string[] = [];
    const env = { ...TEST_ENV, LOG_LEVEL: 'info' as const };
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const chain = createTestChain(prisma);
    const logged = createApp({
      env,
      logger: createLogger(env, { destination }),
      prisma,
      storage: createLocalStorage(env.UPLOAD_DIR),
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });
    await sendEvent(logged, completed()).expect(200);

    await sendEvent(logged, completed({ id: 'cs_test_masodikFizetes123' })).expect(200);

    const errors = lines.map((line) => JSON.parse(line)).filter((entry) => entry.level >= 50);
    expect(errors).toEqual([
      expect.objectContaining({
        orderId: order.id,
        sessionId: 'cs_test_masodikFizetes123',
        msg: expect.stringContaining('kézi ellenőrzés'),
      }),
    ]);
    expect(await storedOrder()).toMatchObject({ status: 'PAID', stripeSessionId: SESSION_ID });
  });

  it('fizetetlen (unpaid) munkamenetnél PENDING marad (a pénz még nem érkezett meg)', async () => {
    await sendEvent(app, completed({ payment_status: 'unpaid' })).expect(200);

    await expectStillPending();
  });

  it('a rendelésétől eltérő összegnél PENDING marad', async () => {
    for (const amount of [249_900, 250_100, 2500, 0, null]) {
      await sendEvent(app, completed({ amount_total: amount })).expect(200);
    }

    await expectStillPending();
  });

  it('eltérő pénznemnél PENDING marad', async () => {
    for (const currency of ['eur', 'usd', 'HUF', null]) {
      await sendEvent(app, completed({ currency })).expect(200);
    }

    await expectStillPending();
  });

  it('a rendeléshez nem tartozó (más azonosítójú) munkamenet hatástalan', async () => {
    await sendEvent(app, completed({ id: 'cs_test_masikMunkamenet123' })).expect(200);

    await expectStillPending();
  });

  it('hiányzó, hibás vagy ismeretlen orderId (pl. stripe trigger eseménye) – 200, hatás nélkül', async () => {
    for (const metadata of [
      {},
      null,
      { orderId: 'abc' },
      { orderId: '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f' },
    ]) {
      await sendEvent(app, completed({ metadata })).expect(200);
    }

    await expectStillPending();
  });

  it.each<OrderStatus>(['EXPIRED', 'FAILED'])(
    'a lezárt (%s) rendelést nem állítja PAID-re',
    async (status) => {
      await setStatus(status);

      await sendEvent(app, completed()).expect(200);

      expect(await storedOrder()).toMatchObject({ status, paidAt: null });
    },
  );

  it('a munkamenet nélküli (a mentés előtt félbemaradt) rendelést is lezárja, és rögzíti a munkamenetet', async () => {
    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: null } });

    await sendEvent(app, completed()).expect(200);

    expect(await storedOrder()).toMatchObject({ status: 'PAID', stripeSessionId: SESSION_ID });
  });
});

describe('a többi esemény', () => {
  it('checkout.session.expired: a függő rendelés EXPIRED lesz', async () => {
    const expired = paidSession({ status: 'expired', payment_status: 'unpaid' });
    // Rendelés-azonosító nélkül (pl. stripe trigger eseménye) hatástalan
    const foreign = checkoutSessionObject({ status: 'expired', payment_status: 'unpaid' });
    await sendEvent(app, stripeEvent('checkout.session.expired', foreign)).expect(200);
    await expectStillPending();

    await sendEvent(app, stripeEvent('checkout.session.expired', expired)).expect(200);

    expect(await storedOrder()).toMatchObject({ status: 'EXPIRED', paidAt: null });
  });

  it('checkout.session.expired más munkamenet azonosítójával hatástalan', async () => {
    const other = paidSession({
      id: 'cs_test_masikMunkamenet123',
      status: 'expired',
      payment_status: 'unpaid',
    });

    await sendEvent(app, stripeEvent('checkout.session.expired', other)).expect(200);

    await expectStillPending();
  });

  it('checkout.session.expired a már kifizetett rendelést nem írja felül', async () => {
    await sendEvent(app, completed()).expect(200);

    const expired = paidSession({ status: 'expired', payment_status: 'unpaid' });
    await sendEvent(app, stripeEvent('checkout.session.expired', expired)).expect(200);

    expect((await storedOrder()).status).toBe('PAID');
  });

  it('checkout.session.async_payment_failed: a függő rendelés FAILED lesz', async () => {
    const failed = paidSession({ payment_status: 'unpaid' });

    await sendEvent(app, stripeEvent('checkout.session.async_payment_failed', failed)).expect(200);

    expect((await storedOrder()).status).toBe('FAILED');
  });

  it('ismeretlen eseménytípusra 200 – hatás nélkül', async () => {
    for (const type of ['payment_intent.succeeded', 'charge.refunded', 'customer.created']) {
      await sendEvent(app, stripeEvent(type, paidSession())).expect(200);
    }

    await expectStillPending();
  });

  it('felismerhetetlen munkamenet-objektumra 200 – hatás nélkül', async () => {
    for (const object of [{}, null, 'szöveg', paidSession({ id: undefined })]) {
      await sendEvent(app, stripeEvent('checkout.session.completed', object)).expect(200);
    }

    await expectStillPending();
  });
});
