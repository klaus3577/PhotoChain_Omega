// Az Express Request típusának bővítése: a bejelentkezett felhasználó (a requireAuth, az optionalAuth
// és a loadSession állítja be – middleware/auth.ts). A kötelező bejelentkezésű kezelők ne közvetlenül
// olvassák, hanem a getSessionUser(req) segéddel, amely 401-et ad, ha a requireAuth kimaradt az
// útvonalról; a `req.user ?? null` alak csak a vendéget is kiszolgáló útvonalaké (pl. GET /auth/me).
// Forrás: TypeScript Handbook – Declaration Merging (global augmentation),
// https://www.typescriptlang.org/docs/handbook/declaration-merging.html (adaptálva)
import type { SessionUser } from '../lib/sessionUser.js';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
