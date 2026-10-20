// Az árak és a Stripe-nak küldött összeg szabályai (HUF). A Stripe a forintot a terheléskor
// kétdecimális pénznemként kezeli: az összeg a legkisebb egységben (fillérben) megy, így egész
// forintból mindig 100-zal osztható – a HUF-kifizetések szabályának is ez felel meg. A legkisebb
// terhelhető összeg 175 Ft; a 9 999 999 Ft fillérben 9 számjegy, ennyit az American Express is
// elfogad (a többi kártyatársaság 12 számjegyet) [S29].
// Forrás: Stripe – Supported currencies (Specify amounts in API requests; Special cases: Hungarian
// Forint; Minimum and maximum charge amounts), https://docs.stripe.com/currencies

/** A Stripe által terhelhető legkisebb összeg forintban */
export const MIN_PRICE_HUF = 175;
/** A legnagyobb ár forintban: fillérben 9 számjegy (az American Express felső határa) */
export const MAX_PRICE_HUF = 9_999_999;
/** A Stripe pénznemkódja – kisbetűvel, ahogy a Stripe várja és visszaadja */
export const STRIPE_CURRENCY = 'huf';
/** 1 Ft = 100 fillér: a Stripe a forintot kétdecimális pénznemként kezeli */
export const MINOR_UNITS_PER_HUF = 100;

/** Vásárolható ár: egész forint a Stripe minimuma és a felső határ között. */
export function isPurchasablePrice(priceHuf: number): boolean {
  return Number.isInteger(priceHuf) && priceHuf >= MIN_PRICE_HUF && priceHuf <= MAX_PRICE_HUF;
}

/** A Stripe-nak küldendő összeg fillérben; vásárolhatatlan árnál RangeError (nem mehet a Stripe-hoz). */
export function toStripeAmount(priceHuf: number): number {
  if (!isPurchasablePrice(priceHuf)) throw new RangeError(`Nem vásárolható ár: ${priceHuf} Ft`);
  return priceHuf * MINOR_UNITS_PER_HUF;
}
