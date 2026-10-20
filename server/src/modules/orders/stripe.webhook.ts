// A Stripe-webhook (terv D9, L14): a fizetés tényét a Stripe aláírt eseménye igazolja.
// - Az aláírás a kérés pontos bájtsorozatára szól, ezért ez az útvonal a nyers törzset kapja
//   (express.raw), és az app.ts-ben a JSON-feldolgozó ELŐTT áll – a feldolgozott, majd újra
//   szöveggé alakított JSON aláírása már nem egyezne.
// - Hiányzó vagy hibás aláírásnál, illetve hibás törzsnél 400 – feldolgozás nélkül; a Stripe-
//   könyvtár hibaüzenete se a válaszba, se a naplóba nem kerül. Az 5 percnél régebbi időbélyegű
//   aláírás sem érvényes (a könyvtár alapértelmezett tűréshatára – a visszajátszás ellen).
// - Szerver–szerver hívás: süti és Sec-Fetch-Site fejléc nélkül érkezik, így a same-origin védelem
//   átengedi; az általános (IP-címenkénti) sebességkorlát rá is vonatkozik – 429-nél a Stripe
//   később újraküldi az eseményt.
// - A feldolgozás idempotens (orders.service.ts), az ismeretlen eseménytípusra is 200 a válasz.
// Forrás: Stripe – Receive Stripe events in your webhook endpoint (Verify webhook signatures with
// official libraries; Preventing replay attacks; Handle duplicate events; Exempt webhook route from
// CSRF protection), https://docs.stripe.com/webhooks (a dokumentáció mintakódját követi:
// express.raw({ type: 'application/json' }) és stripe.webhooks.constructEvent – adaptálva)
import express, { Router } from 'express';
import type { Logger } from 'pino';
import Stripe from 'stripe';
import { z } from 'zod';

import { AppError } from '../../lib/errors.js';
import type { OrdersService } from './orders.service.js';

/** A nyers törzs felső korlátja: a Checkout-események néhány kilobájtosak */
const WEBHOOK_BODY_LIMIT = '256kb';

/**
 * Az esemény azon része, amelyre a feldolgozás épít; a munkamenet-objektumot az orders.service
 * ellenőrzi. A livemode hiányozhat vagy bármi lehet: csak a pontosan false (teszt mód) jár hatással.
 */
const eventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  livemode: z.unknown().optional(),
  data: z.object({ object: z.unknown() }),
});
type StripeEventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export interface StripeWebhookDependencies {
  /** A webhook-aláírás titka (STRIPE_WEBHOOK_SECRET) */
  webhookSecret: string;
  orders: Pick<OrdersService, 'handleEvent'>;
  logger: Logger;
}

const invalidWebhook = (): AppError =>
  new AppError(400, 'INVALID_WEBHOOK', 'Érvénytelen webhook-kérés');

export function createStripeWebhookRouter({
  webhookSecret,
  orders,
  logger,
}: StripeWebhookDependencies): Router {
  const rejected = (reason: 'aláírás' | 'törzs'): AppError => {
    logger.warn({ reason }, 'Érvénytelen Stripe-webhook – feldolgozás nélkül elutasítva');
    return invalidWebhook();
  };

  /** Az aláírással ellenőrzött esemény; hibás aláírásnál vagy törzsnél 400-as hibát dob. */
  function verifiedEvent(body: unknown, signature: string | undefined): StripeEventEnvelope {
    // A nem JSON típusú kérés törzsét az express.raw nem olvassa be
    if (!Buffer.isBuffer(body) || signature === undefined) throw invalidWebhook();
    let event: unknown;
    try {
      event = Stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      // Csak az ok fajtája kerül a naplóba (a könyvtár üzenete az aláírás részleteit is tartalmazza)
      throw rejected(
        error instanceof Stripe.errors.StripeSignatureVerificationError ? 'aláírás' : 'törzs',
      );
    }
    // A könyvtár csak az aláírást ellenőrzi, az alakot nem: a hitelesen aláírt „null” is átjutna
    const envelope = eventEnvelopeSchema.safeParse(event);
    if (!envelope.success) throw rejected('törzs');
    return envelope.data;
  }

  const router = Router();
  router.post(
    '/',
    express.raw({ type: 'application/json', limit: WEBHOOK_BODY_LIMIT }),
    async (req, res) => {
      const event = verifiedEvent(req.body, req.get('Stripe-Signature'));
      // A platform csak teszt módban fut (sk_test_ kulcs): éles – vagy mód jelzése nélküli –
      // eseménynek nem lehet hatása (zárt alapállás)
      if (event.livemode !== false) {
        logger.warn(
          { eventId: event.id, type: event.type },
          'Nem teszt módú Stripe-esemény – figyelmen kívül hagyva',
        );
      } else {
        await orders.handleEvent(event.type, event.data.object);
      }
      res.json({ received: true });
    },
  );
  return router;
}
