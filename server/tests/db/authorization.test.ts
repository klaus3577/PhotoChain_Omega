// A jogosultság-ellenőrző middleware-ek (requireAuth, requireRole) tesztjei egy próbaalkalmazáson,
// a tesztadatbázis felhasználóival. (Adminisztrátori végpont csak az L16-ban készül.)
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createAuthMiddleware, getSessionUser } from '../../src/middleware/auth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import {
  sessionCookieFor,
  sessionCookieHeader,
  TEST_ENV,
  UNKNOWN_USER_ID,
} from '../helpers/testApp.js';
import { createTestPrisma, createUser, resetDatabase } from '../helpers/testDatabase.js';

let prisma: PrismaClient;
let app: Express;

function createProbeApp(): Express {
  const { requireAuth, requireRole, optionalAuth } = createAuthMiddleware({
    prisma,
    jwtSecret: TEST_ENV.JWT_SECRET,
  });
  const probe = express();
  probe.use(cookieParser());
  // Nyilvános útvonal, amely a bejelentkezett felhasználónak többet mutathat (pl. a kép adatlapja)
  probe.get('/optional', optionalAuth, (req, res) => {
    res.json({ data: { userId: req.user?.id ?? null } });
  });
  probe.get('/private', requireAuth, (req, res) => {
    res.json({ data: { user: getSessionUser(req) } });
  });
  // Hibás beállítás: a kezelő a bejelentkezett felhasználót kéri, de a requireAuth hiányzik
  probe.get('/user-only', (req, res) => {
    res.json({ data: { user: getSessionUser(req) } });
  });
  probe.get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => {
    res.json({ data: { ok: true } });
  });
  // Hibás beállítás: a szerepkör-ellenőrzés elől hiányzik a requireAuth
  probe.get('/role-only', requireRole('ADMIN'), (_req, res) => {
    res.json({ data: { ok: true } });
  });
  probe.use(errorHandler);
  return probe;
}

beforeAll(() => {
  prisma = createTestPrisma();
  app = createProbeApp();
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

const get = (path: string, userId?: string) => {
  const pending = request(app).get(path);
  return userId ? pending.set('Cookie', sessionCookieFor(userId)) : pending;
};

describe('requireAuth', () => {
  it('süti nélkül 401-es UNAUTHORIZED hibát ad', async () => {
    const response = await get('/private');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('érvényes sütivel a req.user-be teszi a felhasználót – a jelszó-hash nélkül', async () => {
    const user = await createUser(prisma, 'anna@photochain.test');

    const response = await get('/private', user.id);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: user.id,
      email: 'anna@photochain.test',
      displayName: user.displayName,
      bio: null,
      role: 'USER',
      createdAt: user.createdAt.toISOString(),
    });
  });

  it('tiltott felhasználót kizár: 403-as ACCOUNT_BLOCKED', async () => {
    const user = await createUser(prisma, undefined, { isBlocked: true });

    const response = await get('/private', user.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_BLOCKED');
  });
});

describe('getSessionUser', () => {
  it('requireAuth nélküli útvonalon 401-et ad, nem üres választ', async () => {
    const user = await createUser(prisma);

    const response = await get('/user-only', user.id);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe("requireRole('ADMIN')", () => {
  it('adminisztrátort beenged', async () => {
    const admin = await createUser(prisma, undefined, { role: 'ADMIN' });

    const response = await get('/admin', admin.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { ok: true } });
  });

  it('sima felhasználónak 403-as FORBIDDEN hibát ad', async () => {
    const user = await createUser(prisma);

    const response = await get('/admin', user.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('bejelentkezés nélkül 401-et ad (nem 403-at)', async () => {
    const response = await get('/admin');

    expect(response.status).toBe(401);
  });

  it('a szerepkört az adatbázisból veszi, nem a tokenből: a visszaminősítés azonnal érvényes', async () => {
    const admin = await createUser(prisma, undefined, { role: 'ADMIN' });
    await get('/admin', admin.id).expect(200);

    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    const response = await get('/admin', admin.id);

    expect(response.status).toBe(403);
  });

  it('tiltott adminisztrátort sem enged be', async () => {
    const admin = await createUser(prisma, undefined, { role: 'ADMIN', isBlocked: true });

    const response = await get('/admin', admin.id);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  it('requireAuth nélkül használva is elutasít (401), nem enged át senkit', async () => {
    const admin = await createUser(prisma, undefined, { role: 'ADMIN' });

    const response = await get('/role-only', admin.id);

    expect(response.status).toBe(401);
  });
});

describe('optionalAuth', () => {
  it('süti nélkül névtelen nézőként enged tovább (nincs 401)', async () => {
    const response = await get('/optional');

    expect(response.status).toBe(200);
    expect(response.body.data.userId).toBeNull();
  });

  it('érvényes sütivel a req.user-be teszi a felhasználót', async () => {
    const user = await createUser(prisma);

    const response = await get('/optional', user.id);

    expect(response.body.data.userId).toBe(user.id);
  });

  it('érvénytelen token, ismeretlen vagy letiltott felhasználó: névtelen (nem 401/403)', async () => {
    const blocked = await createUser(prisma, undefined, { isBlocked: true });

    const responses = [
      await request(app).get('/optional').set('Cookie', sessionCookieHeader('hamis.token')),
      await get('/optional', UNKNOWN_USER_ID),
      await get('/optional', blocked.id),
    ];

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.data.userId).toBeNull();
    }
  });
});
