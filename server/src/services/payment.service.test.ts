// A Stripe-ra épülő fizetési szolgáltatás unit tesztjei a Stripe-kliens utánzatával (hálózat nélkül):
// a Checkout Session paraméterei (HUF fillérben, egy tétel, metaadat, visszatérési URL-ek, lejárat,
// idempotenciakulcs), a munkamenet állapotának beolvasása, és a hibák átalakítása úgy, hogy a Stripe
// üzenete (benne akár a kulcs részlete) ne jusson tovább.
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import {
  createStripeClient,
  createStripePaymentService,
  parseCheckoutSession,
  PaymentError,
  type StripeCheckoutClient,
} from './payment.service.js';

const ORDER_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const REQUEST = {
  orderId: ORDER_ID,
  amountHuf: 2500,
  productName: 'Naplemente a Balatonnál',
  successUrl: 'http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'http://localhost:5173/checkout/cancel?photoId=9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  expiresAt: new Date('2026-10-04T12:30:00.000Z'),
};
const SESSION = {
  id: 'cs_test_a1B2c3D4',
  object: 'checkout.session',
  url: 'https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4',
  status: 'open',
  payment_status: 'unpaid',
  amount_total: 250_000,
  currency: 'huf',
  metadata: { orderId: ORDER_ID },
};

function fakeStripe() {
  const create = vi.fn(async (): Promise<unknown> => SESSION);
  const retrieve = vi.fn(async (): Promise<unknown> => SESSION);
  const expire = vi.fn(async (): Promise<unknown> => ({
    ...SESSION,
    status: 'expired',
    url: null,
  }));
  const client = {
    checkout: { sessions: { create, retrieve, expire } },
  } as unknown as StripeCheckoutClient;
  return { service: createStripePaymentService(client), create, retrieve, expire };
}

/** A Stripe SDK hibája, amelynek üzenete a kulcs egy részletét is tartalmazza. */
const authenticationError = () =>
  new Stripe.errors.StripeAuthenticationError({
    message: 'Invalid API Key provided: sk_test_****TITOK',
    type: 'invalid_request_error',
    code: 'api_key_expired',
    requestId: 'req_teszt123',
    statusCode: 401,
  });

describe('createCheckoutSession', () => {
  it('egyszeri kártyás fizetés HUF-ban: fillérben megadott összeg, a rendelés azonosítója a metaadatban', async () => {
    const { service, create } = fakeStripe();

    const session = await service.createCheckoutSession(REQUEST);

    expect(session).toEqual({ id: SESSION.id, url: SESSION.url });
    expect(create).toHaveBeenCalledExactlyOnceWith(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'huf',
              unit_amount: 250_000,
              product_data: { name: 'Naplemente a Balatonnál' },
            },
          },
        ],
        allowed_payment_method_types: ['card'],
        metadata: { orderId: ORDER_ID },
        client_reference_id: ORDER_ID,
        success_url: REQUEST.successUrl,
        cancel_url: REQUEST.cancelUrl,
        expires_at: Math.floor(REQUEST.expiresAt.getTime() / 1000),
      },
      // A hálózati hiba utáni újrapróbálás sem hozhat létre második munkamenetet ugyanarra a rendelésre
      { idempotencyKey: `checkout-${ORDER_ID}` },
    );
  });

  it('a vásárolhatónál kisebb vagy tört összeget el sem küldi', async () => {
    const { service, create } = fakeStripe();

    for (const amountHuf of [174, 2500.5]) {
      await expect(service.createCheckoutSession({ ...REQUEST, amountHuf })).rejects.toThrow(
        RangeError,
      );
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('a Stripe hibájából PaymentError lesz – az eredeti üzenet nélkül, csak a hiba típusával', async () => {
    const { service, create } = fakeStripe();
    create.mockRejectedValueOnce(authenticationError());

    const error: unknown = await service.createCheckoutSession(REQUEST).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentError);
    expect(String(error)).not.toMatch(/TITOK|Invalid API Key/);
    // A naplóhoz a hiba típusa, kódja, HTTP-státusza és a Stripe-kérés azonosítója (üzenet nélkül)
    expect(error).toMatchObject({
      stripeErrorType: 'StripeAuthenticationError',
      stripeCode: 'api_key_expired',
      statusCode: 401,
      requestId: 'req_teszt123',
    });
  });

  it('URL nélküli válasz (nem a Stripe által hosztolt oldal) PaymentError', async () => {
    const { service, create } = fakeStripe();
    create.mockResolvedValueOnce({ ...SESSION, url: null });

    await expect(service.createCheckoutSession(REQUEST)).rejects.toThrow(PaymentError);
  });
});

describe('getCheckoutSession', () => {
  it('a munkamenet állapota, fizetési állapota, összege, pénzneme és a rendelés azonosítója', async () => {
    const { service, retrieve } = fakeStripe();

    expect(await service.getCheckoutSession(SESSION.id)).toEqual({
      id: SESSION.id,
      url: SESSION.url,
      status: 'open',
      paymentStatus: 'unpaid',
      orderId: ORDER_ID,
      amountTotal: 250_000,
      currency: 'huf',
    });
    expect(retrieve).toHaveBeenCalledExactlyOnceWith(SESSION.id);
  });

  it('a Stripe hibája és a felismerhetetlen válasz is PaymentError', async () => {
    const { service, retrieve } = fakeStripe();
    retrieve.mockRejectedValueOnce(authenticationError());
    await expect(service.getCheckoutSession(SESSION.id)).rejects.toThrow(PaymentError);

    retrieve.mockResolvedValueOnce({ ...SESSION, status: 'ismeretlen' });
    await expect(service.getCheckoutSession(SESSION.id)).rejects.toThrow(PaymentError);
  });
});

describe('expireCheckoutSession', () => {
  it('a nyitott munkamenetet lejárttá teszi, és az új állapotát adja vissza', async () => {
    const { service, expire } = fakeStripe();

    expect(await service.expireCheckoutSession(SESSION.id)).toMatchObject({
      id: SESSION.id,
      url: null,
      status: 'expired',
      orderId: ORDER_ID,
    });
    expect(expire).toHaveBeenCalledExactlyOnceWith(SESSION.id);
  });

  it('a Stripe hibája (pl. a már kifizetett munkamenet) és a felismerhetetlen válasz is PaymentError', async () => {
    const { service, expire } = fakeStripe();
    expire.mockRejectedValueOnce(authenticationError());

    const error: unknown = await service.expireCheckoutSession(SESSION.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentError);
    expect(String(error)).not.toMatch(/TITOK|Invalid API Key/);

    expire.mockResolvedValueOnce({ ...SESSION, status: 'ismeretlen' });
    await expect(service.expireCheckoutSession(SESSION.id)).rejects.toThrow(PaymentError);
  });
});

describe('parseCheckoutSession', () => {
  it('a webhook-esemény objektumát is olvassa; hiányzó vagy nem UUID orderId-nél az orderId null', () => {
    expect(parseCheckoutSession({ ...SESSION, metadata: null })).toMatchObject({ orderId: null });
    expect(parseCheckoutSession({ ...SESSION, metadata: {} })).toMatchObject({ orderId: null });
    expect(parseCheckoutSession({ ...SESSION, metadata: { orderId: 'abc' } })).toMatchObject({
      orderId: null,
    });
  });

  it('a felismerhetetlen objektumnál null (hiányzó azonosító, ismeretlen állapot, hibás összeg)', () => {
    for (const object of [
      null,
      'szöveg',
      { ...SESSION, id: undefined },
      { ...SESSION, id: 'pi_test_x' },
      { ...SESSION, status: 'ismeretlen' },
      { ...SESSION, payment_status: 'ismeretlen' },
      { ...SESSION, amount_total: 2500.5 },
      { ...SESSION, amount_total: '250000' },
    ]) {
      expect(parseCheckoutSession(object)).toBeNull();
    }
  });
});

describe('createStripeClient', () => {
  it('a Stripe-kliens hálózati hívás nélkül jön létre', () => {
    expect(createStripeClient('sk_test_hamis')).toBeInstanceOf(Stripe);
  });
});
