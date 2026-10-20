// Sebességkorlát IP-címenként, szabványos RateLimit-fejlécekkel; a túllépés az egységes hibaformában
// (429 RATE_LIMITED) jut a klienshez.
// Forrás: express-rate-limit README, https://github.com/express-rate-limit/express-rate-limit
// (adaptálva)
import type { Request } from 'express';
import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

import { AppError } from '../lib/errors.js';

export interface RateLimiterOptions {
  /** Az időablak hossza ezredmásodpercben */
  windowMs: number;
  /** Ennyi kérés engedélyezett egy időablakban, IP-címenként */
  limit: number;
  /** A túllépéskor küldött hibaüzenet */
  message: string;
  /**
   * Mi alapján számol a korlát (alapból a kliens IP-címe). Bejelentkezéshez kötött végpontnál a
   * felhasználó azonosítója pontosabb: közös IP-cím mögül sem zárja ki a többieket.
   */
  keyGenerator?: (req: Request) => string;
  /** Ha igaz, a kérés nem számít bele (pl. nincs mihez kötni: hiányzó e-mail-cím) */
  skip?: (req: Request) => boolean;
  /** Csak a sikertelen (4xx/5xx) kérések számítanak bele – pl. a belépésnél (L30) */
  skipSuccessfulRequests?: boolean;
}

export function createRateLimiter({
  windowMs,
  limit,
  message,
  keyGenerator,
  skip,
  skipSuccessfulRequests = false,
}: RateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skip ? { skip } : {}),
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', message));
    },
  });
}
