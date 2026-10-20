// A fizetés szimulálása (L28): a tesztek a Stripe fizetési oldaláig mennek, a sikeres fizetést pedig
// egy aláírt tesztesemény (checkout.session.completed) játssza el – az aláírást a Stripe SDK
// generateTestHeaderString segédje készíti az E2E-szerver (eldobható) webhook-titkával, így a
// szerver valódi aláírás-ellenőrzése fut. Kártyaadat sehol nem szerepel.
// Forrás: Stripe Node.js SDK – Testing webhook signing (generateTestHeaderString),
// https://github.com/stripe/stripe-node#testing-webhook-signing (adaptálva)
import { randomBytes } from 'node:crypto';

import Stripe from 'stripe';

import { ENV_KEYS, requiredEnv } from '../setup/env';

/** A Stripe a forintot a legkisebb egységben (fillér) adja meg */
const MINOR_UNITS_PER_HUF = 100;

export interface PaidSession {
  sessionId: string;
  orderId: string;
  amountHuf: number;
}

export interface SignedEvent {
  body: string;
  signature: string;
}

/** Egy kifizetett Checkout Session eseménye a szerver által használt mezőkkel, aláírva. */
export function signedCheckoutCompleted({
  sessionId,
  orderId,
  amountHuf,
}: PaidSession): SignedEvent {
  const secret = requiredEnv(ENV_KEYS.webhookSecret);
  const event = {
    id: `evt_e2e_${randomBytes(12).toString('hex')}`,
    object: 'event',
    type: 'checkout.session.completed',
    api_version: '2026-09-30.endive',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        amount_total: amountHuf * MINOR_UNITS_PER_HUF,
        currency: 'huf',
        metadata: { orderId },
        client_reference_id: orderId,
        url: null,
        livemode: false,
      },
    },
  };
  const body = JSON.stringify(event);
  return { body, signature: Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
}
