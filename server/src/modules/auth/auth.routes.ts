// Az /api/auth útvonalai (fejlesztési terv, 5.1): regisztráció, bejelentkezés, kijelentkezés és a
// bejelentkezett felhasználó adatai.
import { type Request, Router, type RequestHandler } from 'express';

import type { Env } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { noStore } from '../../middleware/noStore.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { createAuthController } from './auth.controller.js';
import { createAuthService } from './auth.service.js';

export interface AuthRouterDependencies {
  env: Env;
  prisma: PrismaClient;
  /** A munkamenet betöltése a /me végponthoz: névtelenül is továbbenged (middleware/auth.ts) */
  loadSession: RequestHandler;
}

/** Az e-mail-címek szabvány szerinti felső korlátja – a korlát kulcsa sem lehet ennél hosszabb */
const MAX_EMAIL_LENGTH = 254;

/**
 * A belépési kérésben megadott e-mail-cím a séma szerinti alakban (szóközök nélkül, kisbetűsen):
 * az „ ANNA@x.hu” és az „anna@x.hu” ugyanaz a fiók. Ha nincs, vagy nem szöveg: üres.
 */
function loginEmailOf(req: Request): string {
  const email: unknown = (req.body as { email?: unknown } | null | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : '';
}

export function createAuthRouter({ env, prisma, loadSession }: AuthRouterDependencies): Router {
  const controller = createAuthController(createAuthService(prisma), env);
  // Az általános /api korláton felül: a jelszó-próbálgatás és a tömeges regisztráció lassítására a
  // két végpont együtt csak ennyi kérést fogad egy IP-címről egy időablakban
  const authLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    message: 'Túl sok próbálkozás – próbáld újra később',
  });
  // Fiókonként (a megadott e-mail-címre) is (L30): a sok IP-címről elosztott jelszó-próbálgatás
  // ellen. Csak a sikertelen belépés számít; a nem létező címre ugyanúgy, így a 429-ből sem derül ki,
  // van-e ilyen fiók. A korlát a jelszó-összevetés (bcrypt) előtt áll, így processzoridőt sem visz.
  // Ára: egy támadó a fiók gazdáját is kizárhatja az időablak végéig (OWASP: időzített zárolás).
  const accountLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.LOGIN_ACCOUNT_RATE_LIMIT_MAX,
    message: 'Túl sok sikertelen belépés ehhez a fiókhoz – próbáld újra később',
    keyGenerator: (req) => `login:${loginEmailOf(req)}`,
    // A hibás törzset (nincs e-mail-cím) a séma utasítja el – az nem fiókhoz kötött próbálkozás
    skip: (req) => loginEmailOf(req) === '',
    skipSuccessfulRequests: true,
  });

  const router = Router();
  // A válaszok személyes adatot tartalmaznak: se a böngésző, se egy köztes proxy ne tárolja őket
  router.use(noStore);
  router.post('/register', authLimiter, controller.register);
  router.post('/login', authLimiter, accountLimiter, controller.login);
  router.post('/logout', controller.logout);
  // Bejelentkezés nélkül is 200 (user: null): a kliens induló ellenőrzése nem hiba (L26)
  router.get('/me', loadSession, controller.me);
  return router;
}
