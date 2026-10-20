// Az admin végpontok HTTP-rétege (terv 5.1, L16): a felhasználók listája és tiltása, a képek listája,
// elrejtése és visszaállítása, a lánc-regisztráció újrapróbálása és a statisztika. Express 5-ben a
// req.query és a req.params csak olvasható: a sémával ellenőrzött másolatukkal dolgozunk; hibás
// értéknél a séma ZodError-t dob, ebből a hibakezelő 400-as VALIDATION_ERROR-t készít.
import type { RequestHandler } from 'express';

import { idParamsSchema } from '../../lib/schemas.js';
import { getSessionUser } from '../../middleware/auth.js';
import { withValidatedBody } from '../../middleware/validate.js';
import type { AdminPhotos } from './admin.photos.js';
import {
  listAdminPhotosQuerySchema,
  listUsersQuerySchema,
  updateAdminPhotoSchema,
  updateUserSchema,
} from './admin.schemas.js';
import type { PlatformStats } from './admin.stats.js';
import type { AdminUsers } from './admin.users.js';

export interface AdminController {
  listUsers: RequestHandler;
  updateUser: RequestHandler;
  listPhotos: RequestHandler;
  updatePhoto: RequestHandler;
  retryRegistration: RequestHandler;
  stats: RequestHandler;
}

export function createAdminController(
  users: AdminUsers,
  photos: AdminPhotos,
  stats: () => Promise<PlatformStats>,
): AdminController {
  return {
    listUsers: async (req, res) => {
      const page = await users.list(listUsersQuerySchema.parse(req.query));
      res.json({ data: { users: page.users }, meta: page.meta });
    },

    updateUser: withValidatedBody(updateUserSchema, async ({ isBlocked }, req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      res.json({ data: { user: await users.setBlocked(id, getSessionUser(req), isBlocked) } });
    }),

    listPhotos: async (req, res) => {
      const page = await photos.list(listAdminPhotosQuerySchema.parse(req.query));
      res.json({ data: { photos: page.photos }, meta: page.meta });
    },

    updatePhoto: withValidatedBody(updateAdminPhotoSchema, async ({ hidden }, req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      res.json({ data: { photo: await photos.setHidden(id, getSessionUser(req), hidden) } });
    }),

    // 202 Accepted: a regisztráció a háttérben fut – a kép most PENDING_CHAIN, a végeredményt a
    // képek listája (vagy az adatlap) mutatja
    retryRegistration: async (req, res) => {
      const { id } = idParamsSchema.parse(req.params);
      await photos.retryRegistration(id, getSessionUser(req));
      res.status(202).json({ data: { photo: { id, status: 'PENDING_CHAIN' } } });
    },

    stats: async (_req, res) => {
      res.json({ data: { stats: await stats() } });
    },
  };
}
