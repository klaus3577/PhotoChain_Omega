// Tesztfelhasználók és a szerver felhasználós válaszai (kitalált adatok, csak a tesztekben).
import type { AuthUser } from '../api/auth.api';
import { jsonResponse } from './fetch';
import { OWNER_ID } from './photos';

export const testUser: AuthUser = {
  id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  email: 'anna@pelda.hu',
  displayName: 'Kiss Anna',
  bio: null,
  role: 'USER',
  createdAt: '2026-10-08T10:00:00.000Z',
};

export const testAdmin: AuthUser = {
  ...testUser,
  id: 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
  email: 'admin@pelda.hu',
  displayName: 'Admin Ádám',
  role: 'ADMIN',
};

/**
 * Felhasználó a szerver formájú (UUID) azonosítójával – a profiloldal (L23) tesztjeihez: a testUser
 * „u1” azonosítója nem indítana kérést. Ugyanaz, mint a tesztképek tulajdonosa (photos.ts OWNER_ID).
 */
export const profileUser: AuthUser = {
  ...testUser,
  id: OWNER_ID,
  email: 'fanni@pelda.hu',
  displayName: 'Fotós Fanni',
  bio: 'Tájképek és portrék, főleg Budapestről.\nNyomtatott képeket is készítek.',
  createdAt: '2026-09-20T08:00:00.000Z',
};

/** A publikus fotósprofil (PublicProfileDto – GET /api/users/:id). */
export function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNER_ID,
    displayName: 'Fotós Fanni',
    bio: 'Tájképek és portrék, főleg Budapestről.\nNyomtatott képeket is készítek.',
    createdAt: '2026-09-20T08:00:00.000Z',
    photoCount: 3,
    rating: { average: 4.6, count: 12 },
    ...overrides,
  };
}

/** GET /api/users/:id válasza. */
export const profileResponse = (value: unknown = profile()) =>
  jsonResponse(200, { data: { user: value } });

/** A szerver válasza a felhasználóval (belépés, regisztráció: 201, /auth/me). */
export const userResponse = (user: AuthUser, status = 200) =>
  jsonResponse(status, { data: { user } });

/** A szerver hibaválasza a borítékban. */
export const errorResponse = (
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
) => jsonResponse(status, { error: { code, message } }, headers);
