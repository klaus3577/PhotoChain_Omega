// Fizetési szolgáltatás (terv D9): a Stripe által hosztolt Checkout. Az alkalmazás csak ezt az
// interfészt ismeri – a tesztekben utánzat fut helyette (a valódi Stripe-ot a tesztek nem hívják). A
// kártyaadat a szerverhez el sem jut; a fizetés tényét az aláírt webhook (orders/stripe.webhook.ts),
// illetve a munkamenet lekérdezése igazolja. A Stripe hibaüzenetei nem jutnak tovább (a kulcs egy
// részletét is tartalmazhatják): a PaymentError csak a hiba típusát és HTTP-státuszát hordozza.
// Forrás: Stripe – Build a payments page (Checkout Sessions API), https://docs.stripe.com/payments/checkout;
// Stripe – Supported currencies (HUF), https://docs.stripe.com/currencies; Stripe API Reference –
// Expire a Checkout Session, https://docs.stripe.com/api/checkout/sessions/expire; a Stripe Node.js SDK
// típusleírásai (Checkout.SessionCreateParams: expires_at, line_items.price_data, metadata;
// RequestOptions: idempotencyKey; StripeConfig: timeout, maxNetworkRetries) (adaptálva)
import Stripe from 'stripe';
import { z } from 'zod';

import { STRIPE_CURRENCY, toStripeAmount } from '../lib/price.js';

/** Egy Checkout-munkamenet létrehozásához szükséges adatok. */
export interface CheckoutSessionRequest {
  orderId: string;
  /** A rendelés összege forintban (a checkoutkori ár) */
  amountHuf: number;
  /** A Stripe fizetési oldalán megjelenő termék neve (a kép címe) */
  productName: string;
  /** Sikeres fizetés után ide irányít vissza (a szerver konfigurációjából) */
  successUrl: string;
  /** Megszakított fizetés után ide irányít vissza (a szerver konfigurációjából) */
  cancelUrl: string;
  /** Ekkor jár le a munkamenet (a Stripe szerint 30 perc és 24 óra között) */
  expiresAt: Date;
}

/** A létrehozott munkamenet: az azonosítója és a Stripe fizetési oldalának címe. */
export interface CreatedCheckoutSession {
  id: string;
  url: string;
}

const SESSION_STATUSES = ['open', 'complete', 'expired'] as const;
const PAYMENT_STATUSES = ['paid', 'unpaid', 'no_payment_required'] as const;

/** Egy munkamenet állapota – a webhook-eseményből vagy a Stripe-tól lekérdezve. */
export interface CheckoutSessionInfo {
  id: string;
  /** A fizetési oldal címe; a lezárt vagy lejárt munkamenetnél null */
  url: string | null;
  status: (typeof SESSION_STATUSES)[number];
  paymentStatus: (typeof PAYMENT_STATUSES)[number];
  /** A metaadatban küldött rendelés-azonosító (ha nem UUID, null) */
  orderId: string | null;
  /** A fizetett összeg a pénznem legkisebb egységében (HUF esetén fillérben) */
  amountTotal: number | null;
  currency: string | null;
}

export interface PaymentService {
  createCheckoutSession(request: CheckoutSessionRequest): Promise<CreatedCheckoutSession>;
  getCheckoutSession(id: string): Promise<CheckoutSessionInfo>;
  /**
   * A nyitott munkamenet lejárttá tétele: utána nem fizethető ki (L16 – az elrejtett kép, a letiltott
   * felhasználó fizetései). A már lezárt vagy lejárt munkamenetre a Stripe hibát ad.
   */
  expireCheckoutSession(id: string): Promise<CheckoutSessionInfo>;
}

/**
 * A Stripe hívása nem sikerült; az üzenet a sajátunk, a Stripe-é nem kerül bele. A naplóhoz csak a
 * hiba típusa, kódja, HTTP-státusza és a Stripe-kérés azonosítója marad meg (ezzel a Stripe
 * Dashboardon a kérés visszakereshető).
 */
export class PaymentError extends Error {
  /** A Stripe-hiba típusa (pl. StripeAuthenticationError) */
  readonly stripeErrorType: string | undefined;
  /** A Stripe hibakódja (pl. api_key_expired) */
  readonly stripeCode: string | undefined;
  readonly statusCode: number | undefined;
  readonly requestId: string | undefined;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PaymentError';
    const stripeError = cause instanceof Stripe.errors.StripeError ? cause : undefined;
    this.stripeErrorType = stripeError?.type ?? (cause instanceof Error ? cause.name : undefined);
    this.stripeCode = stripeError?.code;
    this.statusCode = stripeError?.statusCode;
    this.requestId = stripeError?.requestId;
  }
}

/** A Stripe-kliens azon része, amelyet a szolgáltatás használ (a tesztekben utánzat). */
export interface StripeCheckoutClient {
  checkout: {
    sessions: Pick<Stripe.Checkout.SessionResource, 'create' | 'retrieve' | 'expire'>;
  };
}

/** A Stripe-hívás legfeljebb ennyi ideig tarthat (az SDK alapértéke 80 s) */
const STRIPE_TIMEOUT_MS = 10_000;
/** Hálózati hibánál ennyiszer próbálja újra az SDK (ugyanazzal az idempotenciakulccsal) */
const STRIPE_MAX_NETWORK_RETRIES = 2;
const MS_PER_SECOND = 1000;

/** A Stripe-kliens a teszt módú kulccsal; a telemetria (a kérések időadatai a Stripe-nak) kikapcsolva. */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    timeout: STRIPE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
    telemetry: false,
  });
}

/** A munkamenet azon mezői, amelyekre a szerver épít (a többit a Zod eldobja). */
const checkoutSessionSchema = z.object({
  id: z.string().regex(/^cs_\w+$/),
  url: z.string().nullish(),
  status: z.enum(SESSION_STATUSES),
  payment_status: z.enum(PAYMENT_STATUSES),
  amount_total: z.number().int().nullish(),
  currency: z.string().nullish(),
  metadata: z.record(z.string(), z.string()).nullish(),
});

const orderIdSchema = z.uuid();

/**
 * A Stripe munkamenet-objektumának (webhook-esemény vagy lekérdezés) beolvasása; a felismerhetetlen
 * objektumnál null.
 */
export function parseCheckoutSession(value: unknown): CheckoutSessionInfo | null {
  const parsed = checkoutSessionSchema.safeParse(value);
  if (!parsed.success) return null;
  const session = parsed.data;
  const orderId = orderIdSchema.safeParse(session.metadata?.orderId);
  return {
    id: session.id,
    url: session.url ?? null,
    status: session.status,
    paymentStatus: session.payment_status,
    orderId: orderId.success ? orderId.data : null,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
  };
}

export function createStripePaymentService(stripe: StripeCheckoutClient): PaymentService {
  return {
    async createCheckoutSession(request) {
      // Egy tétel: a kép licence; az összeg fillérben (a vásárolhatatlan árat el sem küldjük)
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: STRIPE_CURRENCY,
              unit_amount: toStripeAmount(request.amountHuf),
              product_data: { name: request.productName },
            },
          },
        ],
        // Csak kártya: a fizetés azonnal eldől (nincs napokig függő banki átutalás). A 2026-09-30-as
        // API-verzióban a payment_method_types helyett ez a szűrő a dinamikus fizetési módokon.
        allowed_payment_method_types: ['card'],
        metadata: { orderId: request.orderId },
        client_reference_id: request.orderId,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        expires_at: Math.floor(request.expiresAt.getTime() / MS_PER_SECOND),
      };
      let session: Stripe.Checkout.Session;
      try {
        // Az idempotenciakulcs miatt az újrapróbálás sem hoz létre második munkamenetet a rendeléshez
        session = await stripe.checkout.sessions.create(params, {
          idempotencyKey: `checkout-${request.orderId}`,
        });
      } catch (error) {
        throw new PaymentError('A Checkout-munkamenet nem jött létre', error);
      }
      if (!session.url) throw new PaymentError('A Checkout-munkamenetnek nincs fizetési oldala');
      return { id: session.id, url: session.url };
    },

    async getCheckoutSession(id) {
      let raw: unknown;
      try {
        raw = await stripe.checkout.sessions.retrieve(id);
      } catch (error) {
        throw new PaymentError('A Checkout-munkamenet nem kérdezhető le', error);
      }
      return parsedSession(raw);
    },

    async expireCheckoutSession(id) {
      let raw: unknown;
      try {
        raw = await stripe.checkout.sessions.expire(id);
      } catch (error) {
        throw new PaymentError('A Checkout-munkamenet nem tehető lejárttá', error);
      }
      return parsedSession(raw);
    },
  };
}

/** A Stripe válaszának beolvasása; a felismerhetetlen válasz PaymentError. */
function parsedSession(raw: unknown): CheckoutSessionInfo {
  const session = parseCheckoutSession(raw);
  if (!session) throw new PaymentError('A Checkout-munkamenet válasza felismerhetetlen');
  return session;
}
