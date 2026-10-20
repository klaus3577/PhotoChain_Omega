// A rendelések bemeneti sémái: a fizetés indításának JSON-törzse (csak a kép azonosítója – az
// összeg és a visszatérési URL-ek a szerveré) és a munkamenet-azonosító útvonal-paraméter.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { checkoutBodySchema, sessionParamsSchema } from './orders.schemas.js';

const PHOTO_ID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** A hibák mezőnként (a gyökérszintű hiba kulcsa üres szöveg). */
function issuesOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
  );
}

describe('checkoutBodySchema', () => {
  it('egyetlen mezője a megvásárolandó kép azonosítója', () => {
    expect(checkoutBodySchema.parse({ photoId: PHOTO_ID })).toEqual({ photoId: PHOTO_ID });
  });

  it('hiányzó vagy hibás azonosító', () => {
    expect(issuesOf(checkoutBodySchema, {})).toEqual({ photoId: 'kötelező' });
    for (const photoId of ['abc', 5, null, [PHOTO_ID], `${PHOTO_ID} `]) {
      expect(issuesOf(checkoutBodySchema, { photoId })).toEqual({
        photoId: 'érvénytelen azonosító',
      });
    }
  });

  it('az összeg és a visszatérési URL-ek nem a klienstől jönnek: az ismeretlen mező hiba', () => {
    expect(issuesOf(checkoutBodySchema, { photoId: PHOTO_ID, amountHuf: 1 })).toEqual({
      '': 'ismeretlen mező: amountHuf',
    });
    expect(
      issuesOf(checkoutBodySchema, {
        photoId: PHOTO_ID,
        successUrl: 'https://tamado.example/siker',
        cancelUrl: 'https://tamado.example',
      }),
    ).toEqual({ '': 'ismeretlen mező: successUrl, cancelUrl' });
  });

  it('a nem objektum törzs hiba', () => {
    for (const body of [null, [], 'szöveg', 5, true]) {
      expect(issuesOf(checkoutBodySchema, body)).toEqual({ '': 'JSON-objektum kell' });
    }
  });
});

describe('sessionParamsSchema', () => {
  it('a Stripe teszt módú Checkout-munkamenetének azonosítója (legfeljebb 255 karakter)', () => {
    for (const sessionId of ['cs_test_a1B2c3D4', `cs_test_${'a'.repeat(247)}`]) {
      expect(sessionParamsSchema.parse({ sessionId })).toEqual({ sessionId });
    }
  });

  it('más alakú azonosító hiba (az adatbázisig sem jut el)', () => {
    for (const sessionId of [
      'abc',
      'cs_test_',
      'cs_live_a1B2c3D4',
      'pi_test_a1B2c3D4',
      'cs_test_a-b',
      'cs_test_a b',
      `cs_test_${'a'.repeat(248)}`,
    ]) {
      expect(issuesOf(sessionParamsSchema, { sessionId })).toEqual({
        sessionId: 'érvénytelen munkamenet-azonosító',
      });
    }
  });
});
