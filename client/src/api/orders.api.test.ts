// A rendelések kliense (L22): a fizetés indítása – a válasz címe csak a Stripe fizetési oldala lehet,
// máshová a felület nem irányít –, a rendelés a Stripe-munkamenet azonosítója alapján (csak a szerver
// formájú azonosítóval indul kérés), és a vásárlásaim lista. A szerver válasza külső adat: ellenőrzött.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import {
  CHECKOUT_URL,
  checkoutResponse,
  ORDER_ID,
  order,
  orderResponse,
  purchasesResponse,
  SESSION_ID,
} from '../test/orders';
import { PHOTO_ID } from '../test/photos';
import { errorResponse } from '../test/users';
import { ApiError } from './http';
import {
  getOrderBySession,
  isCheckoutSessionId,
  isStripeCheckoutUrl,
  listPurchases,
  startCheckout,
} from './orders.api';

describe('isStripeCheckoutUrl', () => {
  it('csak a Stripe fizetési oldalának https-címe fogadható el', () => {
    expect(isStripeCheckoutUrl(CHECKOUT_URL)).toBe(true);
    expect(isStripeCheckoutUrl('https://checkout.stripe.com/pay/cs_test_x#fid')).toBe(true);
  });

  it.each([
    ['http://checkout.stripe.com/c/pay/cs_test_x', 'titkosítatlan'],
    ['https://checkout.stripe.com.gonosz.hu/c/pay/cs_test_x', 'hasonló tartomány'],
    ['https://gonosz.hu/checkout.stripe.com', 'más tartomány'],
    ['https://valaki@checkout.stripe.com/c/pay/cs_test_x', 'belépési adattal'],
    ['https://checkout.stripe.com@gonosz.hu/c/pay/cs_test_x', 'a Stripe neve felhasználónévként'],
    ['https://checkout.stripe.com:8443/c/pay/cs_test_x', 'más porttal'],
    // A blob: URL eredete a beágyazott címé volna – a séma is számít, nem csak az eredet
    ['blob:https://checkout.stripe.com/1234', 'blob séma'],
    ['https://checkоut.stripe.com/c/pay/cs_test_x', 'cirill o a névben (hasonmás)'],
    ['javascript:alert(1)', 'nem URL'],
    ['', 'üres'],
  ])('elutasítja: %s (%s)', (value) => {
    expect(isStripeCheckoutUrl(value)).toBe(false);
  });

  it('a nem szöveg értéket is elutasítja', () => {
    expect(isStripeCheckoutUrl(null)).toBe(false);
    expect(isStripeCheckoutUrl(42)).toBe(false);
  });
});

describe('isCheckoutSessionId', () => {
  it('a Stripe teszt módú munkamenet-azonosítója (cs_test_…, betűk és számjegyek, legfeljebb 255 karakter)', () => {
    expect(isCheckoutSessionId(SESSION_ID)).toBe(true);
    expect(isCheckoutSessionId('cs_live_a1B2')).toBe(false);
    expect(isCheckoutSessionId('cs_test_')).toBe(false);
    expect(isCheckoutSessionId('cs_test_a%27b')).toBe(false);
    expect(isCheckoutSessionId(`cs_test_${'a'.repeat(248)}`)).toBe(false);
  });
});

describe('startCheckout', () => {
  it('POST /api/orders/checkout a kép azonosítójával; a válasz a rendelés és a Stripe fizetési oldalának címe', async () => {
    const fetchMock = stubFetch(checkoutResponse());

    const result = await startCheckout(PHOTO_ID);

    expect(result).toEqual({ orderId: ORDER_ID, checkoutUrl: CHECKOUT_URL });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('/api/orders/checkout');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ photoId: PHOTO_ID });
  });

  it('a meglévő (nyitott) munkamenet 200-as válasza is ugyanúgy jó', async () => {
    stubFetch(checkoutResponse(CHECKOUT_URL, 200));

    await expect(startCheckout(PHOTO_ID)).resolves.toMatchObject({ checkoutUrl: CHECKOUT_URL });
  });

  it('ha a cím nem a Stripe fizetési oldala, a válasz váratlan (UNEXPECTED_RESPONSE) – a felület nem irányít át', async () => {
    stubFetch(checkoutResponse('https://gonosz.hu/fizetes'));

    await expect(startCheckout(PHOTO_ID)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('a szerver hibája ApiError a kódjával és üzenetével (pl. 409 ALREADY_PURCHASED)', async () => {
    stubFetch(errorResponse(409, 'ALREADY_PURCHASED', 'Ezt a képet már megvásároltad'));

    const error = await startCheckout(PHOTO_ID).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'ALREADY_PURCHASED' });
  });
});

describe('getOrderBySession', () => {
  it('GET /api/orders/by-session/:sessionId – a rendelés ellenőrzött alakban', async () => {
    const fetchMock = stubFetch(orderResponse());

    await expect(getOrderBySession(SESSION_ID)).resolves.toEqual(order());
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`/api/orders/by-session/${SESSION_ID}`);
  });

  it('nem a szerver formájú azonosítóval kérés sem indul (RangeError)', async () => {
    const fetchMock = stubFetch();

    await expect(getOrderBySession('cs_live_x')).rejects.toBeInstanceOf(RangeError);
    await expect(getOrderBySession('../admin')).rejects.toBeInstanceOf(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['hibás állapot', { status: 'REFUNDED' }],
    ['hibás értékelés', { review: { id: ORDER_ID, rating: 6 } }],
    ['hiányzó letölthetőség', { downloadable: 'igen' }],
    [
      'idegen bélyegkép-cím',
      { photo: { ...order().photo, thumbnailUrl: 'https://gonosz.hu/x.jpg' } },
    ],
    ['hiányzó fotós', { photo: { ...order().photo, ownerDisplayName: undefined } }],
  ])('a nem a várt formájú válasz hiba: %s', async (_name, overrides) => {
    stubFetch(orderResponse(order(overrides)));

    await expect(getOrderBySession(SESSION_ID)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('listPurchases', () => {
  it('GET /api/me/purchases lapozva (20-as oldal); a rendelések és a lapozás adatai', async () => {
    const fetchMock = stubFetch(purchasesResponse([order()], { page: 2, total: 21 }));

    const page = await listPurchases(2);

    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/me/purchases?page=2&pageSize=20');
    expect(page.orders).toEqual([order()]);
    expect(page.meta).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
  });

  it('a hibás lapozási adat váratlan válasz', async () => {
    stubFetch(jsonResponse(200, { data: { orders: [] }, meta: { page: 0 } }));

    await expect(listPurchases(1)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
});
