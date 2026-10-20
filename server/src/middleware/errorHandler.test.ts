import { once } from 'node:events';
import { connect, type Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError } from '../lib/errors.js';
import {
  errorHandler,
  htmlErrorPage,
  MAX_DRAINED_BODY_BYTES,
  notFoundHandler,
} from './errorHandler.js';

interface RawConnection {
  socket: Socket;
  /** A szervertől eddig kapott bájtok szövegként */
  received: () => string;
  close: () => void;
}

/**
 * Nyers HTTP-kapcsolat: elküldi egy POST /hiba kérés fejléceit (a megadott törzsfejléccel), a
 * törzset viszont a teszt írja – így olyan kérés is küldhető, amelynek a törzse még nem ért véget.
 */
async function openRawPost(app: Express, bodyHeader: string): Promise<RawConnection> {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Nincs portszám');
  const socket = connect(address.port, '127.0.0.1');
  await once(socket, 'connect');
  let received = '';
  socket.on('data', (chunk: Buffer) => {
    received += chunk.toString('latin1');
  });
  socket.on('error', () => undefined);
  socket.write(`POST /hiba HTTP/1.1\r\nHost: localhost\r\n${bodyHeader}\r\n\r\n`);
  return {
    socket,
    received: () => received,
    close: () => {
      socket.destroy();
      server.closeAllConnections();
      server.close();
    },
  };
}

/** Egy minimális alkalmazás, amelynek a /hiba útvonala a megadott hibát dobja. */
function appThatThrows(error: unknown): Express {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.get('/hiba', () => {
    throw error;
  });
  app.post('/hiba', () => {
    throw error;
  });
  app.post('/visszhang', (req, res) => {
    res.json(req.body);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('az AppError státuszát és kódját egységes formában adja vissza', async () => {
    const app = appThatThrows(new AppError(409, 'CONFLICT', 'Már létezik'));

    const response = await request(app).get('/hiba');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: 'CONFLICT', message: 'Már létezik' } });
  });

  it('a Zod-hibát 400-as VALIDATION_ERROR-rá alakítja a hibás mezők listájával', async () => {
    const zodError = z.object({ title: z.string() }).safeParse({}).error;
    const app = appThatThrows(zodError);

    const response = await request(app).get('/hiba');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([{ path: 'title', message: expect.any(String) }]);
  });

  it('ismeretlen hibánál 500-as INTERNAL_ERROR-t ad, a belső részletek kiszivárgása nélkül', async () => {
    const app = appThatThrows(new Error('belső részlet: adatbázis-jelszó'));

    const response = await request(app).get('/hiba');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Váratlan szerverhiba' },
    });
  });

  // Pl. az Express a hibás %-kódolású útvonal-paraméternél (GET /api/verify/%zz) 400-as státuszú
  // hibát dob – ez a kliens hibája, nem szerverhiba
  it('a 400-as státuszú (http-errors) hibát 400-as VALIDATION_ERROR-rá alakítja, hibanapló nélkül', async () => {
    const decodeError = Object.assign(new URIError("Failed to decode param '%zz'"), {
      status: 400,
      statusCode: 400,
    });

    const response = await request(appThatThrows(decodeError)).get('/hiba');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Érvénytelen kérés' },
    });
  });

  // Csak az Express URIError-ja: egy tetszőleges, 400-as státuszt hordozó belső hiba ne tűnjön el
  // kliens-hibaként a naplóból
  it('a más, 400-as státuszt hordozó hibát továbbra is váratlan szerverhibának veszi', async () => {
    const internal = Object.assign(new Error('belső hiba'), { status: 400 });

    const response = await request(appThatThrows(internal)).get('/hiba');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('503-nál Retry-After fejlécet küld: alapból 5 másodperc, az AppError megadhat mást', async () => {
    const busy = await request(appThatThrows(new AppError(503, 'SERVER_BUSY', 'Foglalt'))).get(
      '/hiba',
    );
    const paused = await request(
      appThatThrows(
        new AppError(503, 'CHAIN_UNAVAILABLE', 'Nem érhető el', undefined, {
          retryAfterSeconds: 42,
        }),
      ),
    ).get('/hiba');

    expect(busy.headers['retry-after']).toBe('5');
    expect(paused.headers['retry-after']).toBe('42');
  });

  it('a korábban (pl. a sebességkorláttól) beállított Retry-After fejlécet nem írja felül', async () => {
    const app = express();
    app.get('/hiba', (_req, res) => {
      res.set('Retry-After', '600');
      throw new AppError(503, 'SERVER_BUSY', 'Foglalt');
    });
    app.use(errorHandler);

    const response = await request(app).get('/hiba');

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('600');
  });

  // Pl. lejárt munkamenettel indított képfeltöltés: a kérést már a fejlécei alapján elutasítjuk,
  // miközben a kliens még küldi a fájlt. A válasznak ilyenkor is meg kell érkeznie – a kapcsolat
  // bontása (ECONNRESET) helyett.
  it('a törzs beolvasása előtt elutasított, nagy törzsű kérésre is megérkezik a hibaválasz', async () => {
    const app = appThatThrows(new AppError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'));

    const response = await request(app)
      .post('/hiba')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(2_000_000));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  describe('a be nem olvasott törzs kezelése (nyers kapcsolaton, a törzs egy részét elküldve)', () => {
    const unauthorized = (): Express =>
      appThatThrows(new AppError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'));

    it('a bejelentett hosszon belül megvárja a törzs végét, és csak utána válaszol', async () => {
      const connection = await openRawPost(unauthorized(), 'Content-Length: 10000');
      connection.socket.write(Buffer.alloc(4000));
      await sleep(150);
      expect(connection.received()).toBe('');

      connection.socket.write(Buffer.alloc(6000));

      await vi.waitFor(() => expect(connection.received()).toMatch(/^HTTP\/1\.1 401 /));
      connection.close();
    });

    // Korlátlanul nem olvasunk: a túl nagy (vagy ismeretlen hosszú) törzset nem várjuk meg
    it.each([
      ['a korlátnál nagyobb bejelentett hossz', `Content-Length: ${MAX_DRAINED_BODY_BYTES + 1}`],
      ['ismeretlen hossz (darabolt átvitel)', 'Transfer-Encoding: chunked'],
    ])('%s: azonnal válaszol', async (_name, header) => {
      const connection = await openRawPost(unauthorized(), header);

      await vi.waitFor(() => expect(connection.received()).toMatch(/^HTTP\/1\.1 401 /));
      connection.close();
    });
  });

  it('ha a válasz küldése már elkezdődött, nem próbál újat küldeni: az eredeti hibát adja tovább', async () => {
    const original = new Error('menet közben elromlott');
    const forwarded: unknown[] = [];
    const app = express();
    app.get('/felig', (_req, res) => {
      res.write('a válasz eleje');
      throw original;
    });
    app.use(errorHandler);
    // Az Express alapértelmezett kezelője előtt: mit kapott tovább a hibakezelő?
    app.use((error: unknown, _req: Request, _res: Response, next: NextFunction) => {
      forwarded.push(error);
      next(error);
    });

    // Az Express alapértelmezett kezelője bontja a kapcsolatot
    await expect(request(app).get('/felig')).rejects.toThrow();

    // Új válasz küldésének kísérlete ERR_HTTP_HEADERS_SENT hibát adott volna tovább
    expect(forwarded).toEqual([original]);
  });

  describe('naplózás', () => {
    /** Próbaalkalmazás, amelynek a kérésnaplója (req.log) egy tömbbe ír. */
    function appWithLog(error: unknown) {
      const lines: { level: number; msg: string }[] = [];
      const logger = pino(
        { level: 'info' },
        { write: (line: string) => lines.push(JSON.parse(line)) },
      );
      const app = express();
      app.use((req, _res, next) => {
        req.log = logger;
        next();
      });
      app.get('/hiba', () => {
        throw error;
      });
      app.use(errorHandler);
      return { app, lines };
    }

    it('a váratlan hibát (500) naplózza', async () => {
      const { app, lines } = appWithLog(new Error('belső részlet'));

      await request(app).get('/hiba').expect(500);

      expect(lines).toMatchObject([{ msg: 'Váratlan szerverhiba' }]);
    });

    // A könyvtárak (body-parser, http-errors) kliens-hibái (4xx, expose) – pl. a megszakított vagy
    // a bejelentettnél rövidebb törzs – nem szerverhibák: 400, hibanapló nélkül (L30)
    it.each([
      Object.assign(new Error('request aborted'), {
        status: 400,
        expose: true,
        type: 'request.aborted',
      }),
      Object.assign(new Error('request size did not match content length'), {
        status: 400,
        expose: true,
        type: 'request.size.invalid',
      }),
      Object.assign(new Error('incorrect header check'), { status: 400, expose: true }),
    ])('a könyvtár kliens-hibáját (%s) 400-zal adja vissza, hibanapló nélkül', async (error) => {
      const { app, lines } = appWithLog(error);

      const response = await request(app).get('/hiba');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Érvénytelen kérés' },
      });
      expect(lines).toEqual([]);
    });

    // A ki nem tehető (expose nélküli) vagy 5xx státuszú hiba továbbra is váratlan szerverhiba
    it.each([
      Object.assign(new Error('belső 400'), { status: 400 }),
      Object.assign(new Error('stream not readable'), { status: 500, expose: false }),
      // Nem is objektum: egy könyvtár szöveget dob hiba helyett
      'szövegként dobott hiba',
    ])('a nem kliensnek szóló hibát (%s) 500-zal adja és naplózza', async (error) => {
      const { app, lines } = appWithLog(error);

      await request(app).get('/hiba').expect(500);

      expect(lines).toMatchObject([{ msg: 'Váratlan szerverhiba' }]);
    });

    // A szándékos 503 (túlterhelés) és a kliens hibái nem „váratlan szerverhibák”
    it.each([
      new AppError(503, 'SERVER_BUSY', 'A szerver most foglalt'),
      new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet'),
    ])('a szándékos AppError-t (%s) nem naplózza hibaként', async (error) => {
      const { app, lines } = appWithLog(error);

      await request(app).get('/hiba').expect(error.statusCode);

      expect(lines).toEqual([]);
    });
  });

  it('hibás JSON-törzsre 400-as INVALID_JSON hibát ad', async () => {
    const response = await request(appThatThrows(null))
      .post('/visszhang')
      .set('Content-Type', 'application/json')
      .send('{"hiányos": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('nem támogatott karakterkészletre vagy tömörítésre 415-öt ad, nem 500-at', async () => {
    const app = appThatThrows(null);

    const charset = await request(app)
      .post('/visszhang')
      .set('Content-Type', 'application/json; charset=nincs-ilyen')
      .send('{}');
    const encoding = await request(app)
      .post('/visszhang')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'nincs-ilyen')
      .send('{}');

    for (const response of [charset, encoding]) {
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
  });

  // A gzip-ként bejelentett, de sérült törzs (zlib-hiba) a kliens hibája: 400, nem 500 (L30)
  it('sérült tömörített (gzip) törzsre 400-at ad, nem szerverhibát', async () => {
    const response = await request(appThatThrows(null))
      .post('/visszhang')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('ez nem gzip');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Érvénytelen kérés' });
  });

  it('túl nagy törzsre 413-as PAYLOAD_TOO_LARGE hibát ad', async () => {
    const response = await request(appThatThrows(null))
      .post('/visszhang')
      .send({ szoveg: 'x'.repeat(2048) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('htmlErrorPage – a böngésző közvetlen navigációja olvasható hibaoldalt kap', () => {
  /** A /oldal útvonal kéri a hibaoldalt (pl. a letöltés), a /json nem; mindkettő a megadott hibát dobja. */
  function appWithErrorPage(error: unknown): Express {
    const app = express();
    app.get(
      '/oldal',
      htmlErrorPage(() => ({ title: 'A letöltés nem sikerült', backHref: '/photos/abc' })),
      () => {
        throw error;
      },
    );
    app.get('/json', () => {
      throw error;
    });
    app.use(errorHandler);
    return app;
  }

  const navigate = (app: Express, path = '/oldal') =>
    request(app).get(path).set('Sec-Fetch-Dest', 'document');

  it('navigációnál HTML-oldal: a státusz és az üzenet megmarad, a visszalink a megadott helyre mutat', async () => {
    const response = await navigate(
      appWithErrorPage(new AppError(403, 'FORBIDDEN', 'Ezt a képet nem töltheted le')),
    );

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.text).toContain('<html lang="hu">');
    expect(response.text).toContain('<h1>A letöltés nem sikerült</h1>');
    expect(response.text).toContain('Ezt a képet nem töltheted le');
    expect(response.text).toContain('<a href="/photos/abc">');
    expect(response.text).not.toContain('/login');
  });

  it('lejárt munkamenetnél (401) a bejelentkezésre is mutat', async () => {
    const response = await navigate(
      appWithErrorPage(new AppError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges')),
    );

    expect(response.status).toBe(401);
    expect(response.text).toContain('<a href="/login">');
    expect(response.text).toContain('<a href="/photos/abc">');
  });

  it('a szövegek HTML-ként nem értelmeződnek (escape)', async () => {
    const response = await navigate(
      appWithErrorPage(new AppError(404, 'NOT_FOUND', '<script>alert(1)</script> & "x"')),
    );

    expect(response.text).not.toContain('<script>');
    expect(response.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  it('a Retry-After fejléc megmarad (pl. túl sok párhuzamos letöltés)', async () => {
    const error = new AppError(429, 'RATE_LIMITED', 'Túl sok letöltés', undefined, {
      retryAfterSeconds: 7,
    });

    const response = await navigate(appWithErrorPage(error));

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('7');
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });

  it('váratlan hibánál az általános üzenet – a belső hiba szövege nem kerül az oldalra', async () => {
    const response = await navigate(appWithErrorPage(new Error('belső részlet')));

    expect(response.status).toBe(500);
    expect(response.text).toContain('Váratlan szerverhiba');
    expect(response.text).not.toContain('belső részlet');
  });

  it('nem navigációs kérésre (fetch, curl) és a hibaoldalt nem kérő útvonalon marad a JSON', async () => {
    const error = new AppError(403, 'FORBIDDEN', 'Ezt a képet nem töltheted le');

    const fetched = await request(appWithErrorPage(error)).get('/oldal');
    const elsewhere = await navigate(appWithErrorPage(error), '/json');

    for (const response of [fetched, elsewhere]) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'Ezt a képet nem töltheted le' },
      });
    }
  });
});

describe('notFoundHandler', () => {
  it('ismeretlen útvonalra 404-es NOT_FOUND hibát ad', async () => {
    const response = await request(appThatThrows(null)).delete('/semmi');

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Nem található: DELETE /semmi',
    });
  });
});
