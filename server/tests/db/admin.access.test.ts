// Az admin API hozzáférés-védelme a tesztadatbázison (terv 5.1, L16): minden /api/admin végpont
// csak bejelentkezett, nem letiltott adminnak érhető el – névtelenül 401, más felhasználónak 403
// (a terv „Kész, ha” feltétele), a letiltott adminnak 403 ACCOUNT_BLOCKED. A módosító kérést idegen
// oldal nem indíthatja; a válaszokat (a hibát is) semmilyen gyorsítótár nem tárolhatja.
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  type TestChain,
} from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';

let prisma: PrismaClient;
let app: Express;
let chain: TestChain;
let target: { id: string };
let photo: { id: string };

beforeAll(() => {
  prisma = createTestPrisma();
});

// Az újrapróbált regisztráció a háttérben fut: a teszt végéig befejeződik
afterEach(() => chain.photoRegistration.whenIdle());

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  chain = createTestChain(prisma);
  app = createTestApp({}, prisma, chain);
  target = await createUser(prisma, 'cel@photochain.test');
  const categoryId = (await createCategory(prisma)).id;
  photo = await createPhoto(prisma, { ownerId: target.id, categoryId, status: 'CHAIN_FAILED' });
});

interface AdminCall {
  name: string;
  send: (cookie?: string, crossSite?: boolean) => request.Test;
}

/** Az admin API összes végpontja egy-egy érvényes kéréssel. */
function adminCalls(): AdminCall[] {
  const call =
    (method: 'get' | 'patch' | 'post', path: string, body?: object) =>
    (cookie?: string, crossSite = false) => {
      let pending = request(app)[method](`/api/admin${path}`);
      if (cookie) pending = pending.set('Cookie', cookie);
      if (crossSite) pending = pending.set('Sec-Fetch-Site', 'cross-site');
      return body === undefined ? pending : pending.send(body);
    };
  // A sorrend számít: előbb az újrapróbálás, mert az elrejtett kép, illetve a letiltott fotós képe
  // már nem próbálható újra (409)
  return [
    { name: 'GET /users', send: call('get', '/users') },
    { name: 'GET /photos', send: call('get', '/photos') },
    {
      name: 'POST /photos/:id/retry-registration',
      send: call('post', `/photos/${photo.id}/retry-registration`),
    },
    { name: 'PATCH /photos/:id', send: call('patch', `/photos/${photo.id}`, { hidden: true }) },
    { name: 'PATCH /users/:id', send: call('patch', `/users/${target.id}`, { isBlocked: true }) },
    { name: 'GET /stats', send: call('get', '/stats') },
  ];
}

/** Semmi nem változott: a felhasználó nincs letiltva, a kép nincs elrejtve vagy újraküldve. */
async function expectNothingChanged(): Promise<void> {
  expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isBlocked).toBe(false);
  expect((await prisma.photo.findUniqueOrThrow({ where: { id: photo.id } })).status).toBe(
    'CHAIN_FAILED',
  );
}

describe('az admin API csak adminnak', () => {
  it('bejelentkezés nélkül 401 UNAUTHORIZED, a válasz nem tárolható', async () => {
    for (const { name, send } of adminCalls()) {
      const response = await send();

      expect(response.status, name).toBe(401);
      expect(response.body.error.code, name).toBe('UNAUTHORIZED');
      expect(response.headers['cache-control'], name).toBe('no-store');
    }
    await expectNothingChanged();
  });

  it('nem admin felhasználónak 403 FORBIDDEN', async () => {
    const userCookie = sessionCookieFor((await createUser(prisma)).id);

    for (const { name, send } of adminCalls()) {
      const response = await send(userCookie);

      expect(response.status, name).toBe(403);
      expect(response.body.error.code, name).toBe('FORBIDDEN');
      expect(response.headers['cache-control'], name).toBe('no-store');
    }
    await expectNothingChanged();
  });

  it('a letiltott adminnak 403 ACCOUNT_BLOCKED', async () => {
    const blockedAdmin = await createUser(prisma, undefined, { role: 'ADMIN', isBlocked: true });

    for (const { name, send } of adminCalls()) {
      const response = await send(sessionCookieFor(blockedAdmin.id));

      expect(response.status, name).toBe(403);
      expect(response.body.error.code, name).toBe('ACCOUNT_BLOCKED');
    }
    await expectNothingChanged();
  });

  it('más webhelyről indított módosító kérés az adminnak is 403', async () => {
    const adminCookie = sessionCookieFor(
      (await createUser(prisma, undefined, { role: 'ADMIN' })).id,
    );
    const unsafe = adminCalls().filter(({ name }) => !name.startsWith('GET'));

    for (const { name, send } of unsafe) {
      expect((await send(adminCookie, true)).status, name).toBe(403);
    }
    await expectNothingChanged();
  });

  it('az adminnak minden végpont válaszol, a válasz nem tárolható', async () => {
    const adminCookie = sessionCookieFor(
      (await createUser(prisma, undefined, { role: 'ADMIN' })).id,
    );

    for (const { name, send } of adminCalls()) {
      const response = await send(adminCookie);

      expect(response.status, name).toBeLessThan(300);
      expect(response.headers['cache-control'], name).toBe('no-store');
    }
  });
});
