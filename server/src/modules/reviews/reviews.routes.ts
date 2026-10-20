// Az értékelések útvonalai (fejlesztési terv, 5.1): a kép értékelései az /api/photos/:id/reviews alatt
// (lista: nyilvános; írás: a vásárló), a törlés az /api/reviews/:id alatt (szerző, admin).
// Forrás: Express 5 API – express.Router (mergeParams), https://expressjs.com/en/5x/api.html#express.router
import { Router, type RequestHandler } from 'express';

import { noStore } from '../../middleware/noStore.js';
import { createReviewsController } from './reviews.controller.js';
import type { ReviewsService } from './reviews.service.js';

export interface ReviewsRouterDependencies {
  reviews: ReviewsService;
  requireAuth: RequestHandler;
  /** A listához: a bejelentkezett felhasználót azonosítja, de nem követeli meg */
  optionalAuth: RequestHandler;
}

/** /api/photos/:id/reviews – a kép azonosítója a csatolási útvonalból jön (mergeParams). */
export function createPhotoReviewsRouter({
  reviews,
  requireAuth,
  optionalAuth,
}: ReviewsRouterDependencies): Router {
  const controller = createReviewsController(reviews);
  const router = Router({ mergeParams: true });
  router.get('/', optionalAuth, controller.list);
  // A bejelentkezéshez kötött válaszokat se a böngésző, se egy köztes proxy ne tárolja
  router.post('/', noStore, requireAuth, controller.create);
  return router;
}

/** /api/reviews – az értékelés törlése. */
export function createReviewsRouter({
  reviews,
  requireAuth,
}: Pick<ReviewsRouterDependencies, 'reviews' | 'requireAuth'>): Router {
  const controller = createReviewsController(reviews);
  const router = Router();
  router.delete('/:id', noStore, requireAuth, controller.remove);
  return router;
}
