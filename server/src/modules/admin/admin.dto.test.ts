// Az admin felületnek küldött felhasználó- és kép-adatok (DTO) unit tesztjei (L16): csak a felsorolt
// mezők kerülnek a válaszba (a jelszó-hash és az eredeti fájl kulcsa soha), az elrejtett kép
// bélyegképe nélkül.
import { describe, expect, it } from 'vitest';

import type { StorageService } from '../../services/storage/storage.types.js';
import {
  type AdminPhotoRow,
  type AdminUserRow,
  toAdminPhotoDto,
  toAdminUserDto,
} from './admin.dto.js';

const storage: Pick<StorageService, 'publicUrl'> = {
  publicUrl: (key) => `/media/${key}`,
};
const CREATED_AT = new Date('2026-10-01T10:00:00.000Z');
const USER_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const PHOTO_ID = '7e6d5c4b-3a2f-4e1d-9c0b-8a7f6e5d4c3b';

const userRow: AdminUserRow = {
  id: USER_ID,
  email: 'anna@photochain.test',
  displayName: 'Fotós Anna',
  role: 'USER',
  isBlocked: true,
  createdAt: CREATED_AT,
  _count: { photos: 3 },
};

const photoRow: AdminPhotoRow = {
  id: PHOTO_ID,
  title: 'Tócsa',
  priceHuf: 2500,
  status: 'REGISTERED',
  hiddenBy: null,
  width: 4000,
  height: 3000,
  thumbnailKey: `thumbnails/${PHOTO_ID}.jpg`,
  createdAt: CREATED_AT,
  chainTxHash: `0x${'ab'.repeat(32)}`,
  registeredAt: CREATED_AT,
  category: { id: 1, name: 'Városok', slug: 'varosok' },
  owner: { id: USER_ID, displayName: 'Fotós Anna', isBlocked: false },
};

describe('toAdminUserDto', () => {
  it('az admin látja az e-mailt, a szerepkört, a tiltást és a képek számát – a többit nem', () => {
    // A bővebb (pl. jelszó-hash-sel lekérdezett) sorból is csak a felsorolt mezők maradnak
    const row = { ...userRow, passwordHash: 'nem-valodi-hash', bio: 'Bemutatkozás' };

    expect(toAdminUserDto(row)).toEqual({
      id: USER_ID,
      email: 'anna@photochain.test',
      displayName: 'Fotós Anna',
      role: 'USER',
      isBlocked: true,
      createdAt: CREATED_AT,
      photoCount: 3,
    });
  });
});

describe('toAdminPhotoDto', () => {
  it('a lista mezői, kiegészítve a moderáláshoz és a lánc-hibák kezeléséhez szükségesekkel', () => {
    const row = { ...photoRow, originalKey: `originals/${PHOTO_ID}.jpg`, gasUsed: 70_000n };

    expect(toAdminPhotoDto(row, storage)).toEqual({
      id: PHOTO_ID,
      title: 'Tócsa',
      priceHuf: 2500,
      status: 'REGISTERED',
      hiddenBy: null,
      width: 4000,
      height: 3000,
      thumbnailUrl: `/media/thumbnails/${PHOTO_ID}.jpg`,
      category: { id: 1, name: 'Városok', slug: 'varosok' },
      owner: { id: USER_ID, displayName: 'Fotós Anna', isBlocked: false },
      chainTxHash: photoRow.chainTxHash,
      registeredAt: CREATED_AT,
      createdAt: CREATED_AT,
    });
  });

  it('az elrejtett kép bélyegképe törlődött: nincs URL-je; látszik, ki rejtette el', () => {
    const dto = toAdminPhotoDto({ ...photoRow, status: 'HIDDEN', hiddenBy: 'ADMIN' }, storage);

    expect(dto).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN', thumbnailUrl: null });
  });
});
