// Az /api/admin útvonalai (fejlesztési terv, 5.1, L16). Minden útvonal csak bejelentkezett, nem
// letiltott adminnak érhető el: névtelenül 401, más felhasználónak 403. A válaszok személyes adatot
// tartalmaznak: se a böngésző, se egy köztes proxy nem tárolhatja őket (a hibaválaszt sem). A
// módosító kérést idegen oldal nem indíthatja (app.ts: rejectCrossSiteRequests).
import { Router, type RequestHandler } from 'express';
import type { Logger } from 'pino';

import type { Env } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { type AuthMiddleware, getSessionUser } from '../../middleware/auth.js';
import { noStore } from '../../middleware/noStore.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import type { ImageWork } from '../../services/imageWork.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { PhotoCatalog } from '../photos/photos.catalog.js';
import type { PhotoRegistration } from '../photos/photos.registration.js';
import { createPhotoRestore } from '../photos/photos.restore.js';
import { createAdminController } from './admin.controller.js';
import { createAdminPhotos } from './admin.photos.js';
import { platformStats } from './admin.stats.js';
import { createAdminUsers } from './admin.users.js';

export interface AdminRouterDependencies {
  env: Pick<Env, 'RATE_LIMIT_WINDOW_MS' | 'CHAIN_RETRY_RATE_LIMIT_MAX'>;
  logger: Logger;
  prisma: PrismaClient;
  storage: Pick<StorageService, 'publicUrl' | 'read' | 'save' | 'delete'>;
  /** A képek közös katalógusa (app.ts) – az elrejtés ugyanaz, mint a tulajdonosé */
  photoCatalog: Pick<PhotoCatalog, 'hide'>;
  photoRegistration: Pick<PhotoRegistration, 'retryRegistration'>;
  /** A letiltott felhasználó nyitott fizetéseinek lezárása */
  checkouts: Pick<OrdersService, 'closeOpenCheckouts'>;
  /** A közös képfeldolgozási sor (app.ts, L32) – a visszaállítás ezen készíti újra az előnézetet */
  imageWork: ImageWork;
  requireAuth: RequestHandler;
  requireRole: AuthMiddleware['requireRole'];
}

export function createAdminRouter({
  env,
  logger,
  prisma,
  storage,
  photoCatalog,
  photoRegistration,
  checkouts,
  imageWork,
  requireAuth,
  requireRole,
}: AdminRouterDependencies): Router {
  const controller = createAdminController(
    createAdminUsers({ prisma, logger, checkouts }),
    createAdminPhotos({
      prisma,
      storage,
      logger,
      catalog: photoCatalog,
      restore: createPhotoRestore({ prisma, storage, logger, imageWork }),
      registration: photoRegistration,
    }),
    () => platformStats(prisma),
  );
  // Minden újrapróbálás tranzakció, gázdíjba kerül: adminonként korlátozott (a sikertelen kérés is
  // számít)
  const retryRateLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.CHAIN_RETRY_RATE_LIMIT_MAX,
    message: 'Túl sok újrapróbálás – próbáld újra később',
    keyGenerator: (req) => getSessionUser(req).id,
  });

  const router = Router();
  router.use(noStore, requireAuth, requireRole('ADMIN'));
  router.get('/users', controller.listUsers);
  router.patch('/users/:id', controller.updateUser);
  router.get('/photos', controller.listPhotos);
  router.patch('/photos/:id', controller.updatePhoto);
  router.post('/photos/:id/retry-registration', retryRateLimiter, controller.retryRegistration);
  router.get('/stats', controller.stats);
  return router;
}
