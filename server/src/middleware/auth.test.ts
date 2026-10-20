// A szerepkör-ellenőrzés (requireRole) egységtesztje adatbázis nélkül: a munkamenet felhasználóját a
// teszt állítja be. A hitelesítés többi része (süti, tiltás) a tests/db/auth.test.ts-ben van.
import express, { type Express } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { PrismaClient, Role } from '../generated/prisma/client.js';
import type { SessionUser } from '../lib/sessionUser.js';
import { createAuthMiddleware } from './auth.js';
import { errorHandler } from './errorHandler.js';

const ACTOR_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';

/** Próbaalkalmazás: a megadott szerepkörű felhasználó kéri az admin útvonalat; a napló tömbbe ír. */
function probe(role: Role): { app: Express; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  // A requireRole az adatbázist nem használja
  const { requireRole } = createAuthMiddleware({
    prisma: {} as PrismaClient,
    jwtSecret: 'hamis-teszt-jwt-titok-nem-valodi-kulcs',
  });
  const user: SessionUser = {
    id: ACTOR_ID,
    email: 'anna@photochain.test',
    displayName: 'Teszt Anna',
    bio: null,
    role,
    createdAt: new Date(),
  };
  const app = express();
  app.use((req, _res, next) => {
    req.user = user;
    req.log = pino({ level: 'info' }, { write: (line: string) => lines.push(JSON.parse(line)) });
    next();
  });
  app.get('/admin', requireRole('ADMIN'), (_req, res) => {
    res.json({ data: { ok: true } });
  });
  app.use(errorHandler);
  return { app, lines };
}

describe('requireRole', () => {
  it('a megfelelő szerepkörrel átenged, és nem naplóz', async () => {
    const { app, lines } = probe('ADMIN');

    await request(app).get('/admin').expect(200);

    expect(lines).toEqual([]);
  });

  // L30 (A09): az admin végpontok próbálgatása nyomon követhető – ki próbálkozott (e-mail nélkül)
  it('más szerepkörrel 403, és a próbálkozót figyelmeztetésként naplózza', async () => {
    const { app, lines } = probe('USER');

    const response = await request(app).get('/admin');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(lines).toMatchObject([
      { level: 40, event: 'forbidden_role', actorId: ACTOR_ID, requiredRoles: ['ADMIN'] },
    ]);
    expect(JSON.stringify(lines)).not.toContain('anna@photochain.test');
  });
});
