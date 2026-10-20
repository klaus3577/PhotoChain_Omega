// A galéria (GET /api/photos) és a kategóriák (GET /api/categories) végponttesztjei a
// tesztadatbázison: csak a nyilvános képek, szűrők, keresés, rendezés, lapozás (meta) és a hibás
// query-paraméterek (400, soha 500).
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createTestApp } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  type PhotoFixture,
  resetDatabase,
} from '../helpers/testDatabase.js';

let prisma: PrismaClient;
let app: Express;
let owner: { id: string; email: string };
let categoryId: number;

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
  owner = await createUser(prisma, undefined, { displayName: 'Kiss Fanni' });
  categoryId = (await createCategory(prisma)).id;
});

/** A galéria lekérése a megadott query-paraméterekkel (bejelentkezés nélkül). */
const list = (query: Record<string, string> = {}) => request(app).get('/api/photos').query(query);

const titlesOf = (response: request.Response): string[] =>
  response.body.data.photos.map((photo: { title: string }) => photo.title);

const idsOf = (response: request.Response): string[] =>
  response.body.data.photos.map((photo: { id: string }) => photo.id);

/** A tulajdonos képe – alapból nyilvános (REGISTERED) –, a megadott eltérésekkel. */
const addPhoto = (fixture: Partial<PhotoFixture> = {}) =>
  createPhoto(prisma, { ownerId: owner.id, categoryId, status: 'REGISTERED', ...fixture });

/** Időpont 2026 októberének megadott napján – a rendezési tesztekhez. */
const onDay = (day: number): Date => new Date(Date.UTC(2026, 9, day, 10));

describe('GET /api/photos – csak a nyilvános képek', () => {
  it('csak a regisztrált képeket adja: a függő, a sikertelen és az elrejtett nem látszik', async () => {
    await addPhoto({ title: 'Látható' });
    await addPhoto({ title: 'Függő', status: 'PENDING_CHAIN' });
    await addPhoto({ title: 'Sikertelen', status: 'CHAIN_FAILED' });
    await addPhoto({ title: 'Rejtett', status: 'HIDDEN', registeredAt: onDay(1) });

    const response = await list();

    expect(response.status).toBe(200);
    expect(titlesOf(response)).toEqual(['Látható']);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });

  it('a lista eleme a galéria adatai – e-mail, jelszó-hash és tárhelykulcs nélkül', async () => {
    const photo = await addPhoto({ title: 'Naplemente', priceHuf: 4200, createdAt: onDay(2) });
    const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });

    const response = await list();

    expect(response.body.data.photos).toEqual([
      {
        id: photo.id,
        title: 'Naplemente',
        priceHuf: 4200,
        status: 'REGISTERED',
        width: 4000,
        height: 3000,
        thumbnailUrl: `/media/${photo.thumbnailKey}`,
        category: { id: category.id, name: category.name, slug: category.slug },
        owner: { id: owner.id, displayName: 'Kiss Fanni' },
        createdAt: onDay(2).toISOString(),
        rating: { average: null, count: 0 },
      },
    ]);
    const body = JSON.stringify(response.body);
    for (const secret of [owner.email, 'passwordHash', 'nem-valodi-hash', photo.originalKey]) {
      expect(body).not.toContain(secret);
    }
    // Semmilyen tárhelykulcs (originalKey, previewKey, thumbnailKey) nem szerepel mezőnévként
    expect(body).not.toContain('Key":');
  });

  it('üres galériánál üres lista: total 0, totalPages 0', async () => {
    const response = await list();

    expect(response.body).toEqual({
      data: { photos: [] },
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  it('a lista eleme a kép értékeléseinek átlagát és számát is adja – a letiltott szerzőé nélkül (L16)', async () => {
    const rated = await addPhoto({ title: 'Értékelt', createdAt: onDay(2) });
    await addPhoto({ title: 'Értékeletlen', createdAt: onDay(1) });
    const authors = [
      await createUser(prisma),
      await createUser(prisma),
      await createUser(prisma, undefined, { isBlocked: true }),
    ];
    for (const [index, rating] of [5, 4, 1].entries()) {
      await prisma.review.create({
        data: { authorId: authors[index]!.id, photoId: rated.id, rating },
      });
    }

    const response = await list();

    expect(
      response.body.data.photos.map(({ title, rating }: { title: string; rating: unknown }) => [
        title,
        rating,
      ]),
    ).toEqual([
      ['Értékelt', { average: 4.5, count: 2 }],
      ['Értékeletlen', { average: null, count: 0 }],
    ]);
  });
});

/** A Prisma-kliens $transaction hívásainak beállításait (pl. az elkülönítési szintet) feljegyzi. */
function observingTransactions(client: PrismaClient, options: unknown[]): PrismaClient {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      if (property !== '$transaction') return value.bind(target);
      return (...args: unknown[]) => {
        options.push(args[1]);
        return value.apply(target, args);
      };
    },
  });
}

describe('GET /api/photos – lapozás és meta', () => {
  it('a találatok száma és az oldal ugyanabból a pillanatképből jön (REPEATABLE READ)', async () => {
    await addPhoto({ title: 'Tócsa' });
    const options: unknown[] = [];

    const response = await request(createTestApp({}, observingTransactions(prisma, options))).get(
      '/api/photos',
    );

    expect(response.body.meta.total).toBe(1);
    expect(options).toEqual([{ isolationLevel: 'RepeatableRead' }]);
  });

  it('alapból 20 kép oldalanként; a meta: page, pageSize, total, totalPages', async () => {
    for (let day = 1; day <= 25; day += 1) await addPhoto({ createdAt: onDay(day) });

    const first = await list();
    const second = await list({ page: '2' });
    const beyond = await list({ page: '3' });

    expect(first.body.data.photos).toHaveLength(20);
    expect(first.body.meta).toEqual({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
    expect(second.body.data.photos).toHaveLength(5);
    expect(second.body.meta).toEqual({ page: 2, pageSize: 20, total: 25, totalPages: 2 });
    // Az utolsó utáni oldal nem hiba: üres lista – a meta alapján a kliens visszaléphet
    expect(beyond.status).toBe(200);
    expect(beyond.body.data.photos).toEqual([]);
    expect(beyond.body.meta).toEqual({ page: 3, pageSize: 20, total: 25, totalPages: 2 });
  });

  it('az oldalak átfedés és kihagyás nélkül adják ki az összes képet', async () => {
    const created: string[] = [];
    for (let day = 1; day <= 7; day += 1)
      created.push((await addPhoto({ createdAt: onDay(day) })).id);

    const pages = [];
    for (const page of ['1', '2', '3']) pages.push(await list({ page, pageSize: '3' }));

    expect(pages.map((response) => idsOf(response).length)).toEqual([3, 3, 1]);
    expect(pages.flatMap((response) => idsOf(response))).toEqual(created.toReversed());
    expect(pages[0]?.body.meta).toEqual({ page: 1, pageSize: 3, total: 7, totalPages: 3 });
  });

  it('a legnagyobb oldalméret 50', async () => {
    const response = await list({ pageSize: '50' });

    expect(response.status).toBe(200);
    expect(response.body.meta.pageSize).toBe(50);
  });
});

describe('GET /api/photos – szűrők', () => {
  it('kategória szerint; ismeretlen kategóriára üres lista (nem hiba)', async () => {
    const other = await createCategory(prisma);
    await addPhoto({ title: 'Első kategória' });
    await addPhoto({ title: 'Másik kategória', categoryId: other.id });

    expect(titlesOf(await list({ categoryId: String(other.id) }))).toEqual(['Másik kategória']);
    expect(titlesOf(await list({ categoryId: '9999' }))).toEqual([]);
  });

  it('fotós szerint (a profiloldal képei)', async () => {
    const other = await createUser(prisma, undefined, { displayName: 'Nagy Károly' });
    await addPhoto({ title: 'Fanni képe' });
    await addPhoto({ title: 'Károly képe', ownerId: other.id });

    expect(titlesOf(await list({ ownerId: other.id }))).toEqual(['Károly képe']);
  });

  it('ár szerint: a minimum és a maximum is beleszámít (zárt intervallum)', async () => {
    for (const priceHuf of [0, 1000, 2500, 5000]) {
      await addPhoto({ title: `${priceHuf} Ft`, priceHuf });
    }
    const byPrice = (query: Record<string, string>) => list({ ...query, sort: 'price_asc' });

    expect(titlesOf(await byPrice({ minPrice: '1000', maxPrice: '2500' }))).toEqual([
      '1000 Ft',
      '2500 Ft',
    ]);
    expect(titlesOf(await byPrice({ minPrice: '2500' }))).toEqual(['2500 Ft', '5000 Ft']);
    expect(titlesOf(await byPrice({ maxPrice: '0' }))).toEqual(['0 Ft']);
    expect(titlesOf(await byPrice({ minPrice: '2500', maxPrice: '2500' }))).toEqual(['2500 Ft']);
  });

  it('a szűrők együtt is működnek (és-kapcsolat); a meta a szűrt találatokat számolja', async () => {
    const other = await createCategory(prisma);
    await addPhoto({ title: 'Hó télen', priceHuf: 1000, categoryId: other.id });
    await addPhoto({ title: 'Hó tavasszal', priceHuf: 9000, categoryId: other.id });
    await addPhoto({ title: 'Hó ősszel', priceHuf: 1000 });
    await addPhoto({ title: 'Erdő', priceHuf: 1000, categoryId: other.id });

    const response = await list({ q: 'hó', categoryId: String(other.id), maxPrice: '5000' });

    expect(titlesOf(response)).toEqual(['Hó télen']);
    expect(response.body.meta.total).toBe(1);
  });
});

describe('GET /api/photos – keresés (q)', () => {
  it('kis- és nagybetűtől független részszöveg-keresés a címben, ékezetes betűkkel is', async () => {
    await addPhoto({ title: 'Árvíztűrő tükörfúrógép' });
    await addPhoto({ title: 'Naplemente' });

    expect(titlesOf(await list({ q: 'TÜKÖR' }))).toEqual(['Árvíztűrő tükörfúrógép']);
    expect(titlesOf(await list({ q: 'árvíz' }))).toEqual(['Árvíztűrő tükörfúrógép']);
    expect(titlesOf(await list({ q: 'naple' }))).toEqual(['Naplemente']);
  });

  it('a leírásban és a fotós nevében is keres', async () => {
    const other = await createUser(prisma, undefined, { displayName: 'Nagy Károly' });
    await addPhoto({ title: 'Tócsa', description: 'Eső után az udvaron' });
    await addPhoto({ title: 'Gyertyák', ownerId: other.id });

    expect(titlesOf(await list({ q: 'UDVAR' }))).toEqual(['Tócsa']);
    expect(titlesOf(await list({ q: 'károly' }))).toEqual(['Gyertyák']);
    expect(titlesOf(await list({ q: 'fanni' }))).toEqual(['Tócsa']);
  });

  it('a %, a _ és a \\ nem helyettesítő karakter, hanem szó szerint értendő', async () => {
    await addPhoto({ title: 'Szezon 100% természetes' });
    await addPhoto({ title: 'Szezon 1000 természetes' });
    await addPhoto({ title: 'kep_1 eredeti' });
    await addPhoto({ title: 'kepA1 másolat' });
    await addPhoto({ title: 'C:\\fotok\\tocsa' });

    expect(titlesOf(await list({ q: '100%' }))).toEqual(['Szezon 100% természetes']);
    expect(titlesOf(await list({ q: '%' }))).toEqual(['Szezon 100% természetes']);
    expect(titlesOf(await list({ q: 'kep_1' }))).toEqual(['kep_1 eredeti']);
    expect(titlesOf(await list({ q: '_' }))).toEqual(['kep_1 eredeti']);
    expect(titlesOf(await list({ q: '\\' }))).toEqual(['C:\\fotok\\tocsa']);
  });

  it('a csak szóközökből álló keresőszó nem szűr', async () => {
    await addPhoto({ title: 'Tócsa' });

    expect(titlesOf(await list({ q: '   ' }))).toEqual(['Tócsa']);
  });

  it('a keresés is csak a nyilvános képek között talál', async () => {
    await addPhoto({ title: 'Rejtett tócsa', status: 'HIDDEN' });
    await addPhoto({ title: 'Függő tócsa', status: 'PENDING_CHAIN' });

    expect(titlesOf(await list({ q: 'tócsa' }))).toEqual([]);
  });
});

describe('GET /api/photos – rendezés', () => {
  beforeEach(async () => {
    await addPhoto({ title: 'Régi drága', priceHuf: 3000, createdAt: onDay(1) });
    await addPhoto({ title: 'Középső olcsó', priceHuf: 1000, createdAt: onDay(2) });
    await addPhoto({ title: 'Új közepes árú', priceHuf: 2000, createdAt: onDay(3) });
  });

  it('alapból a legújabb elöl (newest); oldest: a legrégebbi elöl', async () => {
    const newest = ['Új közepes árú', 'Középső olcsó', 'Régi drága'];

    expect(titlesOf(await list())).toEqual(newest);
    expect(titlesOf(await list({ sort: 'newest' }))).toEqual(newest);
    expect(titlesOf(await list({ sort: 'oldest' }))).toEqual(newest.toReversed());
  });

  it('ár szerint növekvő (price_asc) és csökkenő (price_desc) sorrend', async () => {
    const cheapestFirst = ['Középső olcsó', 'Új közepes árú', 'Régi drága'];

    expect(titlesOf(await list({ sort: 'price_asc' }))).toEqual(cheapestFirst);
    expect(titlesOf(await list({ sort: 'price_desc' }))).toEqual(cheapestFirst.toReversed());
  });
});

describe('GET /api/photos – stabil rendezés döntetlennél', () => {
  it.each([
    ['newest', 'csökkenő'],
    ['oldest', 'növekvő'],
    ['price_asc', 'növekvő'],
    ['price_desc', 'csökkenő'],
  ])(
    '%s: egyenlő értéknél az azonosító dönt (%s) – lapozva is ugyanaz a sorrend',
    async (sort, order) => {
      const ids: string[] = [];
      for (let index = 0; index < 6; index += 1) {
        ids.push((await addPhoto({ priceHuf: 1000, createdAt: onDay(1) })).id);
      }
      const ascending = ids.toSorted();
      const expected = order === 'növekvő' ? ascending : ascending.toReversed();

      const all = await list({ sort });
      const firstPage = await list({ sort, pageSize: '4' });
      const secondPage = await list({ sort, page: '2', pageSize: '4' });

      expect(idsOf(all)).toEqual(expected);
      expect([...idsOf(firstPage), ...idsOf(secondPage)]).toEqual(expected);
    },
  );
});

describe('GET /api/photos – hibás query: 400, soha 500', () => {
  it.each([
    'page=abc',
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1001',
    `page=${'9'.repeat(30)}`,
    'pageSize=0',
    'pageSize=51',
    'minPrice=-1',
    'maxPrice=abc',
    'minPrice=10000001',
    'minPrice=5000&maxPrice=1000',
    'categoryId=0',
    'categoryId=abc',
    'ownerId=nem-uuid',
    'sort=random',
    'sort=',
    'page=1&page=2',
    'sort=newest&sort=oldest',
    'q=a&q=b',
    'q=%00',
    `q=${'a'.repeat(101)}`,
    'q=kep%E2%80%AEgpj',
    'page=%E0%A4%A',
    // Üres érték: a kliens a be nem állított szűrőt elhagyja (csak az üres q jelent „nincs szűrés”-t)
    'categoryId=',
    'ownerId=',
    'minPrice=',
    'maxPrice=',
    'page=',
    'pageSize=',
  ])('%s → 400 VALIDATION_ERROR', async (query) => {
    const response = await request(app).get(`/api/photos?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('az ismeretlen paraméter nem hiba (pl. gyorsítótár-törlő vagy követőkód)', async () => {
    await addPhoto({ title: 'Tócsa' });

    const response = await request(app).get('/api/photos?_=1700000000&utm_source=hirlevel');

    expect(response.status).toBe(200);
    expect(titlesOf(response)).toEqual(['Tócsa']);
  });
});

describe('GET /api/photos – hozzáférés', () => {
  it('más webhelyről indított lekérés: 403 – a keresést idegen oldal a látogatói böngészőjéből sem indíthatja', async () => {
    await addPhoto({ title: 'Tócsa' });

    const crossSite = await request(app)
      .get('/api/photos?q=tocsa')
      .set('Sec-Fetch-Site', 'cross-site');
    const sameOrigin = await request(app).get('/api/photos').set('Sec-Fetch-Site', 'same-origin');

    expect(crossSite.status).toBe(403);
    expect(crossSite.body.error.code).toBe('FORBIDDEN');
    expect(titlesOf(sameOrigin)).toEqual(['Tócsa']);
    // A válasz a fejléctől függ: egy köztes gyorsítótár a 403-at a saját oldalnak ne adhassa ki
    expect(crossSite.headers.vary).toMatch(/Sec-Fetch-Site/);
    expect(sameOrigin.headers.vary).toMatch(/Sec-Fetch-Site/);
  });

  it('a letiltott fotós képei a tiltás idejére kimaradnak (L16), a feloldás után visszajönnek', async () => {
    await addPhoto({ title: 'Tócsa' });
    await prisma.user.update({ where: { id: owner.id }, data: { isBlocked: true } });

    expect(titlesOf(await list())).toEqual([]);

    await prisma.user.update({ where: { id: owner.id }, data: { isBlocked: false } });
    expect(titlesOf(await list())).toEqual(['Tócsa']);
  });
});

describe('GET /api/categories', () => {
  it('a kategóriák név szerint rendezve, csak azonosító, név és slug – bejelentkezés nélkül', async () => {
    const created = new Map<string, number>();
    for (const [name, slug] of [
      ['Városok', 'varosok'],
      ['Állatok', 'allatok'],
      ['Portré', 'portre'],
    ] as const) {
      created.set(name, (await prisma.category.create({ data: { name, slug } })).id);
    }

    const response = await request(app).get('/api/categories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        categories: [
          { id: created.get('Állatok'), name: 'Állatok', slug: 'allatok' },
          { id: categoryId, name: expect.stringMatching(/^Kategória /), slug: expect.any(String) },
          { id: created.get('Portré'), name: 'Portré', slug: 'portre' },
          { id: created.get('Városok'), name: 'Városok', slug: 'varosok' },
        ],
      },
    });
  });
});
