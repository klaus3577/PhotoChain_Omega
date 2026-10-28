// Az Express-alkalmazás összeállítása. A futtatástól (server.ts) külön van, így a tesztek a teljes
// alkalmazást port megnyitása nélkül, Supertesttel hívhatják.
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import { type Env, trustedProxyHops } from './config/env.js';
import type { PrismaClient } from './generated/prisma/client.js';
import {
  redactRequestPath,
  requestLogLevel,
  requestLogMessage,
  requestPath,
} from './lib/requestLogging.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createClientAppRouter } from './middleware/clientApp.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createMediaAccess, mediaFileMissing } from './middleware/mediaAccess.js';
import { createMediaRouter, MEDIA_CACHE_CONTROL } from './middleware/mediaProxy.js';
import { createProxyChainProbe } from './middleware/proxyChain.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { rejectCrossSiteRequests } from './middleware/sameOrigin.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createCategoriesRouter } from './modules/categories/categories.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { createOrdersRouter, createPurchasesRouter } from './modules/orders/orders.routes.js';
import { createOrdersService } from './modules/orders/orders.service.js';
import { createStripeWebhookRouter } from './modules/orders/stripe.webhook.js';
import { createPhotoCatalog } from './modules/photos/photos.catalog.js';
import type { PhotoRegistration } from './modules/photos/photos.registration.js';
import { createPhotosRouter } from './modules/photos/photos.routes.js';
import { createPhotoReviewsRouter, createReviewsRouter } from './modules/reviews/reviews.routes.js';
import { createReviewsService } from './modules/reviews/reviews.service.js';
import { createMeRouter, createUsersRouter } from './modules/users/users.routes.js';
import { createVerificationRouter } from './modules/verification/verification.routes.js';
import { type BlockchainService, resolveContractAddress } from './services/blockchain.service.js';
import { createImageWork } from './services/imageWork.js';
import type { PaymentService } from './services/payment.service.js';
import { PUBLIC_URL_PREFIX, type StorageService } from './services/storage/storage.types.js';

export interface AppDependencies {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  storage: StorageService;
  /** A PhotoRegistry okosszerződés elérése (a tesztekben utánzat) */
  blockchain: BlockchainService;
  /** A feltöltött képek háttérben futó lánc-regisztrációja */
  photoRegistration: PhotoRegistration;
  /** A fizetési szolgáltatás (Stripe Checkout; a tesztekben utánzat) */
  payments: PaymentService;
  /** Helyi tárhelynél: az a mappa, amelyet a szerver a /media alatt nyilvánosan kiszolgál. */
  publicUploadsDirectory?: string;
}

/** A JSON-törzs felső korlátja; a képek multipart formában érkeznek (/api/photos), nem JSON-ban. */
const JSON_BODY_LIMIT = '100kb';

export function createApp({
  env,
  logger,
  prisma,
  storage,
  blockchain,
  photoRegistration,
  payments,
  publicUploadsDirectory,
}: AppDependencies): Express {
  const app = express();

  // Élesben egy fordított proxy mögött fut (L32): a kliens IP-címét az X-Forwarded-For fejléc adja,
  // ez kell a sebességkorláthoz. A megbízható ugrások száma beállítható (L31): a proxy nélküli
  // konténerben 0, különben egy hamis fejléccel a korlátok megkerülhetők.
  const proxyHops = trustedProxyHops(env);
  app.set('trust proxy', proxyHops > 0 ? proxyHops : false);
  // A proxylánc hossza egyszer a naplóba (L32) – ebből állítható be a tárhelyen a TRUST_PROXY_HOPS
  app.use(createProxyChainProbe(logger, proxyHops));

  // Kérésnaplózás: kérésenként egy tömör sor, fejlécek nélkül; a gyakori állapotellenőrzést kihagyja
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.method === 'GET' && req.url === '/api/health' },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: redactRequestPath(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, error) => requestLogLevel(res.statusCode, error),
      customSuccessMessage: (req, res, responseTime) =>
        requestLogMessage(req.method, requestPath(req), res.statusCode, responseTime),
      customErrorMessage: (req, res) =>
        requestLogMessage(req.method, requestPath(req), res.statusCode, 0),
    }),
  );
  // Biztonsági HTTP-fejlécek (CSP, nosniff stb.), az X-Powered-By elrejtése. A CSP két ponton tér el
  // az alapértelmezéstől (L31, a kiszolgált kliens miatt): a feltöltendő kép előnézete blob: URL
  // (L21), és az upgrade-insecure-requests csak https alatt kell – a http://localhost-on futó
  // konténerben a böngésző különben https-re írná át a saját kéréseit.
  // Forrás: Helmet dokumentáció (contentSecurityPolicy, directives), https://helmetjs.github.io/
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': new URL(env.APP_BASE_URL).protocol === 'https:' ? [] : null,
        },
      },
    }),
  );
  // A felület nem használ kamerát, mikrofont, helyadatot, böngészős fizetést, USB-t: ezeket az oldal
  // (és egy beágyazott tartalom) se kérhesse – L31, OWASP HTTP Headers Cheat Sheet
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });
  // Az API válaszait a böngésző és egy köztes gyorsítótár csak újraellenőrzéssel használhatja fel
  // (L31, L20); a bejelentkezéshez kötött útvonalak ezt no-store-ra szigorítják (noStore)
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    next();
  });
  // Általános sebességkorlát minden API-végpontra (az auth-végpontoké ennél szigorúbb). Szándékosan
  // a törzs feldolgozása ELŐTT áll: így a hibás vagy túl nagy törzsű kérések is beleszámítanak, és
  // a korlátot túllépő kliens kérésének törzsét a szerver nem értelmezi (JSON, fájl) – legfeljebb
  // beolvassa és eldobja, hogy a 429-es válasz megérkezzen (lásd errorHandler).
  app.use(
    '/api',
    createRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      message: 'Túl sok kérés – próbáld újra később',
      // A tárhely (Render) néhány másodpercenként ellenőrzi az állapotot – ez nem élheti fel a
      // keretet (L32); a végpont adatbázis nélküli, állandó választ ad
      skip: (req) => req.method === 'GET' && req.path === '/health',
    }),
  );
  // Nem a saját oldalunkról indított, módosító kérés (CSRF) elutasítása – a törzs feldolgozása előtt.
  // A JSON-végpontokat a SameSite süti és a JSON-törzs is védi; a multipart feltöltést (L10) egy
  // idegen oldal űrlapja is el tudná küldeni, ezért kell ez az ellenőrzés.
  app.use('/api', rejectCrossSiteRequests);
  // A rendelések (Stripe-fizetés) üzleti logikája: a webhook és a rendelések útvonalai is ezt használják
  const orders = createOrdersService({
    prisma,
    payments,
    storage,
    logger,
    appBaseUrl: env.APP_BASE_URL,
  });
  // A Stripe-webhook aláírása a kérés pontos bájtsorozatára szól: a nyers törzset kapja, ezért a
  // JSON-feldolgozó ELŐTT áll (a JSON-ként feldolgozott törzs aláírása már nem egyezne). A
  // sebességkorlát és a same-origin ellenőrzés után van: a Stripe szerver–szerver hívása
  // Sec-Fetch-Site fejléc nélkül érkezik, így azon átjut.
  app.use(
    '/api/webhooks/stripe',
    createStripeWebhookRouter({ webhookSecret: env.STRIPE_WEBHOOK_SECRET, orders, logger }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  // A védett végpontok közös hitelesítő middleware-e; a későbbi modulok is ezt kapják meg
  const { requireAuth, optionalAuth, loadSession, requireRole, sessionViewer } =
    createAuthMiddleware({ prisma, jwtSecret: env.JWT_SECRET });
  // A PhotoRegistry címe a beállított hálózaton – a képek tanúsítványában jelenik meg (L20)
  const contractAddress = resolveContractAddress(env.CHAIN_ID);
  // A képek közös katalógusa (galéria, adatlap, saját képek, elrejtés) – a képek, a saját profil és
  // az admin útvonalai is ezt használják; az elrejtés a kép nyitott fizetéseit is lezárja (L16)
  const photoCatalog = createPhotoCatalog({
    prisma,
    storage,
    logger,
    chainId: env.CHAIN_ID,
    contractAddress,
    checkouts: orders,
  });
  const usersDependencies = { prisma, photoCatalog, requireAuth };
  // A közös képfeldolgozási sor (L32): a feltöltés, az ellenőrzés és a visszaállítás képbontásai
  // együtt legfeljebb IMAGE_PROCESSING_CONCURRENCY számban futnak (a memóriakeret miatt)
  const imageWork = createImageWork(env.IMAGE_PROCESSING_CONCURRENCY);

  app.use('/api', healthRouter);
  app.use('/api/auth', createAuthRouter({ env, prisma, loadSession }));
  app.use(
    '/api/photos',
    createPhotosRouter({
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
    }),
  );
  // A kép értékelései: a képek útvonalai ezt az útvonalat nem kezelik (a /:id egyetlen szakasz),
  // így ide jut el; a kép azonosítóját a router a csatolási útvonalból kapja
  const reviews = createReviewsService({ prisma, logger });
  app.use(
    '/api/photos/:id/reviews',
    createPhotoReviewsRouter({ reviews, requireAuth, optionalAuth }),
  );
  app.use('/api/reviews', createReviewsRouter({ reviews, requireAuth }));
  app.use('/api/categories', createCategoriesRouter({ prisma }));
  app.use('/api/users', createUsersRouter(usersDependencies));
  app.use('/api/orders', createOrdersRouter({ env, orders, requireAuth }));
  // A vásárlásaim lista az /api/me alatt van, de a rendelések modulja szolgálja ki – ezért előbb
  // kerül sorra, mint az /api/me többi útvonala
  app.use('/api/me/purchases', createPurchasesRouter({ orders, requireAuth }));
  app.use('/api/me', createMeRouter(usersDependencies));
  // A nyilvános hitelesség-ellenőrző (bejelentkezés nélkül, szigorú korlátokkal)
  app.use(
    '/api/verify',
    createVerificationRouter({ env, logger, prisma, storage, blockchain, imageWork }),
  );
  // Az adminisztrátor felülete (L16): felhasználók tiltása, képek elrejtése és visszaállítása, a
  // sikertelen lánc-regisztráció újrapróbálása, statisztika – csak adminnak
  app.use(
    '/api/admin',
    createAdminRouter({
      env,
      logger,
      prisma,
      storage,
      photoCatalog,
      photoRegistration,
      checkouts: orders,
      imageWork,
      requireAuth,
      requireRole,
    }),
  );

  // A nyilvános képek (vízjeles előnézet, bélyegkép) kiszolgálása. Előtte a kép láthatóságának
  // ellenőrzése az adatbázisból (mediaAccess.ts): a nem nyilvános kép (regisztrációra váró, rejtett,
  // vagy a fotósa letiltva) fájlját csak a kép kezelője (tulajdonos, admin) kapja meg, másnak 404.
  // Minden kérés adatbázis-lekérdezés (távoli tárhelynél egy tárhely-letöltés is), ezért IP-címenként
  // korlátozott – helyi tárhelynél is. A nyilvános képet a böngésző 5 percig újrakérés nélkül
  // használhatja, köztes gyorsítótár nem tárolhatja (private); a nem nyilvános kép válaszát az őr
  // no-store-ra állítja, azt a kiszolgálás nem írja felül. Az eredeti fájlok a nyilvános mappán
  // kívül vannak, így URL-en nem érhetők el; mappalista és rejtett fájl sincs.
  // Forrás: Express 5 API – express.static (setHeaders),
  // https://expressjs.com/en/5x/api.html#express.static
  app.use(
    PUBLIC_URL_PREFIX,
    createRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.MEDIA_RATE_LIMIT_MAX,
      message: 'Túl sok képletöltés – próbáld újra később',
    }),
    createMediaAccess({ prisma, sessionViewer }),
    publicUploadsDirectory
      ? express.static(publicUploadsDirectory, {
          index: false,
          dotfiles: 'deny',
          redirect: false,
          setHeaders: (res) => {
            if (!res.get('Cache-Control')) res.set('Cache-Control', MEDIA_CACHE_CONTROL);
          },
        })
      : // Távoli tárhelynél (Supabase Storage, L32) a szerver a tárhelyről adja tovább ugyanezeket
        createMediaRouter(storage),
    // A látható kép hiányzó fájlja is ugyanazt a 404-et kapja, mint a nem látható kép
    mediaFileMissing,
  );
  // A webes felület (L31): a konténerben ugyanaz a szerver szolgálja ki, mint az API-t
  if (env.CLIENT_DIST_DIR) {
    app.use(createClientAppRouter(env.CLIENT_DIST_DIR));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
