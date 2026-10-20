// A bejelentkezett felhasználó azon adatai, amelyek a kliensnek visszaadhatók (és a req.user-be
// kerülnek). A jelszó-hash és a tiltási állapot szándékosan nincs köztük.
import type { Role } from '../generated/prisma/client.js';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  bio: string | null;
  role: Role;
  createdAt: Date;
}

/** Prisma `select`: az adatbázisból is csak ezek az oszlopok jönnek le. */
export const SESSION_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  bio: true,
  role: true,
  createdAt: true,
} as const satisfies Record<keyof SessionUser, true>;

/**
 * Bővebb rekordból (pl. a jelszó-hash-sel együtt lekérdezettből) csak a visszaadható mezőket
 * tartja meg. A TypeScript a bővebb objektumot is elfogadja; a szűrést futásidőben ez végzi.
 */
export function toSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    role: user.role,
    createdAt: user.createdAt,
  };
}
