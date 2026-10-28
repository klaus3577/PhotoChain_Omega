// A nyilvános képek (/media: vízjeles előnézet, bélyegkép) kiszolgálása a tesztadatbázison, helyi
// és távoli (memóriában tartott) tárhellyel. A kép láthatóságát a szerver a kiszolgálás előtt az
// adatbázisból ellenőrzi (témavezetői észrevétel, 2026-10-27): a letiltott fotós és a nem nyilvános
// kép fájlja csak a kép kezelőjének jár – a fájl léte önmagában nem elég. Távoli tárhelynél (L32)
// csak az előnézet és a bélyegkép megy át, az eredeti kép soha. Az őr egységtesztjei (adatbázis
// nélkül): src/middleware/mediaAccess.test.ts.
import { rmSync } from 'node:fs';
import { Readable } from 'node:stream';

import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PhotoStatus, PrismaClient } from '../../src/generated/prisma/client.js';
import { createLocalStorage } from '../../src/services/storage/local.storage.js';
import {
  type StorageService,
  StorageNotFoundError,
} from '../../src/services/storage/storage.types.js';
import { StorageUnavailableError } from '../../src/services/storage/supabase.storage.js';
import { createTestApp, createTestAppWithStorage, sessionCookieFor } from '../helpers/testApp.js';
import {
  createCategory,
  createPhoto,
  createTestPrisma,
  createUser,
  resetDatabase,
} from '../helpers/testDatabase.js';
import { createTempUploadDir, listStoredFiles } from '../helpers/uploads.js';

const PHOTO_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';
const OTHER_ID = '9a1c5e70-2b3d-4f61-8e92-0c4d5e6f7a81';
/** Érvényes formájú azonosító, amelyhez nem tartozik kép */
const NO_PHOTO_ID = '7c0a2d44-5e6f-4a8b-9c1d-2e3f4a5b6c7d';
const PREVIEW = Buffer.from('vízjeles előnézet (JPEG)');
/** A nyilvános kép válasza: a böngésző 5 percig használhatja, köztes gyorsítótár nem tárolhatja */
const MEDIA_CACHE_CONTROL = 'private, max-age=300';
/** A nem nyilvános kép válasza (a munkamenettől függ) és a 404 */
const NON_PUBLIC_CACHE_CONTROL = 'no-store';
const NOT_PUBLIC_STATUSES: PhotoStatus[] = ['PENDING_CHAIN', 'CHAIN_FAILED'];
/** Útvonalak, amelyek a nyilvános fájl mintáját nem követik: a szerver az adatbázist sem kérdezi */
const INVALID_PATHS = [
  `/media/previews/${PHOTO_ID}.gif`,
  '/media/previews/nem-azonosito.jpg',
  `/media/previews/..%2F..%2Foriginals%2F${PHOTO_ID}.jpg`,
  `/media/previews/${PHOTO_ID}.jpg/tovabb`,
  '/media/previews',
  `/media/originals/${PHOTO_ID}.jpg`,
  `/media//previews/${PHOTO_ID}.jpg`,
  `/media/previews/${PHOTO_ID.toUpperCase()}.jpg`,
  `/media/../originals/${PHOTO_ID}.jpg`,
];

const previewPath = (id = PHOTO_ID): string => `/media/previews/${id}.jpg`;
const thumbnailPath = (id = PHOTO_ID): string => `/media/thumbnails/${id}.jpg`;

let prisma: PrismaClient;
let uploadDir: string;
let local: StorageService;
let app: Express;
let owner: { id: string };
let ownerCookie: string;
let strangerCookie: string;
let adminCookie: string;
let blockedViewerCookie: string;
let categoryId: number;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  uploadDir = createTempUploadDir();
  local = createLocalStorage(uploadDir);
  app = createTestApp({ UPLOAD_DIR: uploadDir }, prisma);
  owner = await createUser(prisma);
  ownerCookie = sessionCookieFor(owner.id);
  strangerCookie = sessionCookieFor((await createUser(prisma)).id);
  adminCookie = sessionCookieFor((await createUser(prisma, undefined, { role: 'ADMIN' })).id);
  blockedViewerCookie = sessionCookieFor(
    (await createUser(prisma, undefined, { isBlocked: true })).id,
  );
  categoryId = (await createCategory(prisma)).id;
});

/** A tulajdonos képe a megadott állapotban (a fájlok kulcsa az azonosítóból képződik). */
const photoRow = (status: PhotoStatus = 'REGISTERED', id = PHOTO_ID) =>
  createPhoto(prisma, { id, ownerId: owner.id, categoryId, status });

/** A kép a két nyilvános fájljával a helyi tárhelyen. */
async function photoWithFiles(status: PhotoStatus = 'REGISTERED', id = PHOTO_ID) {
  const photo = await photoRow(status, id);
  await local.save(photo.previewKey, PREVIEW);
  await local.save(photo.thumbnailKey, PREVIEW);
  return photo;
}

function get(path: string, cookie?: string, target: Express = app) {
  const pending = request(target).get(path);
  return cookie ? pending.set('Cookie', cookie) : pending;
}

function head(path: string, cookie?: string, target: Express = app) {
  const pending = request(target).head(path);
  return cookie ? pending.set('Cookie', cookie) : pending;
}

const setBlocked = (userId: string, isBlocked: boolean) =>
  prisma.user.update({ where: { id: userId }, data: { isBlocked } });

/**
 * A Prisma-kliens, amely számolja a képek és a felhasználók lekérdezéseit (minden hívást a két
 * modellen) – a többi hívást továbbadja.
 */
function countingPrisma(client: PrismaClient): { client: PrismaClient; queries: () => number } {
  let count = 0;
  const counted = new Set<string | symbol>(['photo', 'user']);
  const proxied = new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (!counted.has(property)) {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return new Proxy(value as object, {
        get(delegate, method) {
          const member: unknown = Reflect.get(delegate, method);
          if (typeof member !== 'function') return member;
          return (...args: unknown[]) => {
            count += 1;
            return member.apply(delegate, args);
          };
        },
      });
    },
  });
  return { client: proxied, queries: () => count };
}

describe('a kép láthatósága a kiszolgálás előtt (helyi tárhely, express.static)', () => {
  it('a nyilvános kép előnézetét és bélyegképét bárki megkapja (a letiltott néző is), rövid ideig gyorsítótárazhatóan', async () => {
    await photoWithFiles();

    const preview = await get(previewPath()).buffer(true);
    const thumbnail = await get(thumbnailPath(), blockedViewerCookie);
    const headResponse = await head(previewPath());

    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('image/jpeg');
    // private: egy köztes (CDN-) gyorsítótár ne tartsa meg – a tiltás vagy az elrejtés után tűnjön el
    expect(preview.headers['cache-control']).toBe(MEDIA_CACHE_CONTROL);
    expect(Buffer.from(preview.body as Buffer)).toEqual(PREVIEW);
    expect(thumbnail.status).toBe(200);
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers['content-length']).toBe(String(PREVIEW.length));
  });

  it('a letiltott fotós képének fájljai a tiltás alatt 404 (a fájl megmarad), a feloldás után újra 200', async () => {
    await photoWithFiles();
    await setBlocked(owner.id, true);

    const whileBlocked = [
      await get(previewPath()),
      await get(thumbnailPath()),
      await get(previewPath(), strangerCookie),
      // A letiltott tulajdonos a munkamenetével névtelen néző: a saját képét sem kapja meg
      await get(previewPath(), ownerCookie),
    ];
    const forAdmin = await get(previewPath(), adminCookie);
    await setBlocked(owner.id, false);
    const afterUnblock = await get(previewPath());

    for (const response of whileBlocked) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
      // A 404 sem maradhat gyorsítótárban: a feloldás után a kép azonnal visszajön
      expect(response.headers['cache-control']).toBe(NON_PUBLIC_CACHE_CONTROL);
    }
    expect(forAdmin.status).toBe(200);
    expect(afterUnblock.status).toBe(200);
    expect(listStoredFiles(uploadDir)).toEqual([
      `public/previews/${PHOTO_ID}.jpg`,
      `public/thumbnails/${PHOTO_ID}.jpg`,
    ]);
  });

  it.each(NOT_PUBLIC_STATUSES)(
    'a még nem nyilvános (%s) kép fájlját csak a tulajdonosa és az admin kapja meg, gyorsítótár nélkül',
    async (status) => {
      await photoWithFiles(status);

      const forOwner = await get(previewPath(), ownerCookie);

      expect((await get(previewPath())).status).toBe(404);
      expect((await get(thumbnailPath(), strangerCookie)).status).toBe(404);
      expect((await head(previewPath())).status).toBe(404);
      expect(forOwner.status).toBe(200);
      // A válasz a munkamenettől függ: a böngésző sem tarthatja meg
      expect(forOwner.headers['cache-control']).toBe(NON_PUBLIC_CACHE_CONTROL);
      expect((await head(previewPath(), ownerCookie)).status).toBe(200);
      expect((await get(thumbnailPath(), adminCookie)).status).toBe(200);
    },
  );

  it('a rejtett kép megmaradt fájlja senkinek nem jár – a kezelőjének sem', async () => {
    await photoWithFiles('HIDDEN');
    const unknown = await get(previewPath(NO_PHOTO_ID));

    for (const cookie of [undefined, strangerCookie, ownerCookie, adminCookie]) {
      const response = await get(previewPath(), cookie);
      expect(response.status).toBe(404);
      // A kezelőnek sem más a válasz: ugyanaz, mint a nem létező képre
      expect(response.body).toEqual(unknown.body);
      expect(response.headers['cache-control']).toBe(NON_PUBLIC_CACHE_CONTROL);
    }
  });

  it('a nem látható, a nem létező és a hiányzó fájlú kép válasza ugyanaz: a kép létezése nem derül ki', async () => {
    await photoWithFiles('PENDING_CHAIN');
    // Látható kép, amelynek a fájlja nincs a tárhelyen (pl. egy visszaállítás közben)
    await photoRow('REGISTERED', OTHER_ID);

    const notVisible = await get(previewPath(), strangerCookie);
    const unknown = await get(previewPath(NO_PHOTO_ID), strangerCookie);
    const missingFile = await get(previewPath(OTHER_ID), strangerCookie);

    for (const response of [notVisible, unknown, missingFile]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(unknown.body);
      expect(response.headers['cache-control']).toBe(NON_PUBLIC_CACHE_CONTROL);
    }
  });

  it('csak a kép saját kulcsa adható ki: az árva fájl és a kép más nevű fájlja 404', async () => {
    await photoWithFiles();
    // Fájl, amelyhez nem tartozik kép, és egy másik kiterjesztésű fájl a kép neve alatt
    await local.save(`previews/${OTHER_ID}.jpg`, PREVIEW);
    await local.save(`thumbnails/${PHOTO_ID}.png`, PREVIEW);

    expect((await get(previewPath(OTHER_ID))).status).toBe(404);
    expect((await get(`/media/thumbnails/${PHOTO_ID}.png`)).status).toBe(404);
    expect((await get(thumbnailPath())).status).toBe(200);
  });

  it('a nyilvános kép egyetlen lekérdezés (a munkamenet nélkül), a nem nyilvános kettő', async () => {
    await photoWithFiles();
    await photoWithFiles('PENDING_CHAIN', OTHER_ID);
    const counting = countingPrisma(prisma);
    const target = createTestApp({ UPLOAD_DIR: uploadDir }, counting.client);

    await get(previewPath(), undefined, target).expect(200);
    expect(counting.queries()).toBe(1);
    await get(previewPath(), ownerCookie, target).expect(200);
    expect(counting.queries()).toBe(2);
    await get(previewPath(OTHER_ID), ownerCookie, target).expect(200);
    expect(counting.queries()).toBe(4);
  });

  it.each(INVALID_PATHS)(
    'a szabálytalan útvonal (%s) 404, az adatbázist munkamenettel sem kérdezi',
    async (path) => {
      await photoWithFiles();
      const counting = countingPrisma(prisma);
      const target = createTestApp({ UPLOAD_DIR: uploadDir }, counting.client);

      const response = await get(path, ownerCookie, target);

      expect(response.status).toBe(404);
      expect(counting.queries()).toBe(0);
    },
  );

  it('csak olvasható: a POST kérés 404, az adatbázist nem kérdezi', async () => {
    await photoWithFiles();
    const counting = countingPrisma(prisma);
    const target = createTestApp({ UPLOAD_DIR: uploadDir }, counting.client);

    const response = await request(target).post(previewPath()).set('Cookie', ownerCookie);

    expect(response.status).toBe(404);
    expect(counting.queries()).toBe(0);
  });

  it('IP-címenként sebességkorlátos helyi tárhelynél is (MEDIA_RATE_LIMIT_MAX)', async () => {
    await photoWithFiles();
    const limited = createTestApp({ UPLOAD_DIR: uploadDir, MEDIA_RATE_LIMIT_MAX: 2 }, prisma);

    await get(previewPath(), undefined, limited).expect(200);
    await get(previewPath(), undefined, limited).expect(200);
    const response = await get(previewPath(), undefined, limited);

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });
});

// --- Távoli tárhely (L32) ---------------------------------------------------------------------------

function createMemoryStorage(files: Record<string, Buffer> = {}) {
  const openRead = vi.fn(async (key: string) => {
    const data = files[key];
    if (!data) throw new StorageNotFoundError();
    return { size: data.length, stream: Readable.from(data) };
  });
  const storage: StorageService = {
    save: vi.fn(),
    read: vi.fn(),
    openRead,
    delete: vi.fn(),
    publicUrl: vi.fn(),
  };
  return { storage, openRead };
}

/** Alkalmazás a memóriában tartott távoli tárhellyel; a képek a tesztadatbázisból jönnek. */
const remoteApp = (storage: StorageService, overrides = {}): Express =>
  createTestAppWithStorage(storage, overrides, prisma);

describe('nyilvános képek távoli tárhelyről (/media, L32)', () => {
  it('az előnézetet a tárhelyről adja, típussal, mérettel, rövid ideig gyorsítótárazhatóan', async () => {
    await photoRow();
    const { storage } = createMemoryStorage({ [`previews/${PHOTO_ID}.jpg`]: PREVIEW });

    const response = await get(previewPath(), undefined, remoteApp(storage)).buffer(true);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-length']).toBe(String(PREVIEW.length));
    // private: egy köztes (CDN-) gyorsítótár ne tartsa meg – az elrejtett kép azonnal tűnjön el
    expect(response.headers['cache-control']).toBe(MEDIA_CACHE_CONTROL);
    // A képet más oldal nem ágyazhatja be (helmet), és a böngésző nem találgatja a típusát
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(response.body as Buffer)).toEqual(PREVIEW);
  });

  // L32 átnézések: minden kérés egy Supabase-letöltés – a kimenő forgalom ingyenes kerete véges
  it('IP-címenként sebességkorlátos (MEDIA_RATE_LIMIT_MAX)', async () => {
    await photoRow();
    const { storage } = createMemoryStorage({ [`previews/${PHOTO_ID}.jpg`]: PREVIEW });
    const target = remoteApp(storage, { MEDIA_RATE_LIMIT_MAX: 2 });

    await get(previewPath(), undefined, target).expect(200);
    await get(previewPath(), undefined, target).expect(200);
    const response = await get(previewPath(), undefined, target);

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('a bélyegképet is kiszolgálja, HEAD kérésre törzs nélkül', async () => {
    await photoRow();
    const { storage } = createMemoryStorage({ [`thumbnails/${PHOTO_ID}.jpg`]: PREVIEW });
    const target = remoteApp(storage);

    expect((await get(thumbnailPath(), undefined, target)).status).toBe(200);
    const headResponse = await head(thumbnailPath(), undefined, target);
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers['content-length']).toBe(String(PREVIEW.length));
  });

  it('az eredeti képet soha nem adja ki – a tárhelyhez sem fordul', async () => {
    await photoRow();
    const { storage, openRead } = createMemoryStorage({ [`originals/${PHOTO_ID}.jpg`]: PREVIEW });

    const response = await get(`/media/originals/${PHOTO_ID}.jpg`, undefined, remoteApp(storage));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(openRead).not.toHaveBeenCalled();
  });

  it.each(INVALID_PATHS)(
    'a szabálytalan útvonal (%s) 404, a tárhelyhez nem fordul',
    async (path) => {
      await photoRow();
      const { storage, openRead } = createMemoryStorage();

      const response = await get(path, undefined, remoteApp(storage));

      expect(response.status).toBe(404);
      expect(openRead).not.toHaveBeenCalled();
    },
  );

  it('a letiltott fotós és a nem nyilvános kép fájlját a tárhelyről sem kéri le (404)', async () => {
    await photoRow('PENDING_CHAIN');
    await photoRow('REGISTERED', OTHER_ID);
    await setBlocked(owner.id, true);
    const { storage, openRead } = createMemoryStorage({
      [`previews/${PHOTO_ID}.jpg`]: PREVIEW,
      [`previews/${OTHER_ID}.jpg`]: PREVIEW,
    });
    const target = remoteApp(storage);

    const pending = await get(previewPath(), strangerCookie, target);
    const blocked = await get(previewPath(OTHER_ID), undefined, target);
    expect(pending.status).toBe(404);
    expect(blocked.status).toBe(404);
    expect(openRead).not.toHaveBeenCalled();

    // A feloldás után a tulajdonos a saját, még nem nyilvános képét megkapja – ekkor fordul a
    // tárhelyhez; a válasz a munkamenettől függ, ezért no-store
    await setBlocked(owner.id, false);
    const forOwner = await get(previewPath(), ownerCookie, target);
    expect(forOwner.status).toBe(200);
    expect(forOwner.headers['cache-control']).toBe(NON_PUBLIC_CACHE_CONTROL);
    expect(openRead).toHaveBeenCalledWith(`previews/${PHOTO_ID}.jpg`);
  });

  it('a látható kép tárhelyről hiányzó előnézete ugyanazt a 404-et kapja, mint a nem létező kép; a rejtett kép ott maradt fájlját senki sem kapja meg', async () => {
    await photoRow();
    await photoRow('HIDDEN', OTHER_ID);
    const { storage, openRead } = createMemoryStorage({ [`previews/${OTHER_ID}.jpg`]: PREVIEW });
    const target = remoteApp(storage);

    const missing = await get(previewPath(), undefined, target);
    const unknown = await get(previewPath(NO_PHOTO_ID), undefined, target);

    // A látható kép kérése eljutott a tárhelyig (onnan jött a „nincs ilyen fájl”), a nem létezőé nem
    expect(openRead).toHaveBeenCalledTimes(1);
    expect(openRead).toHaveBeenCalledWith(`previews/${PHOTO_ID}.jpg`);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(unknown.body);
    expect(missing.headers['cache-control']).toBe(NON_PUBLIC_CACHE_CONTROL);

    // A rejtett kép tárhelyen maradt fájlját a kezelője sem kapja meg – a tárhelyet sem kérdezi
    openRead.mockClear();
    for (const cookie of [ownerCookie, adminCookie]) {
      const hidden = await get(previewPath(OTHER_ID), cookie, target);
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(unknown.body);
    }
    expect(openRead).not.toHaveBeenCalled();
  });

  it('ha a fájl folyama küldés közben megszakad, a kapcsolatot bontja (csonka kép nem marad)', async () => {
    await photoRow();
    const { storage, openRead } = createMemoryStorage();
    openRead.mockResolvedValue({
      size: 1000,
      stream: new Readable({
        read() {
          this.push(Buffer.from('az eleje'));
          this.destroy(new Error('a tárhely kapcsolata megszakadt'));
        },
      }),
    });

    await expect(get(previewPath(), undefined, remoteApp(storage))).rejects.toThrow();
  });

  it('a tárhely hibájánál általános szerverhiba, részletek nélkül', async () => {
    await photoRow();
    const { storage, openRead } = createMemoryStorage();
    openRead.mockRejectedValue(new StorageUnavailableError('A tárhely nem érhető el (olvasás)'));

    const response = await get(previewPath(), undefined, remoteApp(storage));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('tárhely');
  });
});
