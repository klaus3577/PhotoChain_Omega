// A nyilvános képek kiszolgálása távoli tárhelyről (L32): a Supabase Storage fájljait a szerver
// adja tovább a /media útvonalon – csak az előnézetet és a bélyegképet, az eredeti képet soha.
// Adatbázis nélkül, egy memóriában tartott tárhellyel.
import { Readable } from 'node:stream';

import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  type StorageService,
  StorageNotFoundError,
} from '../../src/services/storage/storage.types.js';
import { StorageUnavailableError } from '../../src/services/storage/supabase.storage.js';
import { createTestAppWithStorage } from '../helpers/testApp.js';

const PHOTO_ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';
const PREVIEW = Buffer.from('vízjeles előnézet (JPEG)');

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

describe('nyilvános képek távoli tárhelyről (/media, L32)', () => {
  it('az előnézetet a tárhelyről adja, típussal, mérettel, rövid ideig gyorsítótárazhatóan', async () => {
    const { storage } = createMemoryStorage({ [`previews/${PHOTO_ID}.jpg`]: PREVIEW });

    const response = await request(createTestAppWithStorage(storage))
      .get(`/media/previews/${PHOTO_ID}.jpg`)
      .buffer(true);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-length']).toBe(String(PREVIEW.length));
    // private: egy köztes (CDN-) gyorsítótár ne tartsa meg – az elrejtett kép azonnal tűnjön el
    expect(response.headers['cache-control']).toBe('private, max-age=300');
    // A képet más oldal nem ágyazhatja be (helmet), és a böngésző nem találgatja a típusát
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(response.body as Buffer)).toEqual(PREVIEW);
  });

  // L32 átnézések: minden kérés egy Supabase-letöltés – a kimenő forgalom ingyenes kerete véges
  it('IP-címenként sebességkorlátos (MEDIA_RATE_LIMIT_MAX)', async () => {
    const { storage } = createMemoryStorage({ [`previews/${PHOTO_ID}.jpg`]: PREVIEW });
    const app = createTestAppWithStorage(storage, { MEDIA_RATE_LIMIT_MAX: 2 });

    await request(app).get(`/media/previews/${PHOTO_ID}.jpg`).expect(200);
    await request(app).get(`/media/previews/${PHOTO_ID}.jpg`).expect(200);
    const response = await request(app).get(`/media/previews/${PHOTO_ID}.jpg`);

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
  });

  it('a bélyegképet is kiszolgálja, HEAD kérésre törzs nélkül', async () => {
    const { storage } = createMemoryStorage({ [`thumbnails/${PHOTO_ID}.jpg`]: PREVIEW });
    const app = createTestAppWithStorage(storage);

    expect((await request(app).get(`/media/thumbnails/${PHOTO_ID}.jpg`)).status).toBe(200);
    const head = await request(app).head(`/media/thumbnails/${PHOTO_ID}.jpg`);
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe(String(PREVIEW.length));
  });

  it('az eredeti képet soha nem adja ki – a tárhelyhez sem fordul', async () => {
    const { storage, openRead } = createMemoryStorage({ [`originals/${PHOTO_ID}.jpg`]: PREVIEW });

    const response = await request(createTestAppWithStorage(storage)).get(
      `/media/originals/${PHOTO_ID}.jpg`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(openRead).not.toHaveBeenCalled();
  });

  it.each([
    `/media/previews/${PHOTO_ID}.gif`,
    '/media/previews/nem-azonosito.jpg',
    `/media/previews/..%2F..%2Foriginals%2F${PHOTO_ID}.jpg`,
    `/media/previews/${PHOTO_ID}.jpg/tovabb`,
    '/media/previews',
  ])('a szabálytalan útvonal (%s) 404, a tárhelyhez nem fordul', async (path) => {
    const { storage, openRead } = createMemoryStorage();

    const response = await request(createTestAppWithStorage(storage)).get(path);

    expect(response.status).toBe(404);
    expect(openRead).not.toHaveBeenCalled();
  });

  it('a hiányzó (pl. az elrejtett kép törölt) előnézet 404', async () => {
    const { storage } = createMemoryStorage();

    const response = await request(createTestAppWithStorage(storage)).get(
      `/media/previews/${PHOTO_ID}.jpg`,
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('ha a fájl folyama küldés közben megszakad, a kapcsolatot bontja (csonka kép nem marad)', async () => {
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

    await expect(
      request(createTestAppWithStorage(storage)).get(`/media/previews/${PHOTO_ID}.jpg`),
    ).rejects.toThrow();
  });

  it('a tárhely hibájánál általános szerverhiba, részletek nélkül', async () => {
    const { storage, openRead } = createMemoryStorage();
    openRead.mockRejectedValue(new StorageUnavailableError('A tárhely nem érhető el (olvasás)'));

    const response = await request(createTestAppWithStorage(storage)).get(
      `/media/previews/${PHOTO_ID}.jpg`,
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('tárhely');
  });
});
