// Az /api/categories útvonala (fejlesztési terv, 5.1): a kategóriák nyilvános listája.
import { Router } from 'express';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { listCategories } from './categories.service.js';

export interface CategoriesRouterDependencies {
  prisma: PrismaClient;
}

export function createCategoriesRouter({ prisma }: CategoriesRouterDependencies): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json({ data: { categories: await listCategories(prisma) } });
  });
  return router;
}
