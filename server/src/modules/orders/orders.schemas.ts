// A rendelések bemeneti sémái (Zod): a fizetés indításának JSON-törzse és a Stripe-munkamenet
// azonosítója útvonal-paraméterként. A törzsben csak a kép azonosítója szerepelhet – az összeg a
// kép checkoutkori ára, a visszatérési URL-ek a szerver konfigurációjából jönnek –, minden más
// mező hiba (nem csendben eldobott adat).
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { z } from 'zod';

import { strictBody } from '../../lib/schemas.js';

/**
 * A Stripe teszt módú Checkout-munkamenetének azonosítója (cs_test_…, betűk és számjegyek); az
 * orders.stripeSessionId oszlopba legfeljebb 255 karakter fér.
 */
const SESSION_ID_PATTERN = /^cs_test_[A-Za-z0-9]{1,247}$/;

/** POST /api/orders/checkout */
export const checkoutBodySchema = strictBody({
  photoId: z.uuid({
    error: (issue) => (issue.input === undefined ? 'kötelező' : 'érvénytelen azonosító'),
  }),
});

/** GET /api/orders/by-session/:sessionId */
export const sessionParamsSchema = z.object({
  sessionId: z
    .string({ error: 'érvénytelen munkamenet-azonosító' })
    .regex(SESSION_ID_PATTERN, { error: 'érvénytelen munkamenet-azonosító' }),
});
