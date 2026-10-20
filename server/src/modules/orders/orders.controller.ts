// A rendelések végpontjainak HTTP-rétege: a fizetés indítása, a rendelés állapota a munkamenet
// azonosítója alapján és a vásárlásaim lista. Express 5-ben a req.query és a req.params csak
// olvasható: a sémával ellenőrzött másolatukkal dolgozunk; hibás bemenetnél a séma ZodError-t dob,
// ebből a hibakezelő 400-as VALIDATION_ERROR-t készít.
import type { RequestHandler } from 'express';

import { paginationQuerySchema } from '../../lib/schemas.js';
import { getSessionUser } from '../../middleware/auth.js';
import { withValidatedBody } from '../../middleware/validate.js';
import { checkoutBodySchema, sessionParamsSchema } from './orders.schemas.js';
import type { OrdersService } from './orders.service.js';

export interface OrdersController {
  checkout: RequestHandler;
  getBySession: RequestHandler;
  listPurchases: RequestHandler;
}

export function createOrdersController(orders: OrdersService): OrdersController {
  return {
    // Új rendelésnél 201, a meglévő (nyitott) munkamenet visszaadásakor 200
    checkout: withValidatedBody(checkoutBodySchema, async ({ photoId }, req, res) => {
      const { orderId, checkoutUrl, created } = await orders.checkout(getSessionUser(req), photoId);
      res.status(created ? 201 : 200).json({ data: { orderId, checkoutUrl } });
    }),

    getBySession: async (req, res) => {
      const { sessionId } = sessionParamsSchema.parse(req.params);
      const order = await orders.getBySession(getSessionUser(req).id, sessionId);
      res.json({ data: { order } });
    },

    listPurchases: async (req, res) => {
      const pagination = paginationQuerySchema.parse(req.query);
      const { orders: page, meta } = await orders.listPurchases(getSessionUser(req).id, pagination);
      res.json({ data: { orders: page }, meta });
    },
  };
}
