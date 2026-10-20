// A platform statisztikája a tesztadatbázison (terv 5.1, L16, GET /api/admin/stats): felhasználók,
// képek és rendelések állapotonként, a bevétel (a kifizetett rendelések összege) és a láncon
// regisztrált hash-ek száma. A hozzáférés-védelem az admin.access.test.ts-ben van.
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { OrderStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { randomTxHash } from '../helpers/fakeBlockchain.js';
import { createTestApp, sessionCookieFor } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  randomHex,
  resetDatabase,
} from '../helpers/testDatabase.js';

let prisma: PrismaClient;
let app: Express;
let adminCookie: string;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  app = createTestApp({}, prisma);
  adminCookie = sessionCookieFor((await createUser(prisma, undefined, { role: 'ADMIN' })).id);
});

const getStats = () => request(app).get('/api/admin/stats').set('Cookie', adminCookie);

const orderOf = (buyerId: string, photoId: string, status: OrderStatus, amountHuf: number) =>
  prisma.order.create({
    data: {
      buyerId,
      photoId,
      amountHuf,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
      stripeSessionId: `cs_test_${randomHex(16)}`,
    },
  });

describe('GET /api/admin/stats', () => {
  it('üres platformon (csak az admin): minden darabszám és a bevétel is 0', async () => {
    const response = await getStats();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        stats: {
          users: { total: 1, blocked: 0, admins: 1 },
          photos: {
            total: 0,
            byStatus: { PENDING_CHAIN: 0, REGISTERED: 0, CHAIN_FAILED: 0, HIDDEN: 0 },
          },
          orders: { total: 0, byStatus: { PENDING: 0, PAID: 0, EXPIRED: 0, FAILED: 0 } },
          revenueHuf: 0,
          registeredHashes: 0,
        },
      },
    });
  });

  it('a darabszámok állapotonként; a bevétel csak a kifizetett rendeléseké; a rejtett regisztrált kép hash-e is a láncon van', async () => {
    const owner = await createUser(prisma);
    const buyer = await createUser(prisma);
    await createUser(prisma, undefined, { isBlocked: true });
    const categoryId = (await createCategory(prisma)).id;
    const photo = (fixture: Parameters<typeof createPhoto>[1]) => createPhoto(prisma, fixture);
    const base = { ownerId: owner.id, categoryId };
    const registered = await photo({ ...base, status: 'REGISTERED', chainTxHash: randomTxHash() });
    const second = await photo({ ...base, status: 'REGISTERED', chainTxHash: randomTxHash() });
    // Regisztráció után elrejtve: a lánc rekordja megmarad
    await photo({
      ...base,
      status: 'HIDDEN',
      chainTxHash: randomTxHash(),
      registeredAt: new Date(),
    });
    await photo({ ...base, status: 'HIDDEN' });
    await photo({ ...base, status: 'PENDING_CHAIN' });
    await photo({ ...base, status: 'CHAIN_FAILED' });
    await orderOf(buyer.id, registered.id, 'PAID', 2500);
    await orderOf(buyer.id, second.id, 'PAID', 1990);
    await orderOf(owner.id, second.id, 'EXPIRED', 1990);
    await orderOf(owner.id, registered.id, 'PENDING', 2500);
    await orderOf(owner.id, registered.id, 'FAILED', 2500);

    const response = await getStats();

    expect(response.status).toBe(200);
    expect(response.body.data.stats).toEqual({
      users: { total: 4, blocked: 1, admins: 1 },
      photos: {
        total: 6,
        byStatus: { PENDING_CHAIN: 1, REGISTERED: 2, CHAIN_FAILED: 1, HIDDEN: 2 },
      },
      orders: { total: 5, byStatus: { PENDING: 1, PAID: 2, EXPIRED: 1, FAILED: 1 } },
      revenueHuf: 4490,
      registeredHashes: 3,
    });
  });
});
