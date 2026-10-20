// Az admin felhasználó-kezelése a tesztadatbázison (terv 5.1, L16): a felhasználók listája
// (GET /api/admin/users – lapozás, keresés e-mailre és névre, tiltási szűrő) és a tiltás / feloldás
// (PATCH /api/admin/users/:id). A tiltás azonnal érvényes (a munkamenet minden kérésnél az
// adatbázisból olvassa a tiltást); adminisztrátor nem tiltható le. A hozzáférés-védelem az
// admin.access.test.ts-ben, a nyitott fizetések lezárása az orders.close.test.ts-ben van.
import type { Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  TEST_ENV,
  UNKNOWN_USER_ID,
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
let admin: { id: string };
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
  admin = await createUser(prisma, 'admin@photochain.test', {
    displayName: 'Adminisztrátor',
    role: 'ADMIN',
    createdAt: onDay(1),
  });
  adminCookie = sessionCookieFor(admin.id);
});

/** Időpont 2026 októberének megadott napján – a rendezési tesztekhez. */
function onDay(day: number): Date {
  return new Date(Date.UTC(2026, 9, day, 10));
}

const listUsers = (query = '', cookie = adminCookie) =>
  request(app).get(`/api/admin/users${query}`).set('Cookie', cookie);

const patchUser = (id: string, body: unknown, target: Express = app) =>
  request(target)
    .patch(`/api/admin/users/${id}`)
    .set('Cookie', adminCookie)
    .send(body as object);

const isBlocked = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id } })).isBlocked;

const emailsOf = (response: request.Response): string[] =>
  (response.body.data.users as Array<{ email: string }>).map((user) => user.email);

/** Az alkalmazás, amelynek naplósorai (info szinttől) a tesztben olvashatók. */
function appWithLog(): { target: Express; lines: string[] } {
  const lines: string[] = [];
  const chain = createTestChain(prisma);
  const target = createApp({
    env: TEST_ENV,
    logger: pino({ level: 'info' }, { write: (line: string) => lines.push(line) }),
    prisma,
    storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
    blockchain: chain.blockchain,
    photoRegistration: chain.photoRegistration,
    payments: createFakePayments().payments,
  });
  return { target, lines };
}

const logEntries = (lines: string[]): Array<Record<string, unknown>> =>
  lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('GET /api/admin/users', () => {
  it('a legújabb elöl; az admin látja az e-mailt, a szerepkört, a tiltást és a képek számát', async () => {
    const anna = await createUser(prisma, 'anna@photochain.test', {
      displayName: 'Fotós Anna',
      createdAt: onDay(3),
    });
    await createUser(prisma, 'bela@photochain.test', { isBlocked: true, createdAt: onDay(2) });
    const categoryId = (await createCategory(prisma)).id;
    // Minden állapotú képe számít (a rejtett és a sikertelen is)
    for (const status of ['REGISTERED', 'HIDDEN', 'CHAIN_FAILED'] as const) {
      await createPhoto(prisma, { ownerId: anna.id, categoryId, status });
    }

    const response = await listUsers();

    expect(response.status).toBe(200);
    expect(emailsOf(response)).toEqual([
      'anna@photochain.test',
      'bela@photochain.test',
      'admin@photochain.test',
    ]);
    expect(response.body.data.users[0]).toEqual({
      id: anna.id,
      email: 'anna@photochain.test',
      displayName: 'Fotós Anna',
      role: 'USER',
      isBlocked: false,
      createdAt: onDay(3).toISOString(),
      photoCount: 3,
    });
    expect(response.body.data.users[1]).toMatchObject({ isBlocked: true, photoCount: 0 });
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    // A jelszó-hash soha nem kerül a válaszba
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('lapozás: az oldalak nem fedik át egymást; egyező időpontnál az azonosító dönt', async () => {
    for (const letter of ['a', 'b', 'c', 'd']) {
      await createUser(prisma, `${letter}@photochain.test`, { createdAt: onDay(5) });
    }

    const first = await listUsers('?pageSize=2&page=1');
    const second = await listUsers('?pageSize=2&page=2');
    const third = await listUsers('?pageSize=2&page=3');

    const seen = [...emailsOf(first), ...emailsOf(second), ...emailsOf(third)];
    expect(new Set(seen).size).toBe(5);
    expect(seen.at(-1)).toBe('admin@photochain.test');
    expect(second.body.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  });

  it('keresés az e-mail-címben és a megjelenített névben, kis- és nagybetűtől függetlenül', async () => {
    await createUser(prisma, 'kiss.anna@photochain.test', { displayName: 'Anna' });
    await createUser(prisma, 'bela@photochain.test', { displayName: 'ANNAmária' });
    await createUser(prisma, 'cecil@photochain.test', { displayName: 'Cecil' });

    expect(emailsOf(await listUsers('?q=anna')).sort()).toEqual([
      'bela@photochain.test',
      'kiss.anna@photochain.test',
    ]);
    expect(emailsOf(await listUsers('?q=CECIL@'))).toEqual(['cecil@photochain.test']);
  });

  it('a keresőszó % és _ jele szó szerint értendő (nem LIKE-helyettesítő)', async () => {
    await createUser(prisma, 'szazalek@photochain.test', { displayName: '100% Anna' });
    await createUser(prisma, 'mas@photochain.test', { displayName: '1000 Anna' });

    expect(emailsOf(await listUsers('?q=100%25'))).toEqual(['szazalek@photochain.test']);
    expect(emailsOf(await listUsers('?q=_'))).toEqual([]);
  });

  it('szűrés a tiltásra: csak a letiltottak, illetve csak a nem letiltottak', async () => {
    await createUser(prisma, 'tiltott@photochain.test', { isBlocked: true });
    await createUser(prisma, 'aktiv@photochain.test');

    expect(emailsOf(await listUsers('?blocked=true'))).toEqual(['tiltott@photochain.test']);
    expect(emailsOf(await listUsers('?blocked=false')).sort()).toEqual([
      'admin@photochain.test',
      'aktiv@photochain.test',
    ]);
  });

  it('hibás query-paraméter: 400 VALIDATION_ERROR', async () => {
    for (const query of ['?blocked=igen', '?page=0', '?pageSize=51', `?q=${'a'.repeat(101)}`]) {
      const response = await listUsers(query);

      expect(response.status, query).toBe(400);
      expect(response.body.error.code, query).toBe('VALIDATION_ERROR');
    }
  });
});

describe('PATCH /api/admin/users/:id', () => {
  it('a tiltás azonnal érvényes: a felhasználó következő kérése 403 ACCOUNT_BLOCKED', async () => {
    const anna = await createUser(prisma, 'anna@photochain.test');
    const annaCookie = sessionCookieFor(anna.id);
    // A 200 önmagában a vendégé is lehet: a bejelentkezett állapotot a felhasználó adata igazolja
    const before = await request(app).get('/api/auth/me').set('Cookie', annaCookie).expect(200);
    expect(before.body.data.user.id).toBe(anna.id);

    const response = await patchUser(anna.id, { isBlocked: true });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      id: anna.id,
      email: 'anna@photochain.test',
      isBlocked: true,
    });
    expect(await isBlocked(anna.id)).toBe(true);
    const blocked = await request(app).get('/api/auth/me').set('Cookie', annaCookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  it('a feloldás után a felhasználó újra használhatja a fiókját', async () => {
    const anna = await createUser(prisma, 'anna@photochain.test', { isBlocked: true });

    const response = await patchUser(anna.id, { isBlocked: false });

    expect(response.status).toBe(200);
    expect(response.body.data.user.isBlocked).toBe(false);
    const session = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookieFor(anna.id))
      .expect(200);
    expect(session.body.data.user.id).toBe(anna.id);
  });

  it('ismételt tiltás és feloldás is sikeres (a kívánt állapot már fennáll)', async () => {
    const anna = await createUser(prisma, 'anna@photochain.test', { isBlocked: true });

    expect((await patchUser(anna.id, { isBlocked: true })).status).toBe(200);
    expect(await isBlocked(anna.id)).toBe(true);
    expect((await patchUser(anna.id, { isBlocked: false })).status).toBe(200);
    expect((await patchUser(anna.id, { isBlocked: false })).status).toBe(200);
    expect(await isBlocked(anna.id)).toBe(false);
  });

  it('adminisztrátor (a saját fiók is) nem tiltható le: 409 CONFLICT, nem változik', async () => {
    const otherAdmin = await createUser(prisma, undefined, { role: 'ADMIN' });

    for (const id of [admin.id, otherAdmin.id]) {
      const response = await patchUser(id, { isBlocked: true });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(await isBlocked(id)).toBe(false);
    }
  });

  it('a (közvetlenül az adatbázisban) letiltott admin feloldható', async () => {
    const blockedAdmin = await createUser(prisma, undefined, { role: 'ADMIN', isBlocked: true });

    expect((await patchUser(blockedAdmin.id, { isBlocked: false })).status).toBe(200);
    expect(await isBlocked(blockedAdmin.id)).toBe(false);
  });

  it('ismeretlen felhasználó 404, érvénytelen azonosító 400', async () => {
    expect((await patchUser(UNKNOWN_USER_ID, { isBlocked: true })).status).toBe(404);
    expect((await patchUser('abc', { isBlocked: true })).status).toBe(400);
  });

  it('hibás törzs (hiányzó, nem logikai érték, más mező, hibás JSON): 400, nem változik', async () => {
    const anna = await createUser(prisma, 'anna@photochain.test');

    for (const body of [{}, { isBlocked: 'true' }, { isBlocked: true, role: 'ADMIN' }]) {
      const response = await patchUser(anna.id, body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    const broken = await request(app)
      .patch(`/api/admin/users/${anna.id}`)
      .set('Cookie', adminCookie)
      .set('Content-Type', 'application/json')
      .send('{"isBlocked": tru');
    expect(broken.status).toBe(400);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: anna.id } });
    expect(stored).toMatchObject({ isBlocked: false, role: 'USER' });
  });

  it('a tiltás és a feloldás a naplóba kerül (ki, kit); az ismételt kérés nem ír újabb sort', async () => {
    const anna = await createUser(prisma, 'anna@photochain.test');
    const { target, lines } = appWithLog();

    await patchUser(anna.id, { isBlocked: true }, target).expect(200);
    await patchUser(anna.id, { isBlocked: true }, target).expect(200);
    await patchUser(anna.id, { isBlocked: false }, target).expect(200);

    const changes = logEntries(lines).filter((entry) => entry.userId === anna.id);
    expect(changes).toEqual([
      expect.objectContaining({ actorId: admin.id, isBlocked: true, level: 30 }),
      expect.objectContaining({ actorId: admin.id, isBlocked: false, level: 30 }),
    ]);
    // A napló nem tartalmazza a felhasználó e-mail-címét
    expect(lines.join('\n')).not.toContain('anna@photochain.test');
  });

  it('a letiltott felhasználó bejelentkezni sem tud, a feloldás után igen', async () => {
    const register = await request(app).post('/api/auth/register').send({
      email: 'cili@photochain.test',
      password: 'Hosszu-Jelszo-123',
      displayName: 'Cili',
    });
    const userId = register.body.data.user.id as string;
    const login = () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'cili@photochain.test', password: 'Hosszu-Jelszo-123' });

    await patchUser(userId, { isBlocked: true }).expect(200);
    const refused = await login();
    await patchUser(userId, { isBlocked: false }).expect(200);

    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('ACCOUNT_BLOCKED');
    expect((await login()).status).toBe(200);
  });
});
