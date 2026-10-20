// Tesztsegéd: a fizetési szolgáltatás (Stripe Checkout) memóriában működő utánzata (mock). A tesztek
// a valódi Stripe-ot soha nem hívják: a munkamenetek itt jönnek létre, és az állapotukat (fizetés,
// lejárat) a teszt állítja be – mintha a vásárló a Stripe oldalán fizetett volna, vagy a munkamenet
// lejárt volna. A függvények vi.fn()-ek: a tesztek ellenőrizhetik a hívásokat, és hibát adathatnak
// vissza belőlük.
import { randomBytes } from 'node:crypto';

import { vi } from 'vitest';

import {
  type CheckoutSessionInfo,
  type CheckoutSessionRequest,
  type CreatedCheckoutSession,
  PaymentError,
  type PaymentService,
} from '../../src/services/payment.service.js';

/** A HUF a Stripe-nál kétdecimális pénznem: az összeg fillérben értendő (Ft × 100). */
const MINOR_UNITS_PER_HUF = 100;

export interface FakeCheckoutSession extends CheckoutSessionInfo {
  /** A munkamenet létrehozásakor kapott kérés (a tesztek ellenőrzik) */
  request: CheckoutSessionRequest;
}

export function createFakePayments() {
  const sessions = new Map<string, FakeCheckoutSession>();

  /** Új, nyitott (még nem fizetett) munkamenet – mint a Stripe-é. */
  function createSession(request: CheckoutSessionRequest): CreatedCheckoutSession {
    const id = `cs_test_${randomBytes(24).toString('hex')}`;
    const url = `https://checkout.stripe.com/c/pay/${id}`;
    sessions.set(id, {
      id,
      url,
      status: 'open',
      paymentStatus: 'unpaid',
      orderId: request.orderId,
      amountTotal: request.amountHuf * MINOR_UNITS_PER_HUF,
      currency: 'huf',
      request,
    });
    return { id, url };
  }

  function sessionOf(id: string): FakeCheckoutSession {
    const session = sessions.get(id);
    if (!session) throw new Error(`Ismeretlen munkamenet: ${id}`);
    return session;
  }

  /** A munkamenet állapota – ahogy a Stripe adja vissza (a létrehozó kérés nélkül). */
  function infoOf(id: string): CheckoutSessionInfo {
    const { request: _request, ...info } = sessionOf(id);
    return info;
  }

  const payments = {
    createCheckoutSession: vi.fn(async (request: CheckoutSessionRequest) => createSession(request)),
    getCheckoutSession: vi.fn(async (id: string): Promise<CheckoutSessionInfo> => infoOf(id)),
    // Mint a Stripe: csak a nyitott munkamenet tehető lejárttá, a lezárt vagy lejárt hibát ad
    expireCheckoutSession: vi.fn(async (id: string): Promise<CheckoutSessionInfo> => {
      if (sessionOf(id).status !== 'open') {
        throw new PaymentError('A Checkout-munkamenet nem tehető lejárttá');
      }
      expire(id);
      return infoOf(id);
    }),
  } satisfies PaymentService;

  /** A vásárló kifizeti a munkamenetet a Stripe oldalán. */
  function pay(id: string): void {
    sessions.set(id, { ...sessionOf(id), status: 'complete', paymentStatus: 'paid', url: null });
  }

  /** A munkamenet fizetés nélkül lejár. */
  function expire(id: string): void {
    sessions.set(id, { ...sessionOf(id), status: 'expired', url: null });
  }

  return { payments, sessions, createSession, pay, expire };
}

export type FakePayments = ReturnType<typeof createFakePayments>;
