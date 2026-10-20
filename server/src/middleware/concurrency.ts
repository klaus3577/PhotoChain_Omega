// Az egyszerre kiszolgált kérések számának korlátja egy útvonalon, összesen és kulcsonként (pl.
// felhasználónként vagy IP-címenként). A képfeltöltésnél és a hitelesség-ellenőrzésnél ez szab felső
// határt a memóriaigénynek: a multer minden beérkező fájlt a memóriában tart, így korlát nélkül sok
// egyidejű kérés kimeríthetné a szerver memóriáját, egyetlen kliens pedig lefoglalhatná az összes
// helyet.
import { finished } from 'node:stream';

import type { Request, RequestHandler } from 'express';

import { AppError } from '../lib/errors.js';

/** Az elutasítások üzenetei (útvonalanként mások lehetnek). */
export interface ConcurrencyLimitMessages {
  /** A kulcs (pl. a felhasználó) elérte a saját korlátját – 429 */
  perKey: string;
  /** Összesen nincs több szabad hely – 503 */
  total: string;
}

/** A képfeltöltés üzenetei – ez az alapértelmezés. */
const UPLOAD_MESSAGES: ConcurrencyLimitMessages = {
  perKey: 'Egyszerre csak egy feltöltésed lehet folyamatban – várd meg, amíg elkészül',
  total: 'A szerver most túl sok feltöltést fogad – próbáld újra kicsit később',
};

export interface ConcurrencyLimitOptions {
  /** Összesen legfeljebb ennyi kérés lehet folyamatban; a többi 503 (SERVER_BUSY). */
  total: number;
  /** Kulcsonként (felhasználónként) legfeljebb ennyi; a többi 429 (RATE_LIMITED). */
  perKey: number;
  keyOf: (req: Request) => string;
  messages?: ConcurrencyLimitMessages | undefined;
}

export function createConcurrencyLimit({
  total,
  perKey,
  keyOf,
  messages = UPLOAD_MESSAGES,
}: ConcurrencyLimitOptions): RequestHandler {
  let active = 0;
  const activeByKey = new Map<string, number>();

  return (req, res, next) => {
    const key = keyOf(req);
    const activeForKey = activeByKey.get(key) ?? 0;
    if (activeForKey >= perKey) {
      throw new AppError(429, 'RATE_LIMITED', messages.perKey);
    }
    if (active >= total) {
      throw new AppError(503, 'SERVER_BUSY', messages.total);
    }
    active += 1;
    activeByKey.set(key, activeForKey + 1);
    // A hely a válasz lezárultakor szabadul fel – akár elküldtük, akár a kliens bontotta a
    // kapcsolatot. A finished akkor is jelez, ha ez már korábban megtörtént (pl. a kapcsolat még
    // a bejelentkezés ellenőrzése közben szakadt meg): egy „close” eseményre várva a hely örökre
    // foglalt maradna.
    finished(res, () => {
      active -= 1;
      const remaining = (activeByKey.get(key) ?? 1) - 1;
      if (remaining > 0) activeByKey.set(key, remaining);
      else activeByKey.delete(key);
    });
    next();
  };
}
