// Tesztsegédek az adatbázis-tesztekhez: a tesztadatbázisra csatlakozó Prisma-kliens, a táblák
// kiürítése és tesztadat-gyártó függvények (véletlen, nem valódi értékekkel).
import { randomBytes, randomUUID } from 'node:crypto';

import { inject } from 'vitest';

import type {
  HiddenBy,
  PhotoStatus,
  PrismaClient,
  Role,
} from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/lib/prisma.js';
import { truncateAll } from '../../src/lib/truncateAll.js';

/** Véletlen hexadecimális szöveg (`bytes` bájt → kétszer ennyi karakter). */
export const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex');

export function createTestPrisma(): PrismaClient {
  return createPrismaClient(inject('testDatabaseUrl'));
}

/** Minden táblát kiürít, és a sorszám-számlálókat is visszaállítja (a közös truncateAll, L28). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await truncateAll(prisma);
}

interface UserOverrides {
  displayName?: string;
  /** Valódi bcrypt-hash, ha a teszt be is jelentkezik a felhasználóval */
  passwordHash?: string;
  role?: Role;
  isBlocked?: boolean;
  createdAt?: Date;
}

export function createUser(
  prisma: PrismaClient,
  email = `${randomHex(4)}@photochain.test`,
  overrides: UserOverrides = {},
) {
  return prisma.user.create({
    data: { email, passwordHash: 'nem-valodi-hash', displayName: 'Teszt Elek', ...overrides },
  });
}

export function createCategory(prisma: PrismaClient) {
  const suffix = randomHex(3);
  return prisma.category.create({
    data: { name: `Kategória ${suffix}`, slug: `kategoria-${suffix}` },
  });
}

export interface PhotoFixture {
  ownerId: string;
  categoryId: number;
  title?: string;
  description?: string | null;
  createdAt?: Date;
  sha256?: string;
  dHash?: string;
  priceHuf?: number;
  status?: PhotoStatus;
  chainTxHash?: string;
  chainBlockNumber?: number;
  /** Alapból REGISTERED állapotnál a létrehozás ideje, egyébként nincs */
  registeredAt?: Date;
  /** Ki rejtette el – alapból HIDDEN állapotnál a tulajdonos, egyébként nincs (photos_hiddenBy_check) */
  hiddenBy?: HiddenBy;
}

export function createPhoto(prisma: PrismaClient, fixture: PhotoFixture) {
  // A tárhelykulcsok a valódiakhoz hasonlóan UUID-alapúak (a nyilvános URL csak ilyenhez készül)
  const key = randomUUID();
  return prisma.photo.create({
    data: {
      ownerId: fixture.ownerId,
      categoryId: fixture.categoryId,
      title: fixture.title ?? 'Naplemente',
      description: fixture.description,
      createdAt: fixture.createdAt,
      priceHuf: fixture.priceHuf ?? 2500,
      sha256: fixture.sha256 ?? randomHex(32),
      dHash: fixture.dHash ?? randomHex(8),
      width: 4000,
      height: 3000,
      originalKey: `originals/${key}.jpg`,
      previewKey: `previews/${key}.jpg`,
      thumbnailKey: `thumbnails/${key}.jpg`,
      status: fixture.status,
      chainTxHash: fixture.chainTxHash,
      chainBlockNumber: fixture.chainBlockNumber,
      // A regisztrált képnek regisztrációs ideje is van (photos_registeredAt_check)
      registeredAt:
        fixture.registeredAt ?? (fixture.status === 'REGISTERED' ? new Date() : undefined),
      hiddenBy: fixture.hiddenBy ?? (fixture.status === 'HIDDEN' ? 'OWNER' : undefined),
    },
  });
}
