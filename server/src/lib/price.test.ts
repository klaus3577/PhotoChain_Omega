// Az árak szabályai a Stripe HUF-szabályai szerint [S29]: a forint a terhelésnél kétdecimális
// pénznem (az összeg fillérben megy), a legkisebb terhelhető összeg 175 Ft, és a 9 999 999 Ft
// fillérben még 9 számjegy (ennyit az American Express is elfogad).
import { describe, expect, it } from 'vitest';

import {
  isPurchasablePrice,
  MAX_PRICE_HUF,
  MIN_PRICE_HUF,
  STRIPE_CURRENCY,
  toStripeAmount,
} from './price.js';

describe('árszabályok (Stripe, HUF)', () => {
  it('a HUF kétdecimális pénznemként megy a Stripe-nak: az összeg fillérben (Ft × 100)', () => {
    expect(STRIPE_CURRENCY).toBe('huf');
    expect(toStripeAmount(2500)).toBe(250_000);
    expect(toStripeAmount(MIN_PRICE_HUF)).toBe(17_500);
    // Egész forintból az összeg mindig 100-zal osztható (a HUF-kifizetések szabálya is ez)
    expect(toStripeAmount(MAX_PRICE_HUF) % 100).toBe(0);
  });

  it('a határok: 175 Ft (a Stripe minimuma) és 9 999 999 Ft (fillérben 9 számjegy)', () => {
    expect(MIN_PRICE_HUF).toBe(175);
    expect(MAX_PRICE_HUF).toBe(9_999_999);
    expect(String(toStripeAmount(MAX_PRICE_HUF))).toHaveLength(9);
  });

  it('vásárolható ár: egész szám a két határ között', () => {
    for (const price of [175, 2500, 9_999_999]) expect(isPurchasablePrice(price)).toBe(true);
    for (const price of [0, 174, 10_000_000, 2500.5, -175, Number.NaN]) {
      expect(isPurchasablePrice(price)).toBe(false);
    }
  });

  it('a határokon kívüli vagy tört összeget nem alakítja át (nem kerülhet a Stripe-hoz)', () => {
    for (const price of [0, 174, 10_000_000, 2500.5]) {
      expect(() => toStripeAmount(price)).toThrow(RangeError);
    }
  });
});
