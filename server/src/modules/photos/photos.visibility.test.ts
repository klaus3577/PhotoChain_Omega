// A képek láthatósági szabályának unit tesztjei (L13, L16): a nyilvános kép a regisztrált, nem
// letiltott fotós képe; a többit csak a tulajdonosa és az admin látja.
import { describe, expect, it } from 'vitest';

import type { PhotoStatus } from '../../generated/prisma/client.js';
import {
  canManage,
  canView,
  isPublic,
  PUBLIC_PHOTO_WHERE,
  type PhotoViewer,
} from './photos.visibility.js';

const OWNER_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const OWNER: PhotoViewer = { id: OWNER_ID, role: 'USER' };
const STRANGER: PhotoViewer = { id: '7e6d5c4b-3a2f-4e1d-9c0b-8a7f6e5d4c3b', role: 'USER' };
const ADMIN: PhotoViewer = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', role: 'ADMIN' };
const NON_PUBLIC_STATUSES: PhotoStatus[] = ['PENDING_CHAIN', 'CHAIN_FAILED', 'HIDDEN'];

const photo = (status: PhotoStatus, ownerBlocked = false) => ({
  status,
  ownerId: OWNER_ID,
  owner: { isBlocked: ownerBlocked },
});

describe('isPublic', () => {
  it('csak a regisztrált kép nyilvános, és csak ha a fotósa nincs letiltva', () => {
    expect(isPublic(photo('REGISTERED'))).toBe(true);
    expect(isPublic(photo('REGISTERED', true))).toBe(false);
    for (const status of NON_PUBLIC_STATUSES) expect(isPublic(photo(status))).toBe(false);
  });
});

describe('canView', () => {
  it('a nyilvános képet bárki látja, bejelentkezés nélkül is', () => {
    for (const viewer of [null, OWNER, STRANGER, ADMIN]) {
      expect(canView(photo('REGISTERED'), viewer)).toBe(true);
    }
  });

  it('a nem nyilvános képet csak a tulajdonosa és az admin látja', () => {
    for (const status of NON_PUBLIC_STATUSES) {
      expect(canView(photo(status), OWNER)).toBe(true);
      expect(canView(photo(status), ADMIN)).toBe(true);
      expect(canView(photo(status), STRANGER)).toBe(false);
      expect(canView(photo(status), null)).toBe(false);
    }
  });

  it('a letiltott fotós regisztrált képét a tiltás idejére csak az admin látja', () => {
    const blocked = photo('REGISTERED', true);

    expect(canView(blocked, ADMIN)).toBe(true);
    expect(canView(blocked, STRANGER)).toBe(false);
    expect(canView(blocked, null)).toBe(false);
  });
});

describe('canManage', () => {
  it('a képet a tulajdonosa és az admin kezeli (elrejtés, a függő tranzakció adata); más és a vendég nem', () => {
    for (const status of ['REGISTERED', ...NON_PUBLIC_STATUSES] as PhotoStatus[]) {
      expect(canManage(photo(status), OWNER)).toBe(true);
      expect(canManage(photo(status), ADMIN)).toBe(true);
      expect(canManage(photo(status), STRANGER)).toBe(false);
      expect(canManage(photo(status), null)).toBe(false);
    }
  });
});

describe('PUBLIC_PHOTO_WHERE', () => {
  it('a lekérdezések ugyanazt a szabályt szűrik: regisztrált kép, nem letiltott fotós', () => {
    expect(PUBLIC_PHOTO_WHERE).toEqual({ status: 'REGISTERED', owner: { isBlocked: false } });
  });
});
