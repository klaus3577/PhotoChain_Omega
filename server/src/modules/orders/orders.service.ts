// A rendelések üzleti logikája (terv 3.3, L14): a fizetés indítása (Stripe Checkout), a Stripe
// eseményeinek feldolgozása, a rendelés állapota és a vásárlásaim lista.
// - Indítás: csak nyilvános (REGISTERED), nem saját, még meg nem vett, a Stripe minimumát elérő árú
//   kép. Az összeg a checkoutkori ár (Order.amountHuf): a kép árának későbbi módosítása nem hat rá.
//   A visszatérési URL-ek a szerver konfigurációjából (APP_BASE_URL) jönnek, soha nem a klienstől.
// - Egy vevőnek egy képre legfeljebb egy élő (PENDING vagy PAID) rendelése lehet: ezt az adatbázis
//   részleges egyedi indexe kényszeríti ki, így párhuzamos kérésekből sem lesz kettő. Függő
//   rendelésnél a nyitott munkamenet URL-je jön vissza (szerzői döntés, 2026-10-04); a lejárt
//   helyett új indul, a kifizetett, de a webhook által még le nem zárt rendelés PAID lesz.
// - Állapotváltás csak feltételesen (updateMany, PENDING → PAID / EXPIRED / FAILED): a Stripe
//   ugyanazt az eseményt többször is elküldheti, a második már hatástalan. PAID csak fizetett
//   munkamenetből lesz, és csak ha az összeg és a pénznem egyezik a rendelésével.
// - A rendelést a webhook mellett a sikeres fizetés oldala is lezárja (a Stripe ajánlása, mert a
//   webhook késhet vagy elmaradhat): a függő rendelés lekérdezésekor a munkamenet állapota a
//   Stripe-tól jön, és ugyanaz a lezárás fut, mint a webhooknál.
// - A kép elrejtésekor és a felhasználó tiltásakor a nyitott fizetések lezárulnak (L16, szerzői
//   döntés, 2026-10-06): a munkamenet lejárttá válik a Stripe-nál (utána nem fizethető ki), a
//   rendelés EXPIRED; a munkamenet nélküli (épp induló) rendelés FAILED, így a közben létrejövő
//   munkamenete már nem kerül hozzá (a gazdátlan munkamenet is lejár). Az induló fizetés a rendelés
//   beszúrása után újra ellenőrzi a képet és a vevőt – így egy egyidejű elrejtés vagy tiltás sem
//   hagy fizethető munkamenetet. Ha a Stripe nem érhető el, vagy a munkamenetet közben kifizették, a
//   rendelés függő marad – a Stripe eseménye (webhook) dönt róla; ez a naplóba kerül.
// Forrás: Stripe – Receive Stripe events in your webhook endpoint (Handle duplicate events, Event
// ordering), https://docs.stripe.com/webhooks; Stripe – Fulfill orders (Trigger fulfillment on your
// landing page), https://docs.stripe.com/checkout/fulfillment; Stripe – Build a payments page (Checkout),
// https://docs.stripe.com/payments/checkout; Stripe API Reference – Expire a Checkout Session,
// https://docs.stripe.com/api/checkout/sessions/expire; Prisma ORM v7 – CRUD (updateMany),
// Transactions, https://www.prisma.io/docs/orm/v7/prisma-client/queries (adaptálva)
import PQueue from 'p-queue';
import type { Logger } from 'pino';

import type { OrderStatus, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import {
  isPurchasablePrice,
  MIN_PRICE_HUF,
  MINOR_UNITS_PER_HUF,
  STRIPE_CURRENCY,
} from '../../lib/price.js';
import { isUniqueViolation } from '../../lib/prisma.js';
import { type PageMeta, pageMeta, type Pagination } from '../../lib/schemas.js';
import {
  type CheckoutSessionInfo,
  type CreatedCheckoutSession,
  parseCheckoutSession,
  PaymentError,
  type PaymentService,
} from '../../services/payment.service.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import {
  canView,
  isPublic,
  type PhotoViewer,
  VISIBILITY_SELECT,
} from '../photos/photos.visibility.js';
import { type OrderDto, orderSelect, toOrderDto } from './orders.dto.js';

/**
 * A munkamenet élettartama: a Stripe legrövidebb lejárati ideje (30 perc) és 1 perc tartalék – a
 * Stripe a saját órája szerinti létrehozástól méri, a hálózati késés nem viheti a minimum alá.
 */
const SESSION_LIFETIME_MS = 31 * 60_000;
/**
 * A munkamenet nélküli függő rendelés ennyi idő után félbemaradtnak számít (a munkamenet
 * létrehozása az újrapróbálásokkal együtt sem tart tovább): lezárható, és új indulhat helyette.
 */
const STALE_ORDER_MS = 2 * 60_000;
/** A kliens oldalai, ahová a Stripe a fizetés után visszairányít (L22) */
export const CHECKOUT_SUCCESS_PATH = '/checkout/success';
export const CHECKOUT_CANCEL_PATH = '/checkout/cancel';

/** A fizetés indításának eredménye; a created hamis, ha a meglévő munkamenet jött vissza. */
export interface CheckoutResult {
  orderId: string;
  checkoutUrl: string;
  created: boolean;
}

export interface OrderPage {
  orders: OrderDto[];
  meta: PageMeta;
}

/** Kinek a nyitott fizetései zárulnak le: egy képé, vagy egy felhasználóé (eladóként és vevőként). */
export type CheckoutScope = { photoId: string } | { userId: string };

export interface OrdersService {
  checkout(buyer: PhotoViewer, photoId: string): Promise<CheckoutResult>;
  /**
   * A vevő rendelése a Stripe-munkamenet azonosítója alapján (másé 404); a függő rendelést előbb a
   * Stripe szerint lezárja (kifizetve: PAID, lejárt: EXPIRED).
   */
  getBySession(buyerId: string, sessionId: string): Promise<OrderDto>;
  /** A vevő kifizetett rendelései, a legutóbb fizetett elöl. */
  listPurchases(buyerId: string, pagination: Pagination): Promise<OrderPage>;
  /** Egy ellenőrzött Stripe-esemény feldolgozása; az ismeretlen típus hatástalan. */
  handleEvent(type: string, object: unknown): Promise<void>;
  /**
   * A még fizetetlen (függő) rendelések lezárása – az elrejtett kép, illetve a letiltott felhasználó
   * fizetései. A Stripe hibája nem szakítja meg (naplózza).
   */
  closeOpenCheckouts(scope: CheckoutScope): Promise<void>;
}

export interface OrdersServiceDependencies {
  prisma: PrismaClient;
  payments: PaymentService;
  storage: Pick<StorageService, 'publicUrl'>;
  logger: Logger;
  /** A kliens eredete (APP_BASE_URL) – ide irányít vissza a Stripe */
  appBaseUrl: string;
}

const PURCHASE_SELECT = {
  ...VISIBILITY_SELECT,
  id: true,
  priceHuf: true,
  title: true,
} as const satisfies Prisma.PhotoSelect;

type PurchasablePhoto = Prisma.PhotoGetPayload<{ select: typeof PURCHASE_SELECT }>;

const LIVE_ORDER_SELECT = {
  id: true,
  status: true,
  stripeSessionId: true,
  createdAt: true,
} as const satisfies Prisma.OrderSelect;

type LiveOrder = Prisma.OrderGetPayload<{ select: typeof LIVE_ORDER_SELECT }>;

/** A lezárandó függő rendelés adatai: az azonosítója és a Stripe-munkamenete (ha már van). */
const OPEN_ORDER = { id: true, stripeSessionId: true } as const satisfies Prisma.OrderSelect;

type OpenOrder = Prisma.OrderGetPayload<{ select: typeof OPEN_ORDER }>;

/**
 * Egyszerre legfeljebb ennyi munkamenet lezárása fut (a Stripe teszt módban kb. 25 kérést fogad
 * másodpercenként – sok függő rendelésnél se fussunk bele a korlátjába)
 */
export const CHECKOUT_CLOSE_CONCURRENCY = 4;

/** Az élő (függő vagy kifizetett) rendelések – a részleges egyedi index is ezeket fedi. */
const LIVE_STATUSES: OrderStatus[] = ['PENDING', 'PAID'];

/** A feldolgozott Stripe-események; a többi (pl. payment_intent.*) hatástalan. */
const FULFILLING_EVENTS: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);
const CLOSING_EVENTS: ReadonlyMap<string, 'EXPIRED' | 'FAILED'> = new Map([
  ['checkout.session.expired', 'EXPIRED'],
  ['checkout.session.async_payment_failed', 'FAILED'],
]);

const photoNotFound = (): AppError => new AppError(404, 'NOT_FOUND', 'A kép nem található');
const notPurchasable = (message: string): AppError => new AppError(409, 'NOT_PURCHASABLE', message);
const alreadyPurchased = (): AppError =>
  new AppError(409, 'ALREADY_PURCHASED', 'Ezt a képet már megvásároltad');
const checkoutInProgress = (): AppError =>
  new AppError(
    409,
    'CHECKOUT_IN_PROGRESS',
    'A fizetés indítása vagy feldolgozása folyamatban – próbáld újra pár másodperc múlva',
  );

/**
 * A fizetési hiba naplózható adatai: a hiba típusa, kódja, HTTP-státusza és a Stripe-kérés
 * azonosítója – a Stripe üzenete nélkül (a kulcs egy részletét is tartalmazhatja).
 */
function paymentErrorDetails(error: unknown): Record<string, unknown> {
  return error instanceof PaymentError
    ? {
        stripeErrorType: error.stripeErrorType,
        stripeCode: error.stripeCode,
        statusCode: error.statusCode,
        requestId: error.requestId,
      }
    : // Váratlan hiba: a teljes hiba a naplóba kerül (a napló a titkokat kitakarja)
      { err: error };
}

/** A lezárandó függő rendelések szűrője. */
function openCheckoutsWhere(scope: CheckoutScope): Prisma.OrderWhereInput {
  if ('photoId' in scope) return { status: 'PENDING', photoId: scope.photoId };
  return {
    status: 'PENDING',
    OR: [{ buyerId: scope.userId }, { photo: { ownerId: scope.userId } }],
  };
}

export function createOrdersService({
  prisma,
  payments,
  storage,
  logger,
  appBaseUrl,
}: OrdersServiceDependencies): OrdersService {
  // A nyitott fizetések lezárásának sora: egymástól független munkamenetek párhuzamosan (a Stripe
  // lassúsága nem adódik össze), de az egész szolgáltatásra együtt korlátozott számban – sok függő
  // rendelésnél és több egyidejű elrejtésnél se fussunk bele a Stripe sebességkorlátjába
  const checkoutClosing = new PQueue({ concurrency: CHECKOUT_CLOSE_CONCURRENCY });

  /** A megvásárolható kép; a nem látható kép 404, a saját 403, a nem vásárolható 409. */
  async function findPurchasablePhoto(
    photoId: string,
    buyer: PhotoViewer,
  ): Promise<PurchasablePhoto> {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: PURCHASE_SELECT,
    });
    if (!photo || !canView(photo, buyer)) throw photoNotFound();
    if (photo.ownerId === buyer.id) {
      throw new AppError(403, 'FORBIDDEN', 'A saját képedet nem vásárolhatod meg');
    }
    // A képet látó, de nem nyilvános képet (az adminnak a rejtettet, a letiltott fotósét) sem
    if (!isPublic(photo)) throw notPurchasable('A kép jelenleg nem vásárolható');
    if (!isPurchasablePrice(photo.priceHuf)) {
      throw notPurchasable(
        `A kép ára nem fizethető ki (a legkisebb fizethető összeg ${MIN_PRICE_HUF} Ft)`,
      );
    }
    return photo;
  }

  /** A fizetési szolgáltatás hibája: naplózzuk (a Stripe üzenete nélkül), a kliens 503-at kap. */
  function paymentUnavailable(error: unknown, orderId: string): AppError {
    logger.error(
      { orderId, ...paymentErrorDetails(error) },
      'A fizetési szolgáltatás hívása nem sikerült',
    );
    return new AppError(
      503,
      'PAYMENT_UNAVAILABLE',
      'A fizetési szolgáltatás most nem érhető el – próbáld újra később',
    );
  }

  /**
   * A függő rendelés lezárása (feltételesen: csak ha még függő, és a munkamenete egyezik); true, ha
   * most zárult le.
   */
  async function closeOrder(
    orderId: string,
    stripeSessionId: string | null,
    status: 'EXPIRED' | 'FAILED',
  ): Promise<boolean> {
    const { count } = await prisma.order.updateMany({
      where: { id: orderId, status: 'PENDING', stripeSessionId },
      data: { status },
    });
    if (count > 0) logger.info({ orderId, status }, 'A függő rendelés lezárva');
    return count > 0;
  }

  /**
   * A fizetett munkamenet rendelésének lezárása (PAID). Csak a függő rendelés, csak fizetett
   * munkamenetből, és csak egyező összeggel és pénznemmel; true, ha a rendelés kifizetett (most
   * vagy egy párhuzamos esemény nyomán).
   */
  async function fulfill(session: CheckoutSessionInfo): Promise<boolean> {
    const { orderId, id: sessionId } = session;
    if (orderId === null) {
      logger.warn(
        { sessionId },
        'Fizetési esemény rendelés-azonosító nélkül – figyelmen kívül hagyva',
      );
      return false;
    }
    if (session.paymentStatus !== 'paid') {
      logger.info(
        { orderId, sessionId },
        'A munkamenet lezárult, de a fizetés még nem érkezett meg',
      );
      return false;
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { amountHuf: true },
    });
    if (!order) {
      logger.warn({ orderId, sessionId }, 'Fizetési esemény ismeretlen rendeléshez');
      return false;
    }
    const expectedAmount = order.amountHuf * MINOR_UNITS_PER_HUF;
    if (session.currency !== STRIPE_CURRENCY || session.amountTotal !== expectedAmount) {
      logger.error(
        {
          orderId,
          sessionId,
          amountTotal: session.amountTotal,
          currency: session.currency,
          expectedAmount,
        },
        'A fizetett összeg vagy pénznem eltér a rendelésétől – a rendelés nem zárható le',
      );
      return false;
    }
    // A munkamenet nélküli rendelés: a létrehozás után a mentés félbemaradt – most rögzítjük
    const { count } = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: 'PENDING',
        OR: [{ stripeSessionId: sessionId }, { stripeSessionId: null }],
      },
      data: { status: 'PAID', paidAt: new Date(), stripeSessionId: sessionId },
    });
    if (count > 0) {
      logger.info({ orderId, sessionId }, 'A rendelés kifizetve');
      return true;
    }
    // Nem változott: a friss állapot dönt – egy párhuzamos esemény (pl. a webhook újraküldése) már
    // kifizetettre állíthatta ugyanezzel a munkamenettel, vagy a rendelés közben lezárult. Ha egy
    // MÁSIK munkamenet fizetett, az kettős fizetés: kézi ellenőrzés (visszatérítés) kell
    const current = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, stripeSessionId: true },
    });
    if (current?.status === 'PAID' && current.stripeSessionId === sessionId) return true;
    logger.error(
      { orderId, sessionId, status: current?.status },
      'Fizetés érkezett egy lezárt vagy más munkamenetű rendelésre – kézi ellenőrzés szükséges',
    );
    return false;
  }

  /**
   * A sikeroldal lekérdezésekor a függő rendelés munkamenetének állapota a Stripe-tól – a webhook
   * késhet vagy elmaradhat, ezért a Stripe ajánlása szerint a visszatérési oldal is lezárja a
   * rendelést. A kifizetett munkamenet rendelése PAID, a lejárté EXPIRED lesz, ugyanazokkal a
   * szabályokkal, mint a webhooknál. Ha a Stripe nem érhető el, a tárolt állapot marad (a rendelésről
   * a Stripe eseménye dönt). True, ha a rendelés állapota változhatott.
   */
  async function reconcileWithStripe(orderId: string, sessionId: string): Promise<boolean> {
    let session: CheckoutSessionInfo;
    try {
      session = await payments.getCheckoutSession(sessionId);
    } catch (error) {
      logger.warn(
        { orderId, sessionId, ...paymentErrorDetails(error) },
        'A munkamenet állapota nem kérdezhető le – a rendelésről a Stripe eseménye dönt',
      );
      return false;
    }
    if (session.orderId !== orderId) {
      logger.error(
        { orderId, sessionId, sessionOrderId: session.orderId },
        'A munkamenet metaadata más rendelésre mutat – a rendelés nem zárható le',
      );
      return false;
    }
    if (session.status === 'expired') return closeOrder(orderId, sessionId, 'EXPIRED');
    if (session.status === 'complete') return fulfill(session);
    return false;
  }

  /**
   * A függő rendelés folytatása: a nyitott munkamenet fizetési oldalának címe, vagy null, ha a
   * rendelés lezárult, és új indulhat. A még induló vagy feldolgozás alatti rendelésnél 409.
   */
  async function resumePending(order: LiveOrder): Promise<string | null> {
    if (order.stripeSessionId === null) {
      if (Date.now() - order.createdAt.getTime() < STALE_ORDER_MS) throw checkoutInProgress();
      logger.warn({ orderId: order.id }, 'Félbemaradt (munkamenet nélküli) rendelés');
      await closeOrder(order.id, null, 'FAILED');
      return null;
    }
    let session: CheckoutSessionInfo;
    try {
      session = await payments.getCheckoutSession(order.stripeSessionId);
    } catch (error) {
      throw paymentUnavailable(error, order.id);
    }
    if (session.status === 'open' && session.url !== null) return session.url;
    if (session.status === 'expired') {
      await closeOrder(order.id, session.id, 'EXPIRED');
      return null;
    }
    // Lezárt munkamenet: ha kifizették, a webhook még nem dolgozta fel – most zárjuk le
    if (await fulfill(session)) throw alreadyPurchased();
    throw checkoutInProgress();
  }

  /**
   * Egy függő rendelés lezárása: a munkamenete lejárttá válik (EXPIRED); a munkamenet nélküli
   * FAILED – így a közben létrejövő munkamenete már nem kerül hozzá (startCheckout). Ha a Stripe
   * hibát ad (nem érhető el, vagy a munkamenetet közben kifizették), a rendelés függő marad.
   */
  async function closeCheckout(order: OpenOrder): Promise<void> {
    const { id: orderId, stripeSessionId } = order;
    if (stripeSessionId === null) {
      if (await closeOrder(orderId, null, 'FAILED')) return;
      // Nem változott: vagy közben lezárult (nincs teendő), vagy a munkamenete épp most került
      // hozzá (startCheckout) – akkor azt kell lezárni
      const current = await prisma.order.findFirst({
        where: { id: orderId, status: 'PENDING' },
        select: OPEN_ORDER,
      });
      if (current?.stripeSessionId) await closeCheckout(current);
      return;
    }
    if (await expireSession(orderId, stripeSessionId)) {
      await closeOrder(orderId, stripeSessionId, 'EXPIRED');
    }
  }

  /**
   * A munkamenet lejárttá tétele a Stripe-nál; hibánál (nem érhető el, vagy közben kifizették)
   * naplóz, és false-t ad – a rendelésről ekkor a Stripe eseménye dönt.
   */
  async function expireSession(orderId: string, sessionId: string): Promise<boolean> {
    try {
      await payments.expireCheckoutSession(sessionId);
      return true;
    } catch (error) {
      logger.warn(
        { orderId, sessionId, ...paymentErrorDetails(error) },
        'A nyitott fizetés nem zárható le – a rendelésről a Stripe eseménye dönt',
      );
      return false;
    }
  }

  /**
   * A frissen létrehozott rendelés még vásárolható-e: az ellenőrzés óta nem rejtették el a képet, és
   * nem tiltották le a fotóst vagy a vevőt. Ha a rejtés vagy a tiltás a rendelés beszúrása ELŐTT
   * történt, ez az újraolvasás látja; ha utána, akkor a lezárása (closeOpenCheckouts) már látja a
   * rendelést – így egyik sorrendben sem marad fizethető munkamenet (ehhez a rejtés / tiltás írása és
   * a lezárás lekérdezése külön utasítás kell legyen, nem egy közös tranzakció). Ha már nem
   * vásárolható, a rendelés FAILED lesz (a Stripe-munkamenet létre sem jön); a vevő a már nem
   * látható képre 404-et kap (mint az első ellenőrzésnél), a letiltott vevő 403-at.
   */
  async function assertStillPurchasable(
    orderId: string,
    photoId: string,
    buyer: PhotoViewer,
  ): Promise<void> {
    const [photo, buyerAccount] = await Promise.all([
      prisma.photo.findUnique({ where: { id: photoId }, select: VISIBILITY_SELECT }),
      prisma.user.findUnique({ where: { id: buyer.id }, select: { isBlocked: true } }),
    ]).catch(async (error: unknown) => {
      // Az ellenőrzés hibája után se maradjon félbehagyott függő rendelés (a hibája csak naplózódik)
      await closeOrder(orderId, null, 'FAILED').catch((closeError: unknown) => {
        logger.error({ orderId, err: closeError }, 'A függő rendelés nem zárható le');
      });
      throw error;
    });
    const buyerBlocked = buyerAccount?.isBlocked !== false;
    if (!buyerBlocked && photo && isPublic(photo)) return;
    await closeOrder(orderId, null, 'FAILED');
    if (buyerBlocked) {
      throw new AppError(403, 'ACCOUNT_BLOCKED', 'A fiókot az adminisztrátor letiltotta');
    }
    if (!photo || !canView(photo, buyer)) throw photoNotFound();
    throw notPurchasable('A kép jelenleg nem vásárolható');
  }

  /** Új függő rendelés a checkoutkori árral; ha párhuzamosan már létrejött egy, 409. */
  async function createPendingOrder(
    buyerId: string,
    photo: PurchasablePhoto,
  ): Promise<{ id: string; amountHuf: number }> {
    try {
      return await prisma.order.create({
        data: { buyerId, photoId: photo.id, amountHuf: photo.priceHuf },
        select: { id: true, amountHuf: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw checkoutInProgress();
      throw error;
    }
  }

  /** Új rendelés és Checkout-munkamenet. */
  async function startCheckout(
    buyer: PhotoViewer,
    photo: PurchasablePhoto,
  ): Promise<CheckoutResult> {
    const order = await createPendingOrder(buyer.id, photo);
    await assertStillPurchasable(order.id, photo.id, buyer);
    let session: CreatedCheckoutSession;
    try {
      session = await payments.createCheckoutSession({
        orderId: order.id,
        amountHuf: order.amountHuf,
        productName: photo.title,
        successUrl: `${appBaseUrl}${CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appBaseUrl}${CHECKOUT_CANCEL_PATH}?photoId=${photo.id}`,
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      });
    } catch (error) {
      // A rendelés nem marad függőben: a következő kísérlet új rendelést indíthat
      await closeOrder(order.id, null, 'FAILED');
      throw paymentUnavailable(error, order.id);
    }
    // Csak a még függő, munkamenet nélküli rendeléshez: ha közben lezárták, a munkamenet nem kerül
    // hozzá (a fizetési oldal címe sem megy ki – a munkamenet fizetés nélkül lejár)
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: 'PENDING', stripeSessionId: null },
      data: { stripeSessionId: session.id },
    });
    if (count === 0) {
      logger.warn(
        { orderId: order.id, sessionId: session.id },
        'A rendelés a munkamenet létrehozása közben lezárult',
      );
      // A gazdátlan munkamenet se maradjon fizethető (a címe ki sem ment); a hibája csak naplózódik
      await expireSession(order.id, session.id);
      // Ha az ok egy közbejött elrejtés vagy tiltás, azt kapja a vevő (404 / 403), ne „próbáld újra”-t
      await assertStillPurchasable(order.id, photo.id, buyer);
      throw checkoutInProgress();
    }
    return { orderId: order.id, checkoutUrl: session.url, created: true };
  }

  return {
    async checkout(buyer, photoId) {
      const photo = await findPurchasablePhoto(photoId, buyer);
      const live = await prisma.order.findFirst({
        where: { buyerId: buyer.id, photoId: photo.id, status: { in: LIVE_STATUSES } },
        select: LIVE_ORDER_SELECT,
      });
      if (live?.status === 'PAID') throw alreadyPurchased();
      if (live) {
        const checkoutUrl = await resumePending(live);
        if (checkoutUrl !== null) return { orderId: live.id, checkoutUrl, created: false };
      }
      return startCheckout(buyer, photo);
    },

    async getBySession(buyerId, sessionId) {
      const order = await prisma.order.findFirst({
        where: { stripeSessionId: sessionId, buyerId },
        select: orderSelect(buyerId),
      });
      if (!order) throw new AppError(404, 'NOT_FOUND', 'A rendelés nem található');
      // A függő rendelést a Stripe szerint lezárjuk (a már lezártnál nincs Stripe-hívás); a rendelés
      // soha nem törlődik, így a friss állapota mindig megvan
      if (order.status === 'PENDING' && (await reconcileWithStripe(order.id, sessionId))) {
        const current = await prisma.order.findUniqueOrThrow({
          where: { id: order.id },
          select: orderSelect(buyerId),
        });
        return toOrderDto(current, storage);
      }
      return toOrderDto(order, storage);
    },

    async listPurchases(buyerId, { page, pageSize }) {
      const where = { buyerId, status: 'PAID' } as const;
      // A darabszám és az oldal ugyanabból a pillanatképből (mint a galériánál, L13)
      const [total, orders] = await prisma.$transaction(
        [
          prisma.order.count({ where }),
          prisma.order.findMany({
            where,
            orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: orderSelect(buyerId),
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      return {
        orders: orders.map((order) => toOrderDto(order, storage)),
        meta: pageMeta({ page, pageSize }, total),
      };
    },

    async handleEvent(type, object) {
      const closingStatus = CLOSING_EVENTS.get(type);
      if (!FULFILLING_EVENTS.has(type) && closingStatus === undefined) return;
      const session = parseCheckoutSession(object);
      if (!session) {
        logger.warn({ type }, 'Felismerhetetlen Checkout-munkamenet a Stripe-eseményben');
        return;
      }
      if (closingStatus === undefined) {
        await fulfill(session);
      } else if (session.orderId !== null) {
        await closeOrder(session.orderId, session.id, closingStatus);
      }
    },

    async closeOpenCheckouts(scope) {
      const pending = await prisma.order.findMany({
        where: openCheckoutsWhere(scope),
        select: OPEN_ORDER,
      });
      // Mind lefut (az egyik hibája nem hagyja félbe a többit); minden hiba a naplóba kerül, az első
      // a végén tovább is jut
      const results = await Promise.allSettled(
        pending.map((order) => checkoutClosing.add(() => closeCheckout(order))),
      );
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected' ? [{ orderId: pending[index]?.id, err: result.reason }] : [],
      );
      for (const failure of failures) {
        logger.error(failure, 'A nyitott fizetés lezárása nem sikerült');
      }
      if (failures[0]) throw failures[0].err;
    },
  };
}
