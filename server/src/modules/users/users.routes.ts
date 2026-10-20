// Az /api/users és az /api/me útvonalai (fejlesztési terv, 5.1): a publikus fotósprofil, illetve a
// bejelentkezett felhasználó saját profilja és képei.
import { Router, type RequestHandler } from 'express';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { noStore } from '../../middleware/noStore.js';
import type { PhotoCatalog } from '../photos/photos.catalog.js';
import { createUsersController, type UsersController } from './users.controller.js';
import { createUsersService } from './users.service.js';

export interface UsersRouterDependencies {
  prisma: PrismaClient;
  /** A képek közös katalógusa (app.ts) – a saját képek listájához */
  photoCatalog: Pick<PhotoCatalog, 'listOwn'>;
  requireAuth: RequestHandler;
}

function createController({ prisma, photoCatalog }: UsersRouterDependencies): UsersController {
  return createUsersController(createUsersService(prisma), photoCatalog);
}

/** /api/users: a publikus fotósprofil – bejelentkezés nélkül is elérhető. */
export function createUsersRouter(dependencies: UsersRouterDependencies): Router {
  const controller = createController(dependencies);
  const router = Router();
  router.get('/:id', controller.getProfile);
  return router;
}

/** /api/me: a bejelentkezett felhasználó saját profilja és képei. */
export function createMeRouter(dependencies: UsersRouterDependencies): Router {
  const controller = createController(dependencies);
  const router = Router();
  // Minden válasz személyes adat: se a böngésző, se egy köztes proxy ne tárolja őket
  router.use(noStore, dependencies.requireAuth);
  router.patch('/', controller.updateProfile);
  router.get('/photos', controller.listOwnPhotos);
  return router;
}
