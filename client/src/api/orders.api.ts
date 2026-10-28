// A rendelések végpontjainak kliense (server/src/modules/orders, L22): a fizetés indítása (POST
// /api/orders/checkout → a Stripe fizetési oldalának címe), a rendelés a Stripe-munkamenet azonosítója
// alapján (GET /api/orders/by-session/:id – a sikeres fizetés oldala kérdezi, amíg a webhook be nem
// fut) és a vásárlásaim lista (GET /api/me/purchases, lapozva). A válasz külső adat: futás közben is
// ellenőrizzük – a fizetési oldal címe csak a Stripe hosztolt oldala lehet (a felület máshová nem
// irányít át), a munkamenet-azonosító csak a szerver formájú (más értékre kérés sem indul).
// Forrás: Stripe – Build a payments page (Checkout: a hosztolt fizetési oldal címe),
// https://docs.stripe.com/payments/checkout (adaptálva)
import {
  expectValid,
  isInteger,
  isIsoDate,
  isMediaPath,
  isPageMeta,
  isRating,
  isRecord,
  isString,
  isUuid,
  type PageMeta,
} from './guards';
import { apiRequest, apiRequestEnvelope, pathSegment } from './http';

export type OrderStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';

/** A vevő saját értékelése a képről */
export interface OrderReview {
  id: string;
  /** 1–5 csillag */
  rating: number;
}

/** Egy rendelés a vevő szemszögéből (OrderDto). */
export interface Order {
  id: string;
  status: OrderStatus;
  /** A checkoutkori ár forintban */
  amountHuf: number;
  createdAt: string;
  /** A fizetés ideje; a nem kifizetett rendelésnél null */
  paidAt: string | null;
  /** Letölthető-e az eredeti: kifizetett rendelés, és a képet a moderátor nem vette le */
  downloadable: boolean;
  /** Írhat-e értékelést: kifizetett rendelés, nyilvános kép, még nincs értékelése */
  reviewable: boolean;
  review: OrderReview | null;
  photo: {
    id: string;
    title: string;
    /** A nem nyilvános kép (rejtett – a fájlja törlődött –, vagy a fotósa letiltva) bélyegképe: null */
    thumbnailUrl: string | null;
    ownerDisplayName: string;
  };
}

export interface OrderPage {
  orders: Order[];
  meta: PageMeta;
}

/** A fizetés indításának válasza: a rendelés és a Stripe fizetési oldalának címe. */
export interface CheckoutStart {
  orderId: string;
  checkoutUrl: string;
}

/** Egy oldalon ennyi vásárlás (a szerver alapértelmezése) */
export const PURCHASES_PAGE_SIZE = 20;

/** A Stripe hosztolt fizetési oldalának eredete – csak ide irányít a felület */
export const STRIPE_CHECKOUT_ORIGIN = 'https://checkout.stripe.com';

/** A lekérdezések helye a gyorsítótárban (felhasználói adat: a munkamenet váltásakor alaphelyzetbe kerül). */
export const orderKeys = {
  /** Minden vásárlásaim-oldal (érvénytelenítéshez, pl. sikeres fizetés után) */
  purchases: () => ['orders', 'purchases'] as const,
  purchasesPage: (page: number) => ['orders', 'purchases', page] as const,
  bySession: (sessionId: string) => ['orders', 'session', sessionId] as const,
};

/**
 * A Stripe teszt módú Checkout-munkamenetének azonosítója – pontosan a szerver sémája
 * (orders.schemas.ts): cs_test_, betűk és számjegyek, összesen legfeljebb 255 karakter.
 */
const SESSION_ID = /^cs_test_[A-Za-z0-9]{1,247}$/;

export const isCheckoutSessionId = (value: string): boolean => SESSION_ID.test(value);

/**
 * A Stripe fizetési oldalának címe: https séma, pontosan a Stripe eredete (port és belépési adat
 * nélkül). A séma külön is számít: egy blob: cím eredete a beágyazott címé volna. Egy hibás vagy
 * manipulált válasz sem irányíthatja a felhasználót idegen oldalra.
 */
export function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.origin === STRIPE_CHECKOUT_ORIGIN &&
    url.username === '' &&
    url.password === ''
  );
}

const ORDER_STATUSES: readonly unknown[] = [
  'PENDING',
  'PAID',
  'EXPIRED',
  'FAILED',
] satisfies OrderStatus[];

const isOrderReview = (value: unknown): value is OrderReview =>
  isRecord(value) && isUuid(value.id) && isRating(value.rating);

const isOrderPhoto = (value: unknown): value is Order['photo'] =>
  isRecord(value) &&
  isUuid(value.id) &&
  isString(value.title) &&
  (value.thumbnailUrl === null || isMediaPath(value.thumbnailUrl)) &&
  isString(value.ownerDisplayName);

const isOrder = (value: unknown): value is Order =>
  isRecord(value) &&
  isUuid(value.id) &&
  ORDER_STATUSES.includes(value.status) &&
  isInteger(value.amountHuf) &&
  isIsoDate(value.createdAt) &&
  (value.paidAt === null || isIsoDate(value.paidAt)) &&
  typeof value.downloadable === 'boolean' &&
  typeof value.reviewable === 'boolean' &&
  (value.review === null || isOrderReview(value.review)) &&
  isOrderPhoto(value.photo);

const isOrderResponse = (value: unknown): value is { order: Order } =>
  isRecord(value) && isOrder(value.order);

const isOrderList = (value: unknown): value is { orders: Order[] } =>
  isRecord(value) && Array.isArray(value.orders) && value.orders.every(isOrder);

const isCheckoutStart = (value: unknown): value is CheckoutStart =>
  isRecord(value) && isUuid(value.orderId) && isStripeCheckoutUrl(value.checkoutUrl);

/** A fizetés indítása: új rendelés (201) vagy a még nyitott munkamenet (200) – mindkettő ugyanaz a válasz. */
export async function startCheckout(photoId: string): Promise<CheckoutStart> {
  const data = await apiRequest<unknown>('/orders/checkout', {
    method: 'POST',
    body: { photoId },
  });
  return expectValid(data, isCheckoutStart);
}

/** A saját rendelés a Stripe-munkamenet azonosítója alapján; másé 404. Hibás azonosítóval kérés sem indul. */
export async function getOrderBySession(sessionId: string, signal?: AbortSignal): Promise<Order> {
  if (!isCheckoutSessionId(sessionId)) throw new RangeError('Érvénytelen munkamenet-azonosító');
  const data = await apiRequest<unknown>(`/orders/by-session/${pathSegment(sessionId)}`, {
    signal,
  });
  return expectValid(data, isOrderResponse).order;
}

/** A kifizetett rendelések egy oldala, a legutóbb fizetett elöl. */
export async function listPurchases(page: number, signal?: AbortSignal): Promise<OrderPage> {
  const { data, meta } = await apiRequestEnvelope(
    `/me/purchases?page=${page}&pageSize=${PURCHASES_PAGE_SIZE}`,
    { signal },
  );
  return { orders: expectValid(data, isOrderList).orders, meta: expectValid(meta, isPageMeta) };
}
