// Az értékelések HTTP-rétege: a kép értékeléseinek listája (nyilvános, opcionális bejelentkezéssel),
// az értékelés írása és törlése (bejelentkezéssel). Express 5-ben a req.query és a req.params csak
// olvasható: a sémával ellenőrzött másolatukkal dolgozunk; hibás értéknél a séma ZodError-t dob,
// ebből a hibakezelő 400-as VALIDATION_ERROR-t készít.
import type { RequestHandler } from 'express';

import { idParamsSchema, paginationQuerySchema } from '../../lib/schemas.js';
import { getSessionUser } from '../../middleware/auth.js';
import { withValidatedBody } from '../../middleware/validate.js';
import { createReviewSchema } from './reviews.schemas.js';
import type { ReviewsService } from './reviews.service.js';

export interface ReviewsController {
  list: RequestHandler;
  create: RequestHandler;
  remove: RequestHandler;
}

export function createReviewsController(reviews: ReviewsService): ReviewsController {
  return {
    // A tulajdonos és az admin a nem nyilvános kép értékeléseit is látja – a nekik szóló választ
    // semmilyen gyorsítótár nem tárolhatja, és a válasz a munkamenet-sütitől is függ
    list: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      const pagination = paginationQuerySchema.parse(req.query);
      const viewer = req.user ?? null;
      res.vary('Cookie');
      if (viewer) res.set('Cache-Control', 'no-store');
      const { reviews: items, rating, meta } = await reviews.list(id, viewer, pagination);
      res.json({ data: { reviews: items, rating }, meta });
    },

    create: withValidatedBody(createReviewSchema, async (input, req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      const review = await reviews.create(id, getSessionUser(req), input);
      res.status(201).json({ data: { review } });
    }),

    remove: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      await reviews.remove(id, getSessionUser(req));
      res.status(204).end();
    },
  };
}
