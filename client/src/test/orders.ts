// A rendelések tesztadatai a szerver válaszainak formájában (server/src/modules/orders/orders.dto.ts):
// a fizetés indításának válasza, egy rendelés a Stripe-munkamenet azonosítója alapján, és a vásárlásaim
// lista oldala. Kitalált adatok, csak a tesztekben.
import { jsonResponse } from './fetch';
import { PHOTO_ID } from './photos';

export const ORDER_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
export const REVIEW_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
/** A Stripe teszt módú Checkout-munkamenetének azonosítója (cs_test_…) */
export const SESSION_ID = 'cs_test_a1B2c3D4e5F6g7H8';
export const CHECKOUT_URL = `https://checkout.stripe.com/c/pay/${SESSION_ID}`;

/** Egy kifizetett rendelés (OrderDto). */
export function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: 'PAID',
    amountHuf: 12500,
    createdAt: '2026-10-06T09:12:00.000Z',
    paidAt: '2026-10-06T09:13:30.000Z',
    downloadable: true,
    reviewable: true,
    review: null,
    photo: {
      id: PHOTO_ID,
      title: 'Őszi erdő ködben',
      thumbnailUrl: `/media/thumbnails/${PHOTO_ID}.webp`,
      ownerDisplayName: 'Fotós Fanni',
    },
    ...overrides,
  };
}

/** POST /api/orders/checkout válasza (201 új, 200 meglévő munkamenet). */
export const checkoutResponse = (checkoutUrl = CHECKOUT_URL, status = 201) =>
  jsonResponse(status, { data: { orderId: ORDER_ID, checkoutUrl } });

/** GET /api/orders/by-session/:sessionId válasza. */
export const orderResponse = (value: unknown = order()) =>
  jsonResponse(200, { data: { order: value } });

interface MetaOverrides {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

/** GET /api/me/purchases válasza: a rendelések és a lapozás adatai. */
export function purchasesResponse(orders: unknown[] = [], meta: MetaOverrides = {}) {
  const pageSize = meta.pageSize ?? 20;
  const total = meta.total ?? orders.length;
  return jsonResponse(200, {
    data: { orders },
    meta: { page: 1, pageSize, total, totalPages: Math.ceil(total / pageSize), ...meta },
  });
}
