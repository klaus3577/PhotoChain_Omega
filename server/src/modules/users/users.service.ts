// A felhasználók publikus profilja és a saját profil módosítása (terv 5.1, L13). A publikus profilban
// csak a megjelenített név, a bemutatkozás, a regisztráció ideje, a nyilvános képek száma és a
// nyilvános képek értékeléseinek átlaga (L15, a letiltott szerzők értékelései nélkül – L16) szerepel
// – az e-mail, a szerepkör és a tiltási állapot soha. A letiltott felhasználó profilja a tiltás
// idejére 404 (L16).
// Forrás: Prisma ORM v7 – Aggregation, grouping, and summarizing (a relációk szűrt megszámlálása,
// _count; aggregate), https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing
// (adaptálva)
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { isReservedDisplayName, RESERVED_NAME_MESSAGE } from '../../lib/reservedNames.js';
import { SESSION_USER_SELECT, type SessionUser, toSessionUser } from '../../lib/sessionUser.js';
import { PUBLIC_PHOTO_WHERE } from '../photos/photos.visibility.js';
import {
  ratingSummary,
  type RatingSummary,
  VISIBLE_REVIEW_WHERE,
} from '../reviews/reviews.rating.js';
import type { UpdateProfileInput } from './users.schemas.js';

export interface PublicProfileDto {
  id: string;
  displayName: string;
  bio: string | null;
  createdAt: Date;
  /** A nyilvános (REGISTERED) képek száma */
  photoCount: number;
  /** A nyilvános képek értékeléseinek átlaga és száma (mint a photoCount: a rejtettek nem) */
  rating: RatingSummary;
}

export interface UsersService {
  getProfile(id: string): Promise<PublicProfileDto>;
  /**
   * A bejelentkezett felhasználó profiljának módosítása; utána a saját adatai (ugyanaz az alak, mint
   * a GET /api/auth/me-é).
   */
  updateProfile(user: SessionUser, input: UpdateProfileInput): Promise<SessionUser>;
}

/**
 * Foglalt név (L30) csak akkor hiba, ha új: a már meglévő nevét (pl. a bemutatkozás módosításakor
 * újra elküldve) a felhasználó megtarthatja, és az adminisztrátor viselhet ilyen nevet.
 */
function assertNameAllowed(user: SessionUser, displayName: string | undefined): void {
  if (displayName === undefined || displayName === user.displayName || user.role === 'ADMIN') {
    return;
  }
  if (isReservedDisplayName(displayName)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', [
      { path: 'displayName', message: RESERVED_NAME_MESSAGE },
    ]);
  }
}

const PUBLIC_PROFILE_SELECT = {
  id: true,
  displayName: true,
  bio: true,
  createdAt: true,
  // Csak a nyilvános képek számítanak (ugyanaz a szabály, mint a galériáé)
  _count: { select: { photos: { where: PUBLIC_PHOTO_WHERE } } },
} as const satisfies Prisma.UserSelect;

export function createUsersService(prisma: PrismaClient): UsersService {
  return {
    async getProfile(id) {
      // A letiltott felhasználó profilja a tiltás idejére nem létezik (L16) – a tiltás ténye sem
      // derül ki belőle
      const user = await prisma.user.findUnique({
        where: { id, isBlocked: false },
        select: PUBLIC_PROFILE_SELECT,
      });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'A felhasználó nem található');
      const rating = await ratingSummary(prisma, {
        photo: { ...PUBLIC_PHOTO_WHERE, ownerId: id },
        ...VISIBLE_REVIEW_WHERE,
      });
      return {
        id: user.id,
        displayName: user.displayName,
        bio: user.bio,
        createdAt: user.createdAt,
        photoCount: user._count.photos,
        rating,
      };
    },

    async updateProfile(sessionUser, input) {
      assertNameAllowed(sessionUser, input.displayName);
      const user = await prisma.user.update({
        where: { id: sessionUser.id },
        // Csak a módosítható mezők; a meg nem adott (undefined) mező változatlan marad
        data: { displayName: input.displayName, bio: input.bio },
        select: SESSION_USER_SELECT,
      });
      return toSessionUser(user);
    },
  };
}
