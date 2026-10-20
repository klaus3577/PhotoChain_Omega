// A Supabase Storage tárhely (L32) tesztjei egy memóriában futó, hamis Storage API-val: a fetch
// helyére kerül, és a storage-js által hívott végpontokat (feltöltés, letöltés, törlés, bucket
// lekérdezése) utánozza. Hálózat és valódi Supabase-projekt nem kell.
import { text } from 'node:stream/consumers';
import { setTimeout as sleep } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { StorageKeyError, StorageNotFoundError } from './storage.types.js';
import { createSupabaseStorage, StorageUnavailableError } from './supabase.storage.js';

const SECRET_KEY = 'sb_secret_hamisSupabaseKulcs0123456789';
const PHOTO_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';
const ORIGINAL = `originals/${PHOTO_ID}.png`;
const PREVIEW = `previews/${PHOTO_ID}.jpg`;
const THUMBNAIL = `thumbnails/${PHOTO_ID}.jpg`;

interface StoredObject {
  contentType: string;
  body: Buffer;
}

/** A Supabase Storage REST API-jának elég része a tesztekhez – a kérések naplójával. */
function createFakeStorageApi({
  publicBuckets = [] as string[],
  missingBuckets = [] as string[],
  /** Minden kérésre 401 (pl. hibás kulcs) */
  unauthorized = false,
  /** A letöltött tartalom második fele ennyi ms múlva érkezik */
  bodyDelayMs = 0,
  /** A letöltött tartalom második fele soha nem érkezik meg */
  stallBody = false,
  /** A válaszban nincs Content-Length */
  omitLength = false,
} = {}) {
  const objects = new Map<string, StoredObject>();
  const requests: { method: string; path: string; apikey: string | null }[] = [];
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const notFound = (): Response =>
    json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });

  const fetch = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init.headers);
    const method = (init.method ?? 'GET').toUpperCase();
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ''));
    requests.push({ method, path, apikey: headers.get('apikey') });
    if (unauthorized) return json(401, { statusCode: '401', error: 'Unauthorized' });

    const bucketMatch = /^\/bucket\/([^/]+)$/.exec(path);
    if (bucketMatch && method === 'GET') {
      const [, id = ''] = bucketMatch;
      if (missingBuckets.includes(id))
        return json(400, { statusCode: '404', error: 'Bucket not found' });
      return json(200, { id, name: id, public: publicBuckets.includes(id) });
    }
    const removeMatch = /^\/object\/([^/]+)$/.exec(path);
    if (removeMatch && method === 'DELETE') {
      const { prefixes } = JSON.parse(String(init.body)) as { prefixes: string[] };
      const removed = prefixes.filter((key) => objects.delete(`${removeMatch[1]}/${key}`));
      return json(
        200,
        removed.map((name) => ({ name })),
      );
    }
    const objectMatch = /^\/object\/([^/]+)\/(.+)$/.exec(path);
    if (!objectMatch) return json(404, { statusCode: '404', error: 'not_found', message: path });
    const id = `${objectMatch[1]}/${objectMatch[2]}`;
    if (method === 'POST') {
      if (objects.has(id) && headers.get('x-upsert') !== 'true') {
        return json(400, {
          statusCode: '409',
          error: 'Duplicate',
          message: 'The resource already exists',
        });
      }
      const body = Buffer.from(init.body as Uint8Array);
      objects.set(id, { contentType: headers.get('content-type') ?? '', body });
      return json(200, { Key: id, Id: 'hamis-azonosito' });
    }
    if (method === 'GET') {
      const object = objects.get(id);
      if (!object) return notFound();
      const { body } = object;
      const half = Math.ceil(body.length / 2);
      // A tartalom két részletben érkezik; a kérés megszakítása a folyamot is megszakítja
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let closed = false;
          init.signal?.addEventListener('abort', () => {
            if (!closed) controller.error(init.signal?.reason);
          });
          controller.enqueue(new Uint8Array(body.subarray(0, half)));
          if (stallBody) return;
          if (bodyDelayMs > 0) await sleep(bodyDelayMs);
          controller.enqueue(new Uint8Array(body.subarray(half)));
          closed = true;
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': object.contentType,
          ...(omitLength ? {} : { 'content-length': String(body.length) }),
        },
      });
    }
    return json(405, { statusCode: '405', error: 'method not allowed' });
  };
  return { fetch, objects, requests };
}

function createStorage(api = createFakeStorageApi(), timeoutMs = 2000) {
  return createSupabaseStorage({
    url: 'https://abcdefghijklmnop.supabase.co',
    secretKey: SECRET_KEY,
    originalsBucket: 'originals',
    previewsBucket: 'previews',
    timeoutMs,
    fetch: api.fetch,
  });
}

describe('Supabase Storage tárhely (L32)', () => {
  it('az eredeti kép az originals, az előnézet és a bélyegkép a previews bucketbe kerül, típussal', async () => {
    const api = createFakeStorageApi();
    const storage = createStorage(api);

    await storage.save(ORIGINAL, Buffer.from('eredeti'));
    await storage.save(PREVIEW, Buffer.from('előnézet'));
    await storage.save(THUMBNAIL, Buffer.from('bélyegkép'));

    expect([...api.objects.keys()]).toEqual([
      `originals/${ORIGINAL}`,
      `previews/${PREVIEW}`,
      `previews/${THUMBNAIL}`,
    ]);
    expect(api.objects.get(`originals/${ORIGINAL}`)?.contentType).toBe('image/png');
    expect(api.objects.get(`previews/${PREVIEW}`)?.contentType).toBe('image/jpeg');
    // A titkos kulcs az apikey fejlécben megy (a Supabase új kulcsai csak ott érvényesek)
    expect(api.requests.every((request) => request.apikey === SECRET_KEY)).toBe(true);
  });

  it('meglévő fájlt nem ír felül – a mentés hibát ad, a tartalom marad', async () => {
    const api = createFakeStorageApi();
    const storage = createStorage(api);
    await storage.save(PREVIEW, Buffer.from('első'));

    await expect(storage.save(PREVIEW, Buffer.from('második'))).rejects.toThrow(
      StorageUnavailableError,
    );
    expect(String(api.objects.get(`previews/${PREVIEW}`)?.body)).toBe('első');
  });

  it('a fájl beolvasható egészben és folyamként is, a méretével', async () => {
    const storage = createStorage();
    await storage.save(ORIGINAL, Buffer.from('eredeti képadat'));

    expect(String(await storage.read(ORIGINAL))).toBe('eredeti képadat');
    const file = await storage.openRead(ORIGINAL);
    expect(file.size).toBe(Buffer.byteLength('eredeti képadat'));
    expect(await text(file.stream)).toBe('eredeti képadat');
  });

  // L32 átnézések: a nagy fájl (az eredeti, legfeljebb 15 MB) se kerüljön egészben a memóriába –
  // a lassan olvasó kliensek így nem foglalhatják el az 512 MB-ot
  it('a fájlt folyamként adja: a mérete a válasz fejlécéből, a tartalma utána érkezik', async () => {
    const api = createFakeStorageApi({ bodyDelayMs: 150 });
    const storage = createStorage(api, 50);
    await storage.save(ORIGINAL, Buffer.from('eredeti képadat, két részletben'));

    const file = await storage.openRead(ORIGINAL);

    expect(file.size).toBe(Buffer.byteLength('eredeti képadat, két részletben'));
    // Az időkorlát (50 ms) csak a válasz fejlécéig tart: a lassan érkező tartalom nem szakad meg
    expect(await text(file.stream)).toBe('eredeti képadat, két részletben');
  });

  it('a méret nélküli válasznál a tartalmat egészben olvassa be, így a mérete is ismert', async () => {
    const storage = createStorage(createFakeStorageApi({ omitLength: true }));
    await storage.save(PREVIEW, Buffer.from('előnézet'));

    const file = await storage.openRead(PREVIEW);

    expect(file.size).toBe(Buffer.byteLength('előnézet'));
    expect(await text(file.stream)).toBe('előnézet');
  });

  it('az egészben beolvasott fájlra (read) a teljes időkorlát vonatkozik', async () => {
    const storage = createStorage(createFakeStorageApi({ stallBody: true }), 50);
    await storage.save(PREVIEW, Buffer.from('előnézet, amely nem ér végig'));

    await expect(storage.read(PREVIEW)).rejects.toThrow(StorageUnavailableError);
  });

  it('a hiányzó fájlra StorageNotFoundError a válasz (a /media útvonal ebből ad 404-et)', async () => {
    const storage = createStorage();

    await expect(storage.read(PREVIEW)).rejects.toThrow(StorageNotFoundError);
    await expect(storage.openRead(THUMBNAIL)).rejects.toThrow(StorageNotFoundError);
  });

  it('a törlés eltávolítja a fájlt; a nem létező fájl törlése nem hiba', async () => {
    const api = createFakeStorageApi();
    const storage = createStorage(api);
    await storage.save(THUMBNAIL, Buffer.from('bélyegkép'));

    await storage.delete(THUMBNAIL);
    await storage.delete(THUMBNAIL);

    expect(api.objects.size).toBe(0);
  });

  it('érvénytelen kulcsra kérés nélkül StorageKeyError-t ad', async () => {
    const api = createFakeStorageApi();
    const storage = createStorage(api);

    await expect(storage.save('../titok.jpg', Buffer.from('x'))).rejects.toThrow(StorageKeyError);
    await expect(storage.read(`previews/${PHOTO_ID}.gif`)).rejects.toThrow(StorageKeyError);
    expect(api.requests).toEqual([]);
  });

  it('a nyilvános URL a szerver /media útvonala; az eredeti képnek nincs ilyen', () => {
    const storage = createStorage();

    expect(storage.publicUrl(PREVIEW)).toBe(`/media/previews/${PHOTO_ID}.jpg`);
    expect(storage.publicUrl(THUMBNAIL)).toBe(`/media/thumbnails/${PHOTO_ID}.jpg`);
    expect(() => storage.publicUrl(ORIGINAL)).toThrow(StorageKeyError);
  });

  // L10: egy nem válaszoló tárhely ne tartsa fel a feltöltési sort
  it('a nem válaszoló tárhelynél az időkorlát után hibát ad', async () => {
    const hanging = (_input: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    const storage = createStorage({ ...createFakeStorageApi(), fetch: hanging }, 50);

    await expect(storage.read(PREVIEW)).rejects.toThrow(StorageUnavailableError);
    // A folyamként olvasásnál a válasz fejlécéig tartó időkorlát jár le
    await expect(storage.openRead(PREVIEW)).rejects.toThrow(StorageUnavailableError);
  });

  it('a tárhely szerverhibájánál a hibaüzenetben nincs kulcs', async () => {
    const failing = async (): Promise<Response> =>
      new Response(JSON.stringify({ statusCode: '500', error: 'internal', message: 'hiba' }), {
        status: 500,
      });
    const storage = createStorage({ ...createFakeStorageApi(), fetch: failing });

    for (const attempt of [storage.read(PREVIEW), storage.openRead(PREVIEW)]) {
      const error = await attempt.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(StorageUnavailableError);
      expect(error).not.toBeInstanceOf(StorageNotFoundError);
      expect(String(error)).not.toContain(SECRET_KEY);
    }
  });

  describe('a bucketek ellenőrzése induláskor', () => {
    it('két létező, privát bucketnél rendben', async () => {
      await expect(createStorage().checkBuckets()).resolves.toBeUndefined();
    });

    // L32 kódátnézés: hibás kulcsnál ne csak „nem érhető el” legyen, hanem a valódi ok is
    it('a hiba okát (HTTP-állapot) is megmondja – pl. hibás kulcsnál', async () => {
      const storage = createStorage(createFakeStorageApi({ unauthorized: true }));

      await expect(storage.checkBuckets()).rejects.toThrow(/originals.*HTTP 401/);
    });

    it('a hiányzó bucketet jelzi', async () => {
      const storage = createStorage(createFakeStorageApi({ missingBuckets: ['previews'] }));

      await expect(storage.checkBuckets()).rejects.toThrow(/previews/);
    });

    // A képek a szerveren át jutnak a böngészőhöz; egy nyilvános bucketből az eredeti (vízjel
    // nélküli, megvásárolható) kép bárki számára letölthető volna
    it('a nyilvános bucketet hibának veszi', async () => {
      const storage = createStorage(createFakeStorageApi({ publicBuckets: ['originals'] }));

      await expect(storage.checkBuckets()).rejects.toThrow(/originals.*nyilvános/);
    });
  });
});
