// A platform statisztikája (terv 5.1, L16 – GET /api/admin/stats): felhasználók (összesen,
// letiltott, admin), képek és rendelések állapotonként, a bevétel (a kifizetett rendelések
// összege forintban) és a láncon regisztrált hash-ek száma. Ez utóbbiba a később elrejtett
// regisztrált kép is beleszámít: a lánc rekordja az elrejtéskor megmarad. Minden szám ugyanabból
// az adatbázis-pillanatképből (REPEATABLE READ) származik, így egymásnak nem mondanak ellent.
// Forrás: Prisma ORM v7 – Aggregation, grouping, and summarizing (count, aggregate: _sum, groupBy),
// https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing; Prisma
// ORM v7 – Transactions (isolationLevel), https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
// (adaptálva)
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, PhotoStatus } from '../../generated/prisma/enums.js';

/** Darabszámok állapotonként (minden állapot szerepel) és összesen. */
export interface StatusCounts<Status extends string> {
  total: number;
  byStatus: Record<Status, number>;
}

export interface PlatformStats {
  users: { total: number; blocked: number; admins: number };
  photos: StatusCounts<PhotoStatus>;
  orders: StatusCounts<OrderStatus>;
  /** A kifizetett (PAID) rendelések összege forintban */
  revenueHuf: number;
  /** A láncon regisztrált képek (registeredAt) száma – az elrejtetteké is */
  registeredHashes: number;
}

/** Egy állapot darabszáma, ahogy a groupBy adja. */
interface StatusGroup<Status extends string> {
  status: Status;
  _count: { _all: number };
}

/**
 * Az állapotonkénti darabszámok: a groupBy csak a létező állapotokat adja vissza – a hiányzó 0.
 */
export function statusCounts<Status extends string>(
  statuses: readonly Status[],
  groups: ReadonlyArray<StatusGroup<Status>>,
): StatusCounts<Status> {
  const countOf = (status: Status): number =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  const byStatus = Object.fromEntries(
    statuses.map((status) => [status, countOf(status)]),
  ) as Record<Status, number>;
  const total = statuses.reduce((sum, status) => sum + byStatus[status], 0);
  return { total, byStatus };
}

export async function platformStats(prisma: PrismaClient): Promise<PlatformStats> {
  const [users, blocked, admins, photoGroups, orderGroups, revenue, registeredHashes] =
    await prisma.$transaction(
      [
        prisma.user.count(),
        prisma.user.count({ where: { isBlocked: true } }),
        prisma.user.count({ where: { role: 'ADMIN' } }),
        prisma.photo.groupBy({
          by: ['status'],
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        prisma.order.groupBy({
          by: ['status'],
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { amountHuf: true } }),
        prisma.photo.count({ where: { registeredAt: { not: null } } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
  return {
    users: { total: users, blocked, admins },
    photos: statusCounts(Object.values(PhotoStatus), photoGroups),
    orders: statusCounts(Object.values(OrderStatus), orderGroups),
    revenueHuf: revenue._sum.amountHuf ?? 0,
    registeredHashes,
  };
}
