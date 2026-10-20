// Az admin felhasználó-kezelése (terv 5.1, L16): a felhasználók listája (keresés e-mailre és névre,
// tiltási szűrő) és a tiltás / feloldás.
// - A tiltás azonnal érvényes: a munkamenet minden kérésnél az adatbázisból olvassa a tiltást
//   (middleware/auth.ts), a letiltott felhasználó bejelentkezni sem tud. A nyilvános tartalma (képei,
//   profilja, értékelései) a tiltás idejére eltűnik (photos.visibility.ts), a feloldás után
//   visszajön; a nyitott fizetései – vevőként és a képeire indítottak – lezárulnak.
// - Adminisztrátor (a saját fiók is) nem tiltható le: így az admin nem zárhatja ki magát, és két
//   admin sem tilthatja le egymást (szerepkört az API nem módosít, az adminokat a seed hozza létre).
// - A tiltás és a feloldás a naplóba kerül (ki, kit); az e-mail-cím nem.
// Forrás: Prisma ORM v7 – Filtering and sorting, Pagination (skip, take), Transactions,
// https://www.prisma.io/docs/orm/v7/prisma-client/queries (adaptálva)
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { type PageMeta, pageMeta } from '../../lib/schemas.js';
import { containsText } from '../../lib/search.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { PhotoViewer } from '../photos/photos.visibility.js';
import { ADMIN_USER_SELECT, type AdminUserDto, toAdminUserDto } from './admin.dto.js';
import type { ListUsersQuery } from './admin.schemas.js';

export interface AdminUserPage {
  users: AdminUserDto[];
  meta: PageMeta;
}

export interface AdminUsers {
  /** A felhasználók, a legutóbb regisztrált elöl. */
  list(query: ListUsersQuery): Promise<AdminUserPage>;
  /** Tiltás vagy feloldás; a kívánt állapot már fennállhat (az ismételt kérés is sikeres). */
  setBlocked(id: string, actor: PhotoViewer, isBlocked: boolean): Promise<AdminUserDto>;
}

export interface AdminUsersDependencies {
  prisma: PrismaClient;
  logger: Logger;
  /** A letiltott felhasználó nyitott fizetéseinek lezárása */
  checkouts: Pick<OrdersService, 'closeOpenCheckouts'>;
}

/** A legutóbb regisztrált elöl; azonos időpontnál az azonosító dönt, így a lapozás stabil. */
const USER_ORDER: Prisma.UserOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

/** A lista szűrői; a meg nem adott (undefined) szűrőt a Prisma kihagyja. */
function usersWhere({ q, blocked }: ListUsersQuery): Prisma.UserWhereInput {
  return {
    isBlocked: blocked,
    ...(q === undefined
      ? {}
      : { OR: [{ email: containsText(q) }, { displayName: containsText(q) }] }),
  };
}

export function createAdminUsers({
  prisma,
  logger,
  checkouts,
}: AdminUsersDependencies): AdminUsers {
  return {
    async list(query) {
      const { page, pageSize } = query;
      const where = usersWhere(query);
      // A darabszám és az oldal ugyanabból a pillanatképből (mint a galériánál, L13)
      const [total, users] = await prisma.$transaction(
        [
          prisma.user.count({ where }),
          prisma.user.findMany({
            where,
            orderBy: USER_ORDER,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: ADMIN_USER_SELECT,
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      return { users: users.map(toAdminUserDto), meta: pageMeta({ page, pageSize }, total) };
    },

    async setBlocked(id, actor, isBlocked) {
      const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (!user) throw new AppError(404, 'NOT_FOUND', 'A felhasználó nem található');
      if (isBlocked && user.role === 'ADMIN') {
        throw new AppError(409, 'CONFLICT', 'Adminisztrátor nem tiltható le');
      }
      // Csak a valódi változás kerül a naplóba (az ismételt kérés nem)
      const { count } = await prisma.user.updateMany({
        where: { id, isBlocked: !isBlocked },
        data: { isBlocked },
      });
      if (count > 0) {
        logger.info(
          { userId: id, actorId: actor.id, isBlocked },
          isBlocked ? 'A felhasználó letiltva' : 'A felhasználó tiltása feloldva',
        );
      }
      // Ismételt tiltásnál is: egy korábbi, félbemaradt lezárás így befejeződik
      if (isBlocked) await checkouts.closeOpenCheckouts({ userId: id });
      const updated = await prisma.user.findUniqueOrThrow({
        where: { id },
        select: ADMIN_USER_SELECT,
      });
      return toAdminUserDto(updated);
    },
  };
}
