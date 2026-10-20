// A rendelések útvonalai (fejlesztési terv, 5.1): /api/orders (a fizetés indítása és a rendelés
// állapota) és /api/me/purchases (vásárlásaim). Mindegyik bejelentkezéshez kötött, és a válaszaik
// személyes adatok: se a böngésző, se egy köztes proxy nem tárolhatja őket.
import { Router, type RequestHandler } from 'express';

import type { Env } from '../../config/env.js';
import { getSessionUser } from '../../middleware/auth.js';
import { noStore } from '../../middleware/noStore.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { createOrdersController } from './orders.controller.js';
import type { OrdersService } from './orders.service.js';

export interface OrdersRouterDependencies {
  env: Pick<Env, 'RATE_LIMIT_WINDOW_MS' | 'CHECKOUT_RATE_LIMIT_MAX'>;
  orders: OrdersService;
  requireAuth: RequestHandler;
}

/** /api/orders: a fizetés indítása és a rendelés állapota. */
export function createOrdersRouter({ env, orders, requireAuth }: OrdersRouterDependencies): Router {
  const controller = createOrdersController(orders);
  // Fizetésindítás felhasználónként: minden kísérlet a Stripe-ot is hívhatja
  const checkoutRateLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.CHECKOUT_RATE_LIMIT_MAX,
    message: 'Túl sok fizetésindítás – próbáld újra később',
    keyGenerator: (req) => getSessionUser(req).id,
  });

  const router = Router();
  router.use(noStore, requireAuth);
  router.post('/checkout', checkoutRateLimiter, controller.checkout);
  router.get('/by-session/:sessionId', controller.getBySession);
  return router;
}

/** /api/me/purchases: a bejelentkezett felhasználó kifizetett rendelései. */
export function createPurchasesRouter({
  orders,
  requireAuth,
}: Pick<OrdersRouterDependencies, 'orders' | 'requireAuth'>): Router {
  const controller = createOrdersController(orders);
  const router = Router();
  router.get('/', noStore, requireAuth, controller.listPurchases);
  return router;
}
