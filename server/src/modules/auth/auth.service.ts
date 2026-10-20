// Az auth üzleti logikája: regisztráció és bejelentkezés (terv D3: route → controller → service →
// Prisma). A HTTP-ről (süti, státuszkód) nem tud; a hibákat AppError-ként dobja.
// Forrás: OWASP Authentication Cheat Sheet (egységes hibaüzenet, válaszidő),
// https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html (adaptálva)
import type { Logger } from 'pino';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/prisma.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../lib/password.js';
import { SESSION_USER_SELECT, toSessionUser, type SessionUser } from '../../lib/sessionUser.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

/** A biztonsági események naplója (a kérés naplója – így a kérés azonosítója is benne van) */
export type SecurityLog = Pick<Logger, 'warn'>;

export interface AuthService {
  register(input: RegisterInput): Promise<SessionUser>;
  login(input: LoginInput, log?: SecurityLog): Promise<SessionUser>;
}

export function createAuthService(prisma: PrismaClient): AuthService {
  return {
    async register({ email, password, displayName }) {
      const passwordHash = await hashPassword(password);
      try {
        // Nincs előzetes „létezik-e már?” lekérdezés: két egyidejű regisztráció közül az egyiket így
        // is az adatbázis egyedi indexe (users.email) utasítja el
        return await prisma.user.create({
          data: { email, passwordHash, displayName },
          select: SESSION_USER_SELECT,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(409, 'EMAIL_TAKEN', 'Ezzel az e-mail-címmel már regisztráltak');
        }
        throw error;
      }
    },

    async login({ email, password }, log) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { ...SESSION_USER_SELECT, passwordHash: true, isBlocked: true },
      });
      // Ismeretlen e-mail-címnél is lefut egy (eleve eredménytelen) bcrypt-összevetés – különben a
      // gyorsabb válaszból kiderülne, hogy a címhez nem tartozik fiók
      const passwordMatches = await verifyPassword(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );
      // Szándékosan ugyanaz a hiba ismeretlen címre és rossz jelszóra. A napló (L30, A09) a
      // megtámadott fiókot az azonosítójával jelöli – az e-mail-cím és a jelszó nem kerül bele
      if (!user || !passwordMatches) {
        log?.warn({ event: 'login_failed', userId: user?.id ?? null }, 'Sikertelen bejelentkezés');
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó');
      }
      // A tiltás ténye csak a helyes jelszó után derül ki
      if (user.isBlocked) {
        log?.warn(
          { event: 'login_blocked', userId: user.id },
          'Letiltott fiók bejelentkezési kísérlete',
        );
        throw new AppError(403, 'ACCOUNT_BLOCKED', 'A fiókot az adminisztrátor letiltotta');
      }
      return toSessionUser(user);
    },
  };
}
