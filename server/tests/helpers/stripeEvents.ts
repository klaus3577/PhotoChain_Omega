// Tesztsegéd: aláírt Stripe-webhook események. Az aláírást (Stripe-Signature fejléc) a Stripe SDK
// generateTestHeaderString segédfüggvénye készíti a tesztkonfiguráció webhook-titkával – ugyanúgy,
// ahogy a Stripe a valódi eseményeket aláírja –, így a szerver valódi aláírás-ellenőrzése fut.
// Forrás: Stripe Node.js SDK – Webhook signing (generateTestHeaderString),
// https://github.com/stripe/stripe-node#testing-webhook-signing (adaptálva)
import { randomBytes } from 'node:crypto';

import type { Express } from 'express';
import Stripe from 'stripe';
import request from 'supertest';

import { TEST_ENV } from './testApp.js';

export const WEBHOOK_PATH = '/api/webhooks/stripe';

/** Egy Checkout Session a webhook-esemény alakjában (csak a szerver által használt mezőkkel). */
export function checkoutSessionObject(overrides: Record<string, unknown> = {}) {
  return {
    id: `cs_test_${randomBytes(24).toString('hex')}`,
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 250_000,
    currency: 'huf',
    metadata: {},
    url: null,
    livemode: false,
    ...overrides,
  };
}

/** Egy Stripe-esemény (snapshot event) a megadott típussal és objektummal. */
export function stripeEvent(
  type: string,
  object: unknown,
  id = `evt_${randomBytes(12).toString('hex')}`,
) {
  return {
    id,
    object: 'event',
    type,
    api_version: '2026-09-30.endive',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    data: { object },
  };
}

export interface SignatureOptions {
  /** Alapból a tesztkonfiguráció webhook-titka */
  secret?: string;
  /** Az aláírás időbélyege másodpercben (alapból most) */
  timestamp?: number;
}

/** A törzs Stripe-Signature fejléce, ahogy a Stripe küldené. */
export function signatureFor(
  payload: string,
  { secret, timestamp }: SignatureOptions = {},
): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secret ?? TEST_ENV.STRIPE_WEBHOOK_SECRET,
    timestamp,
  });
}

/** Nyers webhook-kérés a megadott törzzsel és (ha van) aláírással. */
export function postWebhook(
  app: Express,
  payload: string,
  signature?: string,
  contentType = 'application/json',
) {
  const call = request(app).post(WEBHOOK_PATH).set('Content-Type', contentType);
  if (signature !== undefined) call.set('Stripe-Signature', signature);
  return call.send(payload);
}

/** Aláírt esemény küldése a webhookra. */
export function sendEvent(app: Express, event: unknown, options: SignatureOptions = {}) {
  const payload = JSON.stringify(event);
  return postWebhook(app, payload, signatureFor(payload, options));
}
