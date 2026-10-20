// A kliens buildjének kiszolgálása (L31): a konténerben az Express adja a webes felületet is, ugyanarról
// az eredetről, mint az API-t (a Sec-Fetch-Site ellenőrzés és a süti ezt feltételezi). Adatbázis
// nélkül, egy ideiglenes „build” mappával.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../helpers/testApp.js';

const INDEX_HTML =
  '<!doctype html><html><body><div id="root">PhotoChain-kliens</div></body></html>';
const ASSET = 'assets/index-AbC123.js';
const PHOTO_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';

let clientDirectory: string;

beforeAll(() => {
  clientDirectory = mkdtempSync(join(tmpdir(), 'photochain-client-'));
  mkdirSync(join(clientDirectory, 'assets'));
  writeFileSync(join(clientDirectory, 'index.html'), INDEX_HTML);
  writeFileSync(join(clientDirectory, ASSET), 'console.log("app");');
  writeFileSync(join(clientDirectory, 'robots.txt'), 'User-agent: *\nDisallow: /api/\n');
  writeFileSync(join(clientDirectory, '.titok'), 'nem szolgálható ki');
});

afterAll(() => {
  rmSync(clientDirectory, { recursive: true, force: true });
});

const app = () => createTestApp({ CLIENT_DIST_DIR: clientDirectory });

describe('a kliens kiszolgálása (CLIENT_DIST_DIR)', () => {
  it('a kezdőlap az index.html, újraellenőrzéssel (no-cache) és biztonsági fejlécekkel', async () => {
    const response = await request(app()).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toBe(INDEX_HTML);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.headers['content-security-policy']).toContain("img-src 'self' data: blob:");
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it.each(['/verify', `/photos/${PHOTO_ID}`, '/admin', '/checkout/success?session_id=cs_test_x'])(
    'a kliens útvonala (%s) is az index.html-t kapja (SPA)',
    async (path) => {
      const response = await request(app()).get(path).set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.text).toBe(INDEX_HTML);
      expect(response.headers['cache-control']).toBe('no-cache');
    },
  );

  it('a tartalom szerint elnevezett (hash-elt) fájl egy évig tárolható, változtatás nélkül', async () => {
    const response = await request(app()).get(`/${ASSET}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('a többi statikus fájl (robots.txt) is kiszolgálható, újraellenőrzéssel', async () => {
    const response = await request(app()).get('/robots.txt');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Disallow: /api/');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('a hiányzó fájl (kiterjesztéssel) 404, nem az index.html – a hibás hivatkozás kiderül', async () => {
    for (const path of ['/assets/hianyzo.js', '/kep.png']) {
      const response = await request(app()).get(path);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('a rejtett (ponttal kezdődő) fájl nem szolgálható ki', async () => {
    expect((await request(app()).get('/.titok')).status).toBe(404);
  });

  // Az Express útválasztása kis- és nagybetű-független: a /API/… is az API-é (átnézés)
  it.each(['/api/nincs-ilyen', '/API/nincs-ilyen', '/media/nincs.jpg', '/Media/nincs', '/media'])(
    'a szerver útvonala (%s) JSON 404, nem az index.html',
    async (path) => {
      const response = await request(app()).get(path).set('Accept', 'text/html');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    },
  );

  // Átnézés: a hiányzó build már induláskor kiderüljön, ne minden oldalbetöltéskor 500-zal
  it('ha a mappában nincs index.html, már az összeállításkor hibát ad', () => {
    const empty = mkdtempSync(join(tmpdir(), 'photochain-client-ures-'));
    try {
      expect(() => createTestApp({ CLIENT_DIST_DIR: empty })).toThrow(/index\.html/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('csak GET és HEAD kap index.html-t; a más metódusú kérés 404', async () => {
    expect((await request(app()).head('/verify')).status).toBe(200);
    expect((await request(app()).post('/verify').send({})).status).toBe(404);
  });

  it('CLIENT_DIST_DIR nélkül (fejlesztéskor a Vite szolgálja ki) a kezdőlap 404', async () => {
    expect((await request(createTestApp()).get('/')).status).toBe(404);
  });
});
