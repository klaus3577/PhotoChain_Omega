// A helyi tárhely tesztjei (ideiglenes mappában): privát és nyilvános fájlok helye, olvasás, törlés,
// és a mappából kivezető kulcsok elutasítása.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fájl megnyitása az eredeti marad; egy teszt a megnyitott fájl hibáját szimulálja
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, open: vi.fn(original.open) };
});

import { createLocalStorage } from './local.storage.js';
import { StorageKeyError, type StorageService } from './storage.types.js';

const ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';
const DATA = Buffer.from('képadat');

let root: string;
let storage: StorageService;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'photochain-storage-'));
  storage = createLocalStorage(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createLocalStorage', () => {
  it('az eredetit a privát, az előnézetet és a bélyegképet a nyilvános mappába menti', async () => {
    await storage.save(`originals/${ID}.jpg`, DATA);
    await storage.save(`previews/${ID}.jpg`, DATA);
    await storage.save(`thumbnails/${ID}.jpg`, DATA);

    expect(readFileSync(join(root, 'originals', `${ID}.jpg`))).toEqual(DATA);
    expect(existsSync(join(root, 'public', 'previews', `${ID}.jpg`))).toBe(true);
    expect(existsSync(join(root, 'public', 'thumbnails', `${ID}.jpg`))).toBe(true);
    // Az eredeti nem kerülhet a nyilvánosan kiszolgált mappába
    expect(existsSync(join(root, 'public', 'originals'))).toBe(false);
  });

  it('a mentett fájlt visszaolvassa, a törölt fájl eltűnik', async () => {
    await storage.save(`originals/${ID}.png`, DATA);

    await expect(storage.read(`originals/${ID}.png`)).resolves.toEqual(DATA);
    await storage.delete(`originals/${ID}.png`);

    expect(existsSync(join(root, 'originals', `${ID}.png`))).toBe(false);
    await expect(storage.read(`originals/${ID}.png`)).rejects.toThrow();
  });

  it('nem létező fájl törlése nem hiba (a takarítás többször is futhat)', async () => {
    await expect(storage.delete(`previews/${ID}.jpg`)).resolves.toBeUndefined();
  });

  it('meglévő fájlt nem ír felül', async () => {
    await storage.save(`originals/${ID}.jpg`, DATA);

    await expect(storage.save(`originals/${ID}.jpg`, Buffer.from('más'))).rejects.toThrow();
    await expect(storage.read(`originals/${ID}.jpg`)).resolves.toEqual(DATA);
  });

  it('csak a saját mintájára illő kulcsot fogad el – a mappából nem lehet kilépni', async () => {
    const invalidKeys = [
      '../titok.jpg',
      `originals/../../${ID}.jpg`,
      // Érvényes kulcs más előtaggal: a mintának a kulcs elejére kell illeszkednie
      `../originals/${ID}.jpg`,
      `x/originals/${ID}.jpg`,
      `public/previews/${ID}.jpg`,
      `C:/Windows/${ID}.jpg`,
      `/etc/${ID}.jpg`,
      `uploads/${ID}.jpg`,
      `originals/${ID}.exe`,
      'previews/nem-uuid.jpg',
      `originals/${ID}.jpg\u0000.png`,
    ];

    for (const key of invalidKeys) {
      await expect(storage.save(key, DATA)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(storage.read(key)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(storage.delete(key)).rejects.toBeInstanceOf(StorageKeyError);
    }
  });

  it('nyilvános URL-t csak az előnézethez és a bélyegképhez ad', () => {
    expect(storage.publicUrl(`previews/${ID}.jpg`)).toBe(`/media/previews/${ID}.jpg`);
    expect(storage.publicUrl(`thumbnails/${ID}.jpg`)).toBe(`/media/thumbnails/${ID}.jpg`);
    expect(() => storage.publicUrl(`originals/${ID}.jpg`)).toThrow(StorageKeyError);
  });

  it('a fájlt folyamként (stream) is megnyitja, a méretével együtt – a letöltéshez', async () => {
    await storage.save(`originals/${ID}.jpg`, DATA);

    const file = await storage.openRead(`originals/${ID}.jpg`);

    expect(file.size).toBe(DATA.length);
    expect(Buffer.concat(await file.stream.toArray())).toEqual(DATA);
  });

  it('a hiányzó fájl már a megnyitáskor hibát ad (a válasz elküldése előtt)', async () => {
    await expect(storage.openRead(`originals/${ID}.jpg`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('ha a megnyitott fájl adatai nem olvashatók, a fájlt bezárja, és a hibát továbbadja', async () => {
    const failure = new Error('a fájl adatai nem olvashatók');
    const close = vi.fn(async () => {});
    const brokenHandle = { stat: () => Promise.reject(failure), close };
    vi.mocked(open).mockResolvedValueOnce(brokenHandle as unknown as FileHandle);

    await expect(storage.openRead(`originals/${ID}.jpg`)).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it('a megnyitás is csak a saját mintájára illő kulcsot fogadja el', async () => {
    for (const key of ['../titok.jpg', `originals/../${ID}.jpg`, `originals/${ID}.exe`]) {
      await expect(storage.openRead(key)).rejects.toThrow(StorageKeyError);
    }
  });
});
