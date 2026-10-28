// A /media őrének egységtesztjei adatbázis nélkül: az útvonal felbontása, és hogy az őr mikor fordul az
// adatbázishoz és a munkamenethez. A teljes útvonal tesztjei (helyi és távoli tárhellyel, a
// tesztadatbázison): tests/db/media.test.ts.
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import type { AppError } from '../lib/errors.js';
import type { PhotoViewer } from '../modules/photos/photos.visibility.js';
import { createMediaAccess, mediaFileMissing, parsePublicMediaPath } from './mediaAccess.js';

const ID = '3f2b8a52-6c1e-4f0a-9d4e-1b2c3d4e5f60';
const OWNER_ID = '9a1c5e70-2b3d-4f61-8e92-0c4d5e6f7a81';
const STRANGER_ID = '7c0a2d44-5e6f-4a8b-9c1d-2e3f4a5b6c7d';

/** A kép az őr számára szükséges mezőkkel. */
function photoRow(status: 'REGISTERED' | 'PENDING_CHAIN' | 'HIDDEN', isBlocked = false) {
  return {
    status,
    ownerId: OWNER_ID,
    owner: { isBlocked },
    previewKey: `previews/${ID}.jpg`,
    thumbnailKey: `thumbnails/${ID}.jpg`,
  };
}

const owner: PhotoViewer = { id: OWNER_ID, role: 'USER' };
const stranger: PhotoViewer = { id: STRANGER_ID, role: 'USER' };
const admin: PhotoViewer = { id: STRANGER_ID, role: 'ADMIN' };

interface RunOptions {
  method?: string;
  path: string;
  photo?: ReturnType<typeof photoRow> | null;
  viewer?: PhotoViewer | null;
}

/** Az őr futtatása utánzatokkal: a kép lekérdezése és a munkamenet megfigyelhető. */
async function run({ method = 'GET', path, photo = null, viewer = null }: RunOptions) {
  const findUnique = vi.fn().mockResolvedValue(photo);
  const sessionViewer = vi.fn().mockResolvedValue(viewer);
  const guard = createMediaAccess({
    prisma: { photo: { findUnique } } as unknown as PrismaClient,
    sessionViewer,
  });
  const headers = new Map<string, string>();
  const res = {
    set: (name: string, value: string) => headers.set(name, value),
    get: (name: string) => headers.get(name),
  } as unknown as Response;
  const next = vi.fn();
  await guard({ method, path } as Request, res, next);
  const error = next.mock.calls[0]?.[0] as AppError | undefined;
  return { findUnique, sessionViewer, next, headers, status: error?.statusCode };
}

describe('parsePublicMediaPath', () => {
  it('a két nyilvános mappa szabályos fájlját adja a kép azonosítójával', () => {
    expect(parsePublicMediaPath(`/previews/${ID}.jpg`)).toEqual({
      key: `previews/${ID}.jpg`,
      photoId: ID,
    });
    expect(parsePublicMediaPath(`/thumbnails/${ID}.webp`)).toEqual({
      key: `thumbnails/${ID}.webp`,
      photoId: ID,
    });
  });

  it.each([
    `/originals/${ID}.jpg`,
    `/previews/${ID}.JPG`,
    `/previews/${ID.toUpperCase()}.jpg`,
    `/previews/${ID}.jpg/`,
    `/previews/${ID}.jpg.png`,
    `/previews/${ID}.gif`,
    `/previews/${ID.replace('3', '%33')}.jpg`,
    `/previews/..%2F..%2Foriginals%2F${ID}.jpg`,
    `//previews/${ID}.jpg`,
    `previews/${ID}.jpg`,
    '/previews/',
    '/',
    '',
  ])('minden más útvonalra null (%s)', (path) => {
    expect(parsePublicMediaPath(path)).toBeNull();
  });
});

describe('createMediaAccess', () => {
  it('a nyilvános kép fájlját továbbengedi – a munkamenet betöltése és gyorsítótár-tiltás nélkül', async () => {
    const result = await run({ path: `/previews/${ID}.jpg`, photo: photoRow('REGISTERED') });

    expect(result.next).toHaveBeenCalledWith();
    expect(result.sessionViewer).not.toHaveBeenCalled();
    expect(result.headers.has('Cache-Control')).toBe(false);
  });

  it('a nem nyilvános képet csak a kezelőjének engedi tovább, no-store fejléccel', async () => {
    const pending = photoRow('PENDING_CHAIN');
    const forOwner = await run({ path: `/previews/${ID}.jpg`, photo: pending, viewer: owner });
    const forAdmin = await run({ path: `/previews/${ID}.jpg`, photo: pending, viewer: admin });
    const forStranger = await run({
      path: `/previews/${ID}.jpg`,
      photo: pending,
      viewer: stranger,
    });
    const anonymous = await run({ path: `/previews/${ID}.jpg`, photo: pending });

    expect(forOwner.next).toHaveBeenCalledWith();
    expect(forAdmin.next).toHaveBeenCalledWith();
    expect(forStranger.status).toBe(404);
    expect(anonymous.status).toBe(404);
    for (const result of [forOwner, forAdmin, forStranger, anonymous]) {
      expect(result.sessionViewer).toHaveBeenCalledTimes(1);
      expect(result.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('a letiltott fotós regisztrált képe nem nyilvános: a kezelője megkapja, névtelenül 404', async () => {
    const blocked = photoRow('REGISTERED', true);

    const forOwner = await run({ path: `/thumbnails/${ID}.jpg`, photo: blocked, viewer: owner });
    const anonymous = await run({ path: `/thumbnails/${ID}.jpg`, photo: blocked });

    expect(forOwner.next).toHaveBeenCalledWith();
    expect(anonymous.status).toBe(404);
  });

  it('a rejtett kép fájlját a kezelője sem kapja meg: 404 no-store, a munkamenet betöltése nélkül', async () => {
    const result = await run({
      path: `/previews/${ID}.jpg`,
      photo: photoRow('HIDDEN'),
      viewer: owner,
    });

    expect(result.status).toBe(404);
    expect(result.sessionViewer).not.toHaveBeenCalled();
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });

  it('a lánc vége (mediaFileMissing): a hiányzó fájl ugyanazt a 404-et kapja, no-store fejléccel', () => {
    const headers = new Map<string, string>();
    const res = {
      set: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;
    const next = vi.fn();

    mediaFileMissing({} as Request, res, next);

    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('A kép nem található');
    expect(headers.get('Cache-Control')).toBe('no-store');
  });

  it('csak a kép saját kulcsa adható ki; a nem létező kép 404', async () => {
    const otherName = await run({ path: `/thumbnails/${ID}.png`, photo: photoRow('REGISTERED') });
    const unknown = await run({ path: `/previews/${ID}.jpg`, photo: null });

    expect(otherName.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('Cache-Control')).toBe('no-store');
  });

  it('más metódus és szabálytalan útvonal: 404 az adatbázis és a munkamenet érintése nélkül', async () => {
    const post = await run({
      method: 'POST',
      path: `/previews/${ID}.jpg`,
      photo: photoRow('REGISTERED'),
    });
    const invalid = await run({ path: '/previews/nem-azonosito.jpg' });

    for (const result of [post, invalid]) {
      expect(result.status).toBe(404);
      expect(result.findUnique).not.toHaveBeenCalled();
      expect(result.sessionViewer).not.toHaveBeenCalled();
    }
  });
});
