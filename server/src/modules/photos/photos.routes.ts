// Az /api/photos útvonalai (fejlesztési terv, 5.1): a feltöltés (L10), valamint a galéria, az
// adatlap, a módosítás és az elrejtés (L13), az eredeti védett letöltése (L14).
import { Router, type RequestHandler } from 'express';
import type { Logger } from 'pino';

import type { Env } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { idParamsSchema } from '../../lib/schemas.js';
import { getSessionUser } from '../../middleware/auth.js';
import { createBodyDeadline } from '../../middleware/bodyDeadline.js';
import {
  type ConcurrencyLimitMessages,
  createConcurrencyLimit,
} from '../../middleware/concurrency.js';
import { htmlErrorPage } from '../../middleware/errorHandler.js';
import { noStore } from '../../middleware/noStore.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { rejectCrossSiteReads } from '../../middleware/sameOrigin.js';
import { createImageUpload } from '../../middleware/upload.js';
import type { BlockchainService } from '../../services/blockchain.service.js';
import type { ImageWork } from '../../services/imageWork.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import type { PhotoCatalog } from './photos.catalog.js';
import { createPhotosController } from './photos.controller.js';
import { createPhotoDownloads } from './photos.download.js';
import { createDailyUploadQuota } from './photos.quota.js';
import type { PhotoRegistration } from './photos.registration.js';
import { createPhotosService } from './photos.service.js';

/** Az egyszerre folyamatban lévő letöltések korlátja: felhasználónként és összesen */
const MAX_DOWNLOADS_PER_USER = 2;
const MAX_CONCURRENT_DOWNLOADS = 32;
const DOWNLOAD_LIMIT_MESSAGES: ConcurrencyLimitMessages = {
  perKey: `Egyszerre legfeljebb ${MAX_DOWNLOADS_PER_USER} letöltésed lehet folyamatban`,
  total: 'A szerver most túl sok letöltést szolgál ki – próbáld újra kicsit később',
};

export interface PhotosRouterDependencies {
  env: Pick<
    Env,
    | 'CHAIN_ID'
    | 'DHASH_THRESHOLD'
    | 'RATE_LIMIT_WINDOW_MS'
    | 'UPLOAD_BODY_TIMEOUT_MS'
    | 'UPLOAD_DAILY_LIMIT'
    | 'UPLOAD_GLOBAL_DAILY_LIMIT'
    | 'UPLOAD_MAX_BYTES'
    | 'UPLOAD_MAX_CONCURRENT'
    | 'UPLOAD_RATE_LIMIT_MAX'
  >;
  logger: Logger;
  prisma: PrismaClient;
  storage: StorageService;
  blockchain: Pick<BlockchainService, 'isRegistered'>;
  photoRegistration: Pick<PhotoRegistration, 'schedule'>;
  /** A közös képfeldolgozási sor (app.ts, L32) */
  imageWork: ImageWork;
  /** A képek közös katalógusa (app.ts): galéria, adatlap, módosítás, elrejtés */
  photoCatalog: PhotoCatalog;
  /** A PhotoRegistry címe ezen a hálózaton (app.ts) – a feltöltés adatlap alakú válaszához */
  contractAddress: string;
  requireAuth: RequestHandler;
  /** A nyilvános adatlaphoz: a bejelentkezett felhasználót azonosítja, de nem követeli meg */
  optionalAuth: RequestHandler;
}

export function createPhotosRouter({
  env,
  logger,
  prisma,
  storage,
  blockchain,
  photoRegistration,
  photoCatalog,
  contractAddress,
  imageWork,
  requireAuth,
  optionalAuth,
}: PhotosRouterDependencies): Router {
  const controller = createPhotosController(
    createPhotosService({
      prisma,
      storage,
      logger,
      dHashThreshold: env.DHASH_THRESHOLD,
      chainId: env.CHAIN_ID,
      contractAddress,
      blockchain,
      registration: photoRegistration,
      imageWork,
    }),
    photoCatalog,
    createPhotoDownloads({ prisma, storage, logger }),
  );
  // Feltöltési kísérletek felhasználónként (a sikertelenek is számítanak)
  const uploadRateLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.UPLOAD_RATE_LIMIT_MAX,
    message: 'Túl sok feltöltés – próbáld újra később',
    keyGenerator: (req) => getSessionUser(req).id,
  });

  // Egyszerre összesen UPLOAD_MAX_CONCURRENT, felhasználónként egy feltöltés lehet folyamatban
  const concurrencyLimit = createConcurrencyLimit({
    total: env.UPLOAD_MAX_CONCURRENT,
    perKey: 1,
    keyOf: (req) => getSessionUser(req).id,
  });

  // A letöltés megnyitott fájlt és kapcsolatot foglal (egy lassan olvasó kliens sokáig): egyszerre
  // összesen MAX_CONCURRENT_DOWNLOADS, felhasználónként MAX_DOWNLOADS_PER_USER lehet folyamatban
  const downloadLimit = createConcurrencyLimit({
    total: MAX_CONCURRENT_DOWNLOADS,
    perKey: MAX_DOWNLOADS_PER_USER,
    keyOf: (req) => getSessionUser(req).id,
    messages: DOWNLOAD_LIMIT_MESSAGES,
  });

  // A letöltés hibaoldalának „Vissza” hivatkozása a kép adatlapjára mutat – hibás azonosítónál a
  // galériára
  const downloadErrorPage = htmlErrorPage((req) => {
    const id = idParamsSchema.safeParse(req.params);
    return {
      title: 'A letöltés nem sikerült',
      backHref: id.success ? `/photos/${id.data.id.toLowerCase()}` : '/',
    };
  });

  // A napi keret fiókonként és összesen (L30): minden feltöltés egy, a platform által fizetett
  // lánc-tranzakció
  const dailyQuota = createDailyUploadQuota(prisma, {
    perUser: env.UPLOAD_DAILY_LIMIT,
    total: env.UPLOAD_GLOBAL_DAILY_LIMIT,
  });

  const router = Router();
  // A sorrend számít: a törzs határideje már a korlátok előtt indul (az elutasított kérés törzsének
  // kiürítését is korlátozza, L30); utána a bejelentkezés és a korlátok ellenőrzése – addig a szerver
  // a fájlt be sem olvassa –, majd a fájl fogadása (a memóriába), végül a mezők ellenőrzése és a
  // feldolgozás
  router.post(
    '/',
    createBodyDeadline(env.UPLOAD_BODY_TIMEOUT_MS),
    noStore,
    requireAuth,
    uploadRateLimiter,
    concurrencyLimit,
    dailyQuota,
    createImageUpload(env.UPLOAD_MAX_BYTES),
    controller.create,
  );
  // A keresés költséges: idegen oldal a látogatói böngészőjéből sem indíthatja (mint a /api/verify-t)
  router.get('/', rejectCrossSiteReads, controller.list);
  router.get('/:id', optionalAuth, controller.get);
  // A bejelentkezéshez kötött válaszokat se a böngésző, se egy köztes proxy ne tárolja
  router.patch('/:id', noStore, requireAuth, controller.update);
  router.delete('/:id', noStore, requireAuth, controller.hide);
  // Az eredeti fájl csak a tulajdonosnak és a vásárlónak (L14); a böngésző se tárolja. A letöltés egy
  // hivatkozásra kattintva indul: a hibája (pl. lejárt munkamenet, levett kép, túl sok letöltés)
  // olvasható oldalként jelenik meg, nem nyers JSON-ként
  router.get(
    '/:id/download',
    noStore,
    downloadErrorPage,
    requireAuth,
    downloadLimit,
    controller.download,
  );
  return router;
}
