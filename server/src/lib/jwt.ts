// A munkamenet-token (JWT) aláírása és ellenőrzése. A token csak a felhasználó azonosítóját (sub),
// a kiállítás (iat) és a lejárat (exp) idejét tartalmazza; a szerepkört és a tiltást minden kérésnél
// az adatbázisból olvassuk ki (middleware/auth.ts), így azok változása azonnal érvényesül.
// Forrás: jsonwebtoken README, https://github.com/auth0/node-jsonwebtoken (adaptálva);
// a mezők jelentése: RFC 7519 – JSON Web Token, https://www.rfc-editor.org/rfc/rfc7519
import jwt from 'jsonwebtoken';
import { z } from 'zod';

/** A token (és az őt hordozó süti) élettartama: 7 nap. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** HMAC-SHA256: szimmetrikus aláírás a szerver titkos kulcsával (JWT_SECRET). */
const JWT_ALGORITHM = 'HS256';

/** A felhasználók azonosítója UUID (users.id); más alakú azonosítót a token nem tartalmazhat. */
const userIdSchema = z.guid();

export function signSessionToken(userId: string, secret: string): string {
  return jwt.sign({}, secret, {
    algorithm: JWT_ALGORITHM,
    subject: userId,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/**
 * Az érvényes token felhasználó-azonosítóját adja vissza, minden más esetben `null`-t:
 * - az elfogadott algoritmus rögzített, így más algoritmusra átírt fejlécű token nem fogadható el;
 * - a `maxAge` miatt a kiállítás ideje (iat) kötelező, és a token a lejárat (exp) megadása nélkül
 *   sem élhet tovább 7 napnál;
 * - az azonosítónak (sub) UUID-nak kell lennie.
 */
export function verifySessionToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      maxAge: SESSION_TTL_SECONDS,
    });
    if (typeof payload !== 'object') return null;
    const userId = userIdSchema.safeParse(payload.sub);
    return userId.success ? userId.data : null;
  } catch {
    // A token a klienstől érkező, megbízhatatlan adat: bármilyen hibája érvénytelen tokent jelent.
    // A jsonwebtoken nem csak a saját hibáit dobja (JsonWebTokenError, TokenExpiredError) – egy
    // érvényes fejlécű, de nem JSON törzsű tokennél például SyntaxError-t –, ezért itt nem
    // válogatunk a hibák között: a kérés így 401-et kap, nem 500-at.
    return null;
  }
}
