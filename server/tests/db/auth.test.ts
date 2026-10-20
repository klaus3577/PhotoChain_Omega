// Az auth-végpontok tesztjei (Supertest) a tesztadatbázison: regisztráció, bejelentkezés,
// kijelentkezés, saját adatok (/auth/me) és az auth-végpontok szigorúbb sebességkorlátja.
import { compare, getRounds } from 'bcryptjs';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { seedDatabase } from '../../src/db/seed.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from '../../src/lib/jwt.js';
import { BCRYPT_COST, hashPassword } from '../../src/lib/password.js';
import { SESSION_COOKIE_NAME } from '../../src/lib/sessionCookie.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  sessionCookieHeader,
  TEST_ENV,
  UNKNOWN_USER_ID,
} from '../helpers/testApp.js';
import { createTestPrisma, createUser, resetDatabase } from '../helpers/testDatabase.js';

const ANNA = {
  email: 'anna@photochain.test',
  password: 'titkos-jelszo-123',
  displayName: 'Teszt Anna',
};
const CREDENTIALS = { email: ANNA.email, password: ANNA.password };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A válaszban várt felhasználó: jelszó, hash és tiltási állapot nélkül. */
const ANNA_PUBLIC = {
  id: expect.stringMatching(UUID_PATTERN),
  email: ANNA.email,
  displayName: ANNA.displayName,
  bio: null,
  role: 'USER',
  createdAt: expect.any(String),
};

let prisma: PrismaClient;
let app: Express;
/** Anna jelszavának hash-e – egyszer számoljuk ki, mert a bcrypt szándékosan lassú. */
let annaPasswordHash: string;

beforeAll(async () => {
  prisma = createTestPrisma();
  app = createTestApp({}, prisma);
  annaPasswordHash = await hashPassword(ANNA.password);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

const register = (body: object = ANNA) => request(app).post('/api/auth/register').send(body);
const login = (body: object = CREDENTIALS) => request(app).post('/api/auth/login').send(body);
const me = (cookieHeader: string) => request(app).get('/api/auth/me').set('Cookie', cookieHeader);

/** Anna már regisztrált fiókja, közvetlenül az adatbázisba írva (a regisztráció megkerülésével). */
const createAnna = (overrides: { isBlocked?: boolean } = {}) =>
  createUser(prisma, ANNA.email, {
    displayName: ANNA.displayName,
    passwordHash: annaPasswordHash,
    ...overrides,
  });

/** A válasz Set-Cookie fejlécéből a munkamenet-süti sora (ha a válasz beállítja). */
function sessionCookie(response: request.Response): string | undefined {
  return response.get('Set-Cookie')?.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

/** A munkamenet-süti értéke: maga a JWT. */
function sessionToken(response: request.Response): string {
  const [nameAndValue = ''] = sessionCookie(response)?.split(';') ?? [];
  return nameAndValue.slice(SESSION_COOKIE_NAME.length + 1);
}

describe('POST /api/auth/register', () => {
  it('sikeres regisztráció: 201, a felhasználó adatai jelszó nélkül, USER szerepkörrel', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { user: ANNA_PUBLIC } });
    expect(JSON.stringify(response.body)).not.toMatch(/password|titkos/i);
  });

  it('az adatbázisba a jelszó bcrypt-hash-e kerül (12-es költséggel), nem a jelszó', async () => {
    await register().expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: ANNA.email } });
    expect(user.passwordHash).not.toContain(ANNA.password);
    expect(getRounds(user.passwordHash)).toBe(BCRYPT_COST);
    await expect(compare(ANNA.password, user.passwordHash)).resolves.toBe(true);
  });

  it('azonnal be is jelentkeztet: a válasz beállítja a munkamenet-sütit', async () => {
    const agent = request.agent(app);

    const registered = await agent.post('/api/auth/register').send(ANNA).expect(201);
    const response = await agent.get('/api/auth/me');

    expect(sessionCookie(registered)).toMatch(/; HttpOnly/);
    expect(sessionCookie(registered)).toMatch(/; SameSite=Lax/);
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(ANNA.email);
  });

  it('az e-mail-címet kisbetűsítve, szóközök nélkül tárolja', async () => {
    const response = await register({ ...ANNA, email: '  Anna@PhotoChain.TEST ' });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe('anna@photochain.test');
    await expect(prisma.user.count({ where: { email: 'anna@photochain.test' } })).resolves.toBe(1);
  });

  it('foglalt e-mail-címre 409-es EMAIL_TAKEN hibát ad, sütit nem állít be', async () => {
    await createAnna();

    const response = await register({ ...ANNA, displayName: 'Másik Anna' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(sessionCookie(response)).toBeUndefined();
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it('a csak kis- és nagybetűben eltérő cím is foglaltnak számít', async () => {
    await createAnna();

    const response = await register({ ...ANNA, email: 'ANNA@PhotoChain.test' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('két egyidejű regisztráció közül ugyanarra a címre csak az egyik sikerül', async () => {
    // Nincs előzetes „létezik-e már?” lekérdezés: a versenyhelyzetet az egyedi index dönti el
    const responses = await Promise.all([register(), register()]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it('érvénytelen bemenetre 400-as VALIDATION_ERROR hibát ad, mezőnkénti részletekkel', async () => {
    const response = await register({ email: 'nem-email', password: 'rövid', displayName: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths.sort()).toEqual(['displayName', 'email', 'password']);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('vezérlőkaraktert (pl. NUL bájtot) tartalmazó névre 400-at ad, nem adatbázishibát (500)', async () => {
    // A PostgreSQL szöveges oszlopa nem tud NUL karaktert tárolni: ellenőrzés nélkül a beszúrás hibázna
    const response = await register({ ...ANNA, displayName: 'An\u0000na' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([
      { path: 'displayName', message: expect.any(String) },
    ]);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('a kérésben küldött szerepkört figyelmen kívül hagyja (adminként nem lehet regisztrálni)', async () => {
    const response = await register({ ...ANNA, role: 'ADMIN', isBlocked: true });

    expect(response.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ANNA.email } });
    expect(user.role).toBe('USER');
    expect(user.isBlocked).toBe(false);
  });

  it('törzs nélküli kérésre 400-as hibát ad', async () => {
    const response = await request(app).post('/api/auth/register');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('helyes adatokkal 200-as választ ad a felhasználó adataival', async () => {
    await createAnna();

    const response = await login();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user: ANNA_PUBLIC } });
  });

  it('a JWT-t httpOnly, SameSite=Lax sütiben adja, 7 napos érvényességgel', async () => {
    const anna = await createAnna();

    const response = await login();

    const cookie = sessionCookie(response);
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\/(;|$)/);
    expect(cookie).toContain(`; Max-Age=${SESSION_TTL_SECONDS};`);
    // Fejlesztéskor és tesztben HTTP-n fut a szerver, ezért ott nincs Secure jelző
    expect(cookie).not.toMatch(/; Secure/);
    expect(verifySessionToken(sessionToken(response), TEST_ENV.JWT_SECRET)).toBe(anna.id);
    // A token a válasz törzsében nem szerepel – JavaScriptből nem érhető el
    expect(JSON.stringify(response.body)).not.toContain(sessionToken(response));
  });

  it('élesben (NODE_ENV=production) a süti Secure jelzőt is kap, a törlésekor is', async () => {
    await createAnna();
    const productionApp = createTestApp({ NODE_ENV: 'production' }, prisma);

    const loggedIn = await request(productionApp).post('/api/auth/login').send(CREDENTIALS);
    const loggedOut = await request(productionApp).post('/api/auth/logout');

    expect(loggedIn.status).toBe(200);
    expect(sessionCookie(loggedIn)).toMatch(/; Secure/);
    expect(sessionCookie(loggedOut)).toMatch(/; Secure/);
  });

  it('rossz jelszóra 401-es INVALID_CREDENTIALS hibát ad, sütit nem állít be', async () => {
    await createAnna();

    const response = await login({ ...CREDENTIALS, password: 'rossz-jelszo' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('ismeretlen e-mail-címre ugyanazt a választ adja, mint rossz jelszóra', async () => {
    await createAnna();

    const wrongPassword = await login({ ...CREDENTIALS, password: 'rossz-jelszo' });
    const unknownEmail = await login({ email: 'nincs@photochain.test', password: ANNA.password });

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(sessionCookie(unknownEmail)).toBeUndefined();
  });

  it('az e-mail-cím kis- és nagybetűitől függetlenül beenged', async () => {
    await createAnna();

    const response = await login({ email: ' ANNA@PhotoChain.test ', password: ANNA.password });

    expect(response.status).toBe(200);
  });

  it('a seedelt adminisztrátor be tud jelentkezni, ADMIN szerepkörrel', async () => {
    const admin = { email: 'admin@photochain.test', password: 'admin-jelszo-123' };
    await seedDatabase(prisma, {
      adminEmail: admin.email,
      adminPassword: admin.password,
      demoPassword: 'demo-jelszo-123',
    });

    const response = await login(admin);

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ email: admin.email, role: 'ADMIN' });
  });

  it('tiltott felhasználót helyes jelszóval sem enged be: 403-as ACCOUNT_BLOCKED', async () => {
    await createAnna({ isBlocked: true });

    const response = await login();

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_BLOCKED');
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('a tiltás tényét csak a jelszó ismeretében árulja el', async () => {
    await createAnna({ isBlocked: true });

    const response = await login({ ...CREDENTIALS, password: 'rossz-jelszo' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('hiányos vagy nem szöveges mezőkre 400-as VALIDATION_ERROR hibát ad', async () => {
    const missing = await login({ email: ANNA.email });
    const wrongTypes = await login({ email: [ANNA.email], password: { $ne: '' } });

    for (const response of [missing, wrongTypes]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('GET /api/auth/me', () => {
  it('süti nélkül 200-at ad user: null-lal – a vendég induló ellenőrzése nem hiba (nem kerül a böngésző konzoljába, L26)', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user: null } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sessionCookie(response)).toBeUndefined();
  });

  it('érvénytelen vagy lejárt sütivel is user: null (a kliens kijelentkezett állapotba kerül), és a használhatatlan sütit törli', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=ervenytelen.token.ertek`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user: null } });
    // A böngésző nem küldözgeti tovább a lejárt sütit (a törlő süti: üres érték, múltbeli lejárat)
    expect(sessionCookie(response)).toMatch(
      new RegExp(`^${SESSION_COOKIE_NAME}=;.*Expires=Thu, 01 Jan 1970`),
    );
  });

  it('bejelentkezés után a saját adatokat adja, jelszó-hash nélkül', async () => {
    await createAnna();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(CREDENTIALS).expect(200);

    const response = await agent.get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { user: ANNA_PUBLIC } });
    // Személyes adat: a böngésző és a köztes proxyk nem tárolhatják
    expect(response.headers['cache-control']).toBe('no-store');
  });

  // A munkamenet-ellenőrzés a védett végponton (requireAuth): a /me ugyanezekre user: null-t ad
  const protectedWith = (cookieHeader: string) =>
    request(app).get('/api/me/photos').set('Cookie', cookieHeader);

  it('érvénytelen tokent tartalmazó sütivel a védett végpont 401-et ad, a /me user: null-t', async () => {
    const cookie = sessionCookieHeader('ez-nem-ervenyes-token');
    const response = await protectedWith(cookie);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    await me(cookie).expect(200, { data: { user: null } });
  });

  it('lejárt tokennel a védett végpont 401-et ad, a /me user: null-t', async () => {
    const user = await createUser(prisma);
    const expired = jwt.sign({}, TEST_ENV.JWT_SECRET, { subject: user.id, expiresIn: -60 });

    await protectedWith(sessionCookieHeader(expired)).expect(401);
    await me(sessionCookieHeader(expired)).expect(200, { data: { user: null } });
  });

  it('más titokkal aláírt (hamisított) tokennel a védett végpont 401-et ad, a /me user: null-t', async () => {
    const user = await createUser(prisma);
    const forged = signSessionToken(user.id, 'a-tamado-altal-valasztott-titkos-kulcs');

    await protectedWith(sessionCookieHeader(forged)).expect(401);
    await me(sessionCookieHeader(forged)).expect(200, { data: { user: null } });
  });

  it('már nem létező felhasználó érvényes tokenjével a védett végpont 401-et ad, a /me user: null-t', async () => {
    await protectedWith(sessionCookieFor(UNKNOWN_USER_ID)).expect(401);
    await me(sessionCookieFor(UNKNOWN_USER_ID)).expect(200, { data: { user: null } });
  });

  it('a bejelentkezés után letiltott felhasználót azonnal kizárja: 403-as ACCOUNT_BLOCKED', async () => {
    const user = await createUser(prisma);
    // A 200 önmagában a vendégé is lehet: a bejelentkezett állapotot a felhasználó adata igazolja
    const before = await me(sessionCookieFor(user.id)).expect(200);
    expect(before.body.data.user.id).toBe(user.id);

    await prisma.user.update({ where: { id: user.id }, data: { isBlocked: true } });
    const response = await me(sessionCookieFor(user.id));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_BLOCKED');
  });
});

describe('POST /api/auth/logout', () => {
  it('törli a munkamenet-sütit, utána a védett végpont 401-et ad', async () => {
    await createAnna();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(CREDENTIALS).expect(200);
    const session = await agent.get('/api/auth/me').expect(200);
    expect(session.body.data.user).toEqual(ANNA_PUBLIC);

    const response = await agent.post('/api/auth/logout');

    expect(response.status).toBe(204);
    expect(sessionCookie(response)).toMatch(
      new RegExp(`^${SESSION_COOKIE_NAME}=;.*Expires=Thu, 01 Jan 1970`),
    );
    await agent.get('/api/auth/me').expect(200, { data: { user: null } });
    await agent.get('/api/me/photos').expect(401);
  });

  it('bejelentkezés nélkül is 204-et ad (többször is hívható)', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(204);
  });
});

describe('az auth-végpontok szigorúbb sebességkorlátja', () => {
  it('a korlát túllépésekor 429-et ad a bejelentkezésre és a regisztrációra, másra nem', async () => {
    const limitedApp = createTestApp({ AUTH_RATE_LIMIT_MAX: 2 }, prisma);

    await request(limitedApp).post('/api/auth/login').send({}).expect(400);
    await request(limitedApp).post('/api/auth/register').send({}).expect(400);
    const blockedLogin = await request(limitedApp).post('/api/auth/login').send(CREDENTIALS);
    const blockedRegister = await request(limitedApp).post('/api/auth/register').send(ANNA);

    expect(blockedLogin.status).toBe(429);
    expect(blockedLogin.body.error.code).toBe('RATE_LIMITED');
    expect(blockedRegister.status).toBe(429);
    await expect(prisma.user.count()).resolves.toBe(0);
    // A többi végpontra csak az általános korlát vonatkozik
    await request(limitedApp).get('/api/health').expect(200);
    await request(limitedApp)
      .get('/api/auth/me')
      .expect(200, { data: { user: null } });
  });
});

// L30 (A07): az IP-korlát mellett fiókonként is: sok IP-címről elosztott jelszó-próbálgatás ellen
describe('a fiókonkénti sikertelen belépések korlátja', () => {
  const LOCKED_MESSAGE = 'Túl sok sikertelen belépés ehhez a fiókhoz – próbáld újra később';
  const wrongPassword = { ...CREDENTIALS, password: 'rossz-jelszo-123' };

  it('a korlát után a fiókba helyes jelszóval sem lehet belépni (429), más fiókba igen', async () => {
    await createAnna();
    await createUser(prisma, 'bela@photochain.test', { passwordHash: annaPasswordHash });
    const limitedApp = createTestApp({ LOGIN_ACCOUNT_RATE_LIMIT_MAX: 2 }, prisma);
    const loginTo = (body: object) => request(limitedApp).post('/api/auth/login').send(body);

    await loginTo(wrongPassword).expect(401);
    // A kis- és nagybetűk és a szóközök nem kerülik meg: ugyanaz a fiók
    await loginTo({ ...wrongPassword, email: ' ANNA@photochain.test ' }).expect(401);
    const locked = await loginTo(CREDENTIALS);

    expect(locked.status).toBe(429);
    expect(locked.body.error).toEqual({ code: 'RATE_LIMITED', message: LOCKED_MESSAGE });
    expect(sessionCookie(locked)).toBeUndefined();
    await loginTo({ email: 'bela@photochain.test', password: ANNA.password }).expect(200);
  });

  it('a sikeres belépés nem számít bele', async () => {
    await createAnna();
    const limitedApp = createTestApp({ LOGIN_ACCOUNT_RATE_LIMIT_MAX: 2 }, prisma);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(limitedApp).post('/api/auth/login').send(CREDENTIALS).expect(200);
    }
  });

  it('nem létező fióknál ugyanígy viselkedik (a 429-ből sem derül ki, van-e ilyen fiók)', async () => {
    const limitedApp = createTestApp({ LOGIN_ACCOUNT_RATE_LIMIT_MAX: 2 }, prisma);
    const unknown = { email: 'nincs@photochain.test', password: 'barmi-jelszo-1' };

    await request(limitedApp).post('/api/auth/login').send(unknown).expect(401);
    await request(limitedApp).post('/api/auth/login').send(unknown).expect(401);
    const locked = await request(limitedApp).post('/api/auth/login').send(unknown);

    expect(locked.status).toBe(429);
    expect(locked.body.error.message).toBe(LOCKED_MESSAGE);
  });

  it('a hibás (nem e-mail) bemenet nem fogyasztja más fiók keretét, és 400-at kap', async () => {
    await createAnna();
    const limitedApp = createTestApp({ LOGIN_ACCOUNT_RATE_LIMIT_MAX: 1 }, prisma);

    await request(limitedApp).post('/api/auth/login').send({ email: 42 }).expect(400);
    await request(limitedApp).post('/api/auth/login').send({}).expect(400);
    await request(limitedApp).post('/api/auth/login').send(CREDENTIALS).expect(200);
  });
});

// L30 (A09): a sikertelen és a tiltott fiókba irányuló belépés nyoma – e-mail-cím és jelszó nélkül
describe('a belépési kísérletek naplózása', () => {
  function appWithLog(): { target: Express; lines: Array<Record<string, unknown>> } {
    const lines: Array<Record<string, unknown>> = [];
    const chain = createTestChain(prisma);
    const target = createApp({
      env: TEST_ENV,
      logger: pino({ level: 'info' }, { write: (line: string) => lines.push(JSON.parse(line)) }),
      prisma,
      storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
      blockchain: chain.blockchain,
      photoRegistration: chain.photoRegistration,
      payments: createFakePayments().payments,
    });
    return { target, lines };
  }

  const securityEvents = (lines: Array<Record<string, unknown>>) =>
    lines.filter((line) => typeof line.event === 'string');

  it('a rossz jelszót a fiók azonosítójával, az ismeretlen címet fiók nélkül naplózza', async () => {
    const anna = await createAnna();
    const { target, lines } = appWithLog();

    await request(target)
      .post('/api/auth/login')
      .send({ ...CREDENTIALS, password: 'rossz-jelszo-123' })
      .expect(401);
    await request(target)
      .post('/api/auth/login')
      .send({ email: 'nincs@photochain.test', password: 'rossz-jelszo-123' })
      .expect(401);
    await request(target).post('/api/auth/login').send(CREDENTIALS).expect(200);

    expect(securityEvents(lines)).toMatchObject([
      { level: 40, event: 'login_failed', userId: anna.id },
      { level: 40, event: 'login_failed', userId: null },
    ]);
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain(ANNA.email);
    expect(logged).not.toContain('nincs@photochain.test');
    expect(logged).not.toContain('rossz-jelszo-123');
    expect(logged).not.toContain(ANNA.password);
  });

  it('a letiltott fiókba helyes jelszóval próbálkozást is naplózza', async () => {
    const anna = await createAnna({ isBlocked: true });
    const { target, lines } = appWithLog();

    await request(target).post('/api/auth/login').send(CREDENTIALS).expect(403);

    expect(securityEvents(lines)).toMatchObject([
      { level: 40, event: 'login_blocked', userId: anna.id },
    ]);
  });
});
