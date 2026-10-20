// A napi feltöltési keret (L30, OWASP A06): minden elfogadott feltöltés egy lánc-tranzakció, amelyet
// a platform-tárca fizet. A keret az elmúlt 24 óra feltöltéseit számolja az adatbázisból (újraindítás
// után is él, és minden szerverpéldány ugyanazt látja) – fiókonként és a platformon összesen. Az
// utóbbi a bábfiókokkal (sok, ingyen regisztrált fiók) szemben is véges költséget ad; ára, hogy ha
// elfogy, a napból hátralévő időben senki nem tölthet fel (a költségtámadásból elérhetőségi
// támadás lesz – mint a hitelesség-ellenőrzés közös láncolvasási kereténél, L12). Az elrejtett és a
// sikertelen regisztrációjú kép is számít (a tranzakciója már kiment, illetve kimehet).
// A keret a fájl fogadása előtt dől el: a túllépő kérés fájlját a szerver nem dolgozza fel (a törzset
// legfeljebb eldobja – a hibakezelő a törzs határidején belül kiüríti).
import type { RequestHandler } from 'express';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { getSessionUser } from '../../middleware/auth.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyUploadQuotaOptions {
  /** Ennyi feltöltés fiókonként 24 óra alatt */
  perUser: number;
  /** Ennyi feltöltés a platformon összesen 24 óra alatt */
  total: number;
}

/**
 * A keret ellenőrzése a feltöltés útvonalán, a bejelentkezés és az egyidejűségi korlát után. A
 * túllépés korlátos: a kép sora csak a feldolgozás végén jön létre, és ha a kliens közben bontja a
 * kapcsolatot, a helye már felszabadul – így fiókonként legfeljebb eggyel, a platformon legfeljebb
 * az egyszerre futó feltöltések számával (UPLOAD_MAX_CONCURRENT) mehet túl a keret.
 */
export function createDailyUploadQuota(
  prisma: Pick<PrismaClient, 'photo'>,
  { perUser, total }: DailyUploadQuotaOptions,
): RequestHandler {
  return async (req, _res, next) => {
    const since = new Date(Date.now() - DAY_MS);
    const ownerId = getSessionUser(req).id;
    const [own, all] = await Promise.all([
      prisma.photo.count({ where: { ownerId, createdAt: { gte: since } } }),
      prisma.photo.count({ where: { createdAt: { gte: since } } }),
    ]);
    if (own >= perUser) {
      throw new AppError(
        429,
        'DAILY_LIMIT_REACHED',
        `Elérted a napi feltöltési keretet (${perUser} kép / 24 óra) – próbáld újra később`,
      );
    }
    if (all >= total) {
      throw new AppError(
        429,
        'DAILY_LIMIT_REACHED',
        'A platform napi feltöltési kerete elfogyott – próbáld újra később',
      );
    }
    next();
  };
}
