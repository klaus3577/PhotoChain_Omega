// Az /api/verify útvonalai (fejlesztési terv, 5.1): nyilvános hitelesség-ellenőrzés fájl, illetve
// SHA-256 hash alapján – bejelentkezés nélkül, ezért szigorú korlátokkal.
// Forrás: express-rate-limit README (keyGenerator, ipKeyGenerator),
// https://github.com/express-rate-limit/express-rate-limit (adaptálva)
import { type Request, Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import type { Logger } from 'pino';

import type { Env } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createBodyDeadline } from '../../middleware/bodyDeadline.js';
import { createConcurrencyLimit } from '../../middleware/concurrency.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { rejectCrossSiteReads } from '../../middleware/sameOrigin.js';
import { createImageUpload } from '../../middleware/upload.js';
import type { BlockchainService } from '../../services/blockchain.service.js';
import type { ImageWork } from '../../services/imageWork.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import { createVerificationController } from './verification.controller.js';
import { createVerificationService } from './verification.service.js';

export interface VerificationRouterDependencies {
  env: Pick<
    Env,
    | 'CHAIN_ID'
    | 'DHASH_THRESHOLD'
    | 'RATE_LIMIT_WINDOW_MS'
    | 'UPLOAD_MAX_BYTES'
    | 'VERIFY_BODY_TIMEOUT_MS'
    | 'VERIFY_CHAIN_READ_LIMIT'
    | 'VERIFY_MAX_CONCURRENT'
    | 'VERIFY_RATE_LIMIT_MAX'
  >;
  logger: Logger;
  prisma: PrismaClient;
  storage: Pick<StorageService, 'publicUrl'>;
  blockchain: Pick<BlockchainService, 'getRecord'>;
  /** A közös képfeldolgozási sor (app.ts, L32) */
  imageWork: ImageWork;
}

/** A bontott kapcsolatú (már ismeretlen IP-című) kérések közös kulcsa */
const UNKNOWN_CLIENT_KEY = 'ismeretlen';

/**
 * Az egyidejűségi korlát kulcsa: a kliens IP-címe. Az IPv6-címeket /56-os alhálózatonként vonjuk
 * össze – különben egy kliens a címei váltogatásával megkerülhetné a korlátot.
 */
export const clientKeyOf = (req: Pick<Request, 'ip'>): string =>
  ipKeyGenerator(req.ip ?? UNKNOWN_CLIENT_KEY);

export function createVerificationRouter({
  env,
  logger,
  prisma,
  storage,
  blockchain,
  imageWork,
}: VerificationRouterDependencies): Router {
  const controller = createVerificationController(
    createVerificationService({
      prisma,
      storage,
      logger,
      blockchain,
      dHashThreshold: env.DHASH_THRESHOLD,
      chainId: env.CHAIN_ID,
      // Minden kliensre együtt: csak a ténylegesen láncot olvasó kérések számítanak (a szolgáltatás
      // számolja) – a hibás kérésekkel nem égethető el a közös keret
      chainReadLimit: { limit: env.VERIFY_CHAIN_READ_LIMIT, windowMs: env.RATE_LIMIT_WINDOW_MS },
      imageWork,
    }),
  );
  // IP-címenként: a fájl- és a hash-alapú ellenőrzés együtt számít
  const perClientLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.VERIFY_RATE_LIMIT_MAX,
    message: 'Túl sok ellenőrzés – próbáld újra később',
  });
  // A fájlok a memóriában vannak: egyszerre legfeljebb VERIFY_MAX_CONCURRENT, kliensenként egy
  const concurrencyLimit = createConcurrencyLimit({
    total: env.VERIFY_MAX_CONCURRENT,
    perKey: 1,
    keyOf: clientKeyOf,
    messages: {
      perKey: 'Egyszerre csak egy ellenőrzésed lehet folyamatban – várd meg, amíg elkészül',
      total: 'A szerver most túl sok ellenőrzést fogad – próbáld újra kicsit később',
    },
  });

  const router = Router();
  // A sorrend számít: a törzs határideje már a korlátok előtt indul (az elutasított kérés törzsének
  // kiürítését is korlátozza); utána a korlátok és a lánc olvashatósága – addig a szerver a fájlt be
  // sem olvassa –, majd a fájl fogadása (a memóriába), végül az ellenőrzés. A feltöltés feldolgozási
  // sorát nem használja, így a névtelen ellenőrzések nem tartják fel a feltöltéseket.
  router.post(
    '/',
    createBodyDeadline(env.VERIFY_BODY_TIMEOUT_MS),
    perClientLimiter,
    controller.ensureChainReadable,
    concurrencyLimit,
    createImageUpload(env.UPLOAD_MAX_BYTES),
    controller.verifyFile,
  );
  // A GET-et más webhely sem indíthatja (pl. <img> elemmel) – még a keretek fogyasztása előtt
  router.get('/:sha256', rejectCrossSiteReads, perClientLimiter, controller.verifyHash);
  return router;
}
