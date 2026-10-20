// Hitelesítés és jogosultság-ellenőrzés a végpontokhoz.
// - requireAuth: a munkamenet-sütiben lévő JWT alapján azonosítja a felhasználót, és a req.user-be
//   teszi (a típusa: src/types/express.d.ts). A felhasználót minden kérésnél az adatbázisból olvassa
//   ki: a tiltás és a szerepkör változása így azonnal érvényes, nem csak a token lejárta után.
// - optionalAuth: nyilvános útvonalra, amely a bejelentkezett felhasználónak többet mutathat (pl. a
//   saját, még nem nyilvános kép adatlapja); érvényes munkamenet nélkül névtelenként enged tovább.
// - loadSession: a munkamenet lekérdezéséhez (/auth/me – L26): érvényes munkamenet nélkül névtelenül
//   enged tovább (a válasz user: null – a vendég induló ellenőrzése nem hiba, nem kerül a böngésző
//   konzoljába), a letiltott fiók viszont itt is 403 ACCOUNT_BLOCKED (a kliens így tudja meg az okot).
// - requireRole: a requireAuth után használandó; csak a megadott szerepkörű felhasználót engedi át.
// - getSessionUser: a kezelők ezzel kérik le a bejelentkezett felhasználót.
import type { Request, RequestHandler } from 'express';

import type { PrismaClient, Role } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { verifySessionToken } from '../lib/jwt.js';
import { SESSION_COOKIE_NAME } from '../lib/sessionCookie.js';
import { SESSION_USER_SELECT, toSessionUser, type SessionUser } from '../lib/sessionUser.js';

export interface AuthMiddlewareDependencies {
  prisma: PrismaClient;
  jwtSecret: string;
}

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
  loadSession: RequestHandler;
  requireRole: (...roles: Role[]) => RequestHandler;
}

const unauthorized = (): AppError => new AppError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges');
const blocked = (): AppError =>
  new AppError(403, 'ACCOUNT_BLOCKED', 'A fiókot az adminisztrátor letiltotta');

/**
 * A bejelentkezett felhasználó. Ha a requireAuth kimaradt az útvonalról (a req.user üres), 401-et
 * dob – így egy hibásan bekötött útvonal sem válaszolhat felhasználó nélkül.
 */
export function getSessionUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function createAuthMiddleware({
  prisma,
  jwtSecret,
}: AuthMiddlewareDependencies): AuthMiddleware {
  /** A munkamenet felhasználója a tiltási állapotával; érvénytelen tokennél vagy ismeretlen felhasználónál null. */
  async function findSessionUser(req: Request) {
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    const userId = typeof token === 'string' ? verifySessionToken(token, jwtSecret) : null;
    if (userId === null) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { ...SESSION_USER_SELECT, isBlocked: true },
    });
  }

  const requireAuth: RequestHandler = async (req, _res, next) => {
    const user = await findSessionUser(req);
    if (!user) throw unauthorized();
    if (user.isBlocked) throw blocked();

    req.user = toSessionUser(user);
    next();
  };

  // Az érvénytelen munkamenetű vagy letiltott felhasználó névtelen nézőként folytatja: a nyilvános
  // tartalmat így is látja, többet nem
  const optionalAuth: RequestHandler = async (req, _res, next) => {
    const user = await findSessionUser(req);
    if (user && !user.isBlocked) req.user = toSessionUser(user);
    next();
  };

  // A munkamenet lekérdezése: névtelenül is továbbmegy (a kezelő user: null-t ad), a letiltott fiók 403
  const loadSession: RequestHandler = async (req, _res, next) => {
    const user = await findSessionUser(req);
    if (user?.isBlocked) throw blocked();
    if (user) req.user = toSessionUser(user);
    next();
  };

  const requireRole =
    (...roles: Role[]): RequestHandler =>
    (req, _res, next) => {
      const user = getSessionUser(req);
      if (!roles.includes(user.role)) {
        // L30 (A09): az admin végpontok próbálgatása nyomon követhető (azonosítóval, e-mail nélkül)
        req.log?.warn(
          { event: 'forbidden_role', actorId: user.id, requiredRoles: roles },
          'Jogosultság nélküli hozzáférési kísérlet',
        );
        throw new AppError(403, 'FORBIDDEN', 'Ehhez a művelethez nincs jogosultságod');
      }
      next();
    };

  return { requireAuth, optionalAuth, loadSession, requireRole };
}
