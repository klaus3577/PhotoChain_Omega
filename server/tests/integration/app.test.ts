// Végponttesztek (Supertest) adatbázis nélkül: állapotellenőrzés, biztonsági fejlécek,
// sebességkorlát, 404, és az auth-végpontok viselkedése érvénytelen sütinél, illetve adatbázishibánál.
// Forrás: Supertest README, https://github.com/ladjs/supertest (adaptálva)
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { SESSION_COOKIE_NAME } from '../../src/lib/sessionCookie.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import { createFakePayments } from '../helpers/fakePayments.js';
import { postWebhook, sendEvent, signatureFor, stripeEvent } from '../helpers/stripeEvents.js';
import {
  createTestApp,
  createTestChain,
  sessionCookieFor,
  sessionCookieHeader,
  TEST_ENV,
  UNKNOWN_USER_ID,
} from '../helpers/testApp.js';

const databaseDown = (): Promise<never> =>
  Promise.reject(new Error('belső részlet: megszakadt az adatbázis-kapcsolat'));
/** Olyan kliens, amelynek minden lekérdezése hibára fut (mintha az adatbázis leállt volna). */
const failingPrisma = {
  user: { create: databaseDown, findUnique: databaseDown },
} as unknown as PrismaClient;

describe('GET /api/health', () => {
  it('200-as választ és { data: { status: "ok" } } törzset ad', async () => {
    const response = await request(createTestApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ data: { status: 'ok' } });
  });

  it('biztonsági fejléceket küld (helmet), és nem árulja el, hogy Express fut', async () => {
    const response = await request(createTestApp()).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('a sebességkorlát szabványos fejléceit is elküldi', async () => {
    // A korlátozott API-útvonalakon (az állapotellenőrzés kimarad a korlátból, L32)
    const response = await request(createTestApp()).get('/api/nincs-ilyen');

    expect(response.headers['ratelimit-policy']).toBeDefined();
    expect(response.headers['ratelimit']).toBeDefined();
  });

  // L31: a kiszolgált kliens a feltöltendő kép előnézetét blob: URL-ről mutatja (L21)
  it('a CSP a blob: képeket is engedi; a http-re upgrade-insecure-requests nélkül', async () => {
    const csp = (await request(createTestApp()).get('/api/health')).headers[
      'content-security-policy'
    ];

    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("frame-ancestors 'self'");
    // A http://localhost-on futó konténerben a böngésző https-re írná át a saját kéréseit
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('https alatt (élesben) a CSP upgrade-insecure-requests-et is küld', async () => {
    const app = createTestApp({ APP_BASE_URL: 'https://photochain.example' });

    const csp = (await request(app).get('/api/health')).headers['content-security-policy'];

    expect(csp).toContain('upgrade-insecure-requests');
  });

  // L31 (OWASP HTTP Headers Cheat Sheet): a böngésző kamerát, mikrofont, helyadatot ne adjon az
  // oldalnak – a felület egyiket sem használja
  it('Permissions-Policy fejléccel letiltja a nem használt böngészőfunkciókat', async () => {
    const response = await request(createTestApp()).get('/api/health');

    expect(response.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
  });

  // L31 (L20): az API-válaszok alapból nem tárolhatók újraellenőrzés nélkül
  it('az API válasza alapból Cache-Control: no-cache', async () => {
    const response = await request(createTestApp()).get('/api/health');

    expect(response.headers['cache-control']).toBe('no-cache');
  });
});

// L31 (L08): a kliens IP-címe csak a megbízható proxyugrásokból jöhet – különben a hamis
// X-Forwarded-For fejléccel bárki új IP-címnek adhatná ki magát a korlátok előtt
describe('megbízható proxyugrások (TRUST_PROXY_HOPS)', () => {
  const twoClients = async (overrides: Parameters<typeof createTestApp>[0]) => {
    const app = createTestApp({ RATE_LIMIT_MAX: 1, ...overrides });
    // Adatbázis nélküli, korlátozott API-útvonal (az állapotellenőrzés kimarad a korlátból, L32)
    await request(app).get('/api/nincs-ilyen').set('X-Forwarded-For', '203.0.113.1').expect(404);
    return request(app).get('/api/nincs-ilyen').set('X-Forwarded-For', '203.0.113.2');
  };

  it('élesben alapból egy proxyt fogad el: a két „kliens” külön keretet kap', async () => {
    expect((await twoClients({ NODE_ENV: 'production' })).status).toBe(404);
  });

  it('TRUST_PROXY_HOPS=0 mellett (proxy nélküli konténer) a fejlécet figyelmen kívül hagyja', async () => {
    expect((await twoClients({ NODE_ENV: 'production', TRUST_PROXY_HOPS: 0 })).status).toBe(429);
  });

  it('fejlesztéskor alapból sem bízik a fejlécben', async () => {
    expect((await twoClients({})).status).toBe(429);
  });
});

describe('sebességkorlát', () => {
  it('a korlát túllépésekor 429-es RATE_LIMITED hibát ad', async () => {
    const app = createTestApp({ RATE_LIMIT_MAX: 2 });

    await request(app).get('/api/nincs-ilyen').expect(404);
    await request(app).get('/api/nincs-ilyen').expect(404);
    const response = await request(app).get('/api/nincs-ilyen');

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  // L32: a tárhely (Render) néhány másodpercenként ellenőrzi az állapotot – ez nem élheti fel a
  // keretet (különben a 429-es válasz miatt a szolgáltatást hibásnak látná)
  it('az állapotellenőrzés (GET /api/health) nem számít bele a korlátba', async () => {
    const app = createTestApp({ RATE_LIMIT_MAX: 1 });

    for (let check = 0; check < 3; check += 1) await request(app).get('/api/health').expect(200);

    await request(app).get('/api/nincs-ilyen').expect(404);
    await request(app).get('/api/nincs-ilyen').expect(429);
  });

  it('a hibás törzsű kérések is beleszámítanak: a korlát a törzs feldolgozása előtt áll', async () => {
    const app = createTestApp({ RATE_LIMIT_MAX: 2 });
    const malformed = () =>
      request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"hiányos": ');

    await malformed().expect(400);
    await malformed().expect(400);
    const response = await malformed();

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('érvénytelen munkamenet-süti', () => {
  const base64Url = (text: string): string => Buffer.from(text).toString('base64url');

  // Egyik sem jut el az adatbázisig (az alkalmazás kliense itt nem is kapcsolódik)
  it.each([
    ['nem JWT formájú szöveg', 'ez-nem-token'],
    // A jsonwebtoken itt SyntaxError-t dob – ebből sem lehet 500-as hiba
    [
      'érvényes fejléc, nem JSON törzs',
      `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url('ez-nem-json')}.x`,
    ],
    // A cookie-parser a „j:” kezdetű sütit objektummá alakítja
    ['JSON-süti (objektum, nem szöveg)', 'j:{"sub":"valaki"}'],
  ])(
    '%s → a védett végponton 401, a /me-n user: null és a süti törlése – nem 500',
    async (_name, cookieValue) => {
      const app = createTestApp();
      const cookie = sessionCookieHeader(cookieValue);

      const protectedResponse = await request(app).get('/api/me/photos').set('Cookie', cookie);
      const session = await request(app).get('/api/auth/me').set('Cookie', cookie);

      expect(protectedResponse.status).toBe(401);
      expect(protectedResponse.body.error.code).toBe('UNAUTHORIZED');
      expect(session.status).toBe(200);
      expect(session.body).toEqual({ data: { user: null } });
      expect(session.get('Set-Cookie')?.[0]).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=;`));
    },
  );
});

describe('kérésnapló', () => {
  it('a router alá csatolt útvonalat is teljes alakjában naplózza, a sikeres kérésnél is', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });
    const { blockchain, photoRegistration } = createTestChain(failingPrisma);
    const app = createApp({
      env: TEST_ENV,
      logger,
      prisma: failingPrisma,
      storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
      blockchain,
      photoRegistration,
      payments: createFakePayments().payments,
    });

    await request(app).post('/api/auth/logout').expect(204);
    await request(app).get('/api/auth/me').expect(200);

    // A napló a válasz lezárásakor íródik, ami a kliens válasza után is történhet
    await vi.waitFor(() => expect(lines).toHaveLength(2));
    const messages = lines.map((line) => (JSON.parse(line) as { msg: string }).msg);
    expect(messages[0]).toMatch(/^POST \/api\/auth\/logout → 204 \(\d+ ms\)$/);
    expect(messages[1]).toMatch(/^GET \/api\/auth\/me → 200 \(\d+ ms\)$/);
  });
});

// L32: a tárhely proxyláncának hossza (TRUST_PROXY_HOPS beállításához) – egyszer, IP-cím nélkül
describe('a proxylánc naplózása', () => {
  function appWithLog(overrides: Partial<typeof TEST_ENV> = {}) {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });
    const { blockchain, photoRegistration } = createTestChain(failingPrisma);
    const app = createApp({
      env: { ...TEST_ENV, ...overrides },
      logger,
      prisma: failingPrisma,
      storage: createLocalStorage(TEST_ENV.UPLOAD_DIR),
      blockchain,
      photoRegistration,
      payments: createFakePayments().payments,
    });
    return { app, lines };
  }

  /** A proxylánc-mérés naplósorai (a jelölt kérést az általános kérésnapló is naplózza) */
  const proxyChainEntries = (lines: string[]) =>
    lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry.event === 'proxy_chain');

  // L32 biztonsági átnézés: nem az első tetszőleges kérést naplózza (az lehet egy robot hamis
  // fejléccel), hanem a saját, jelölt mérőkérésünket (/api/health?proxy_probe), legfeljebb 10-szer
  it('csak a jelölt mérőkérésnél naplózza a bejegyzések számát, IP-cím nélkül', async () => {
    const { app, lines } = appWithLog({ TRUST_PROXY_HOPS: 2 });

    await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.9, 198.51.100.7');
    await request(app)
      .get('/api/health?proxy_probe=1')
      .set('X-Forwarded-For', '203.0.113.10, 198.51.100.8');
    // Fejléc nélkül: egyetlen proxy sem adott hozzá semmit
    await request(app).get('/api/health?proxy_probe=1');

    expect(proxyChainEntries(lines)).toEqual([
      expect.objectContaining({ forwardedForEntries: 2, trustedProxyHops: 2 }),
      expect.objectContaining({ forwardedForEntries: 0 }),
    ]);
    // A naplóba (a kérésnapló soraiba sem) IP-cím nem kerül
    expect(lines.join('')).not.toMatch(/203\.0\.113|198\.51\.100/);
  });

  it('a mérőkéréseket legfeljebb 10-szer naplózza (a napló nem árasztható el)', async () => {
    const { app, lines } = appWithLog();

    for (let probe = 0; probe < 12; probe += 1) {
      await request(app).get('/api/health?proxy_probe=1').set('X-Forwarded-For', '203.0.113.1');
    }

    expect(proxyChainEntries(lines)).toHaveLength(10);
  });
});

describe('adatbázishiba az auth-végpontokon', () => {
  const INTERNAL_ERROR = { error: { code: 'INTERNAL_ERROR', message: 'Váratlan szerverhiba' } };

  it('regisztrációnál 500-as hibát ad, a belső részletek nélkül', async () => {
    const response = await request(createTestApp({}, failingPrisma))
      .post('/api/auth/register')
      .send({ email: 'anna@photochain.test', password: 'titkos-jelszo', displayName: 'Anna' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
  });

  it('a védett végponton sem enged át senkit: 500, nem 200', async () => {
    const response = await request(createTestApp({}, failingPrisma))
      .get('/api/auth/me')
      .set('Cookie', sessionCookieFor(UNKNOWN_USER_ID));

    expect(response.status).toBe(500);
    expect(response.body).toEqual(INTERNAL_ERROR);
  });
});

describe('POST /api/webhooks/stripe – a köztes rétegek sorrendje (adatbázis nélkül)', () => {
  it('a nyers törzset kapja (a JSON-feldolgozó előtt fut): az érvényes aláírás átmegy, 200', async () => {
    // Ismeretlen eseménytípus: a feldolgozás adatbázis nélkül is véget ér
    const event = stripeEvent('customer.created', { id: 'cus_test_1', object: 'customer' });

    const response = await sendEvent(createTestApp(), event);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  it('a JSON-ként újraírt (pl. szóközökkel formázott) törzs aláírása már nem egyezik: 400', async () => {
    const event = stripeEvent('customer.created', { id: 'cus_test_1', object: 'customer' });
    const payload = JSON.stringify(event);

    const response = await postWebhook(
      createTestApp(),
      JSON.stringify(event, null, 2),
      signatureFor(payload),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_WEBHOOK');
  });

  it('a többi végpont továbbra is JSON-t kap (a webhook nyers feldolgozója csak a saját útvonalán fut)', async () => {
    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({ email: 'nem-email', password: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('ismeretlen útvonal', () => {
  it('404-es NOT_FOUND hibát ad egységes formában', async () => {
    const response = await request(createTestApp()).get('/api/nincs-ilyen');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Nem található: GET /api/nincs-ilyen' },
    });
  });
});
