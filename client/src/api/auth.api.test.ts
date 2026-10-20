// Az /api/auth végpontok kliense: a válasz futásidejű ellenőrzése, és a bejelentkezés hiánya (401,
// letiltott fióknál 403) nem hiba, hanem „nincs bejelentkezett felhasználó”.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import { fetchSessionUser, isSessionEndError, login, logout, register } from './auth.api';
import { ApiError } from './http';

const user = {
  id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  email: 'anna@pelda.hu',
  displayName: 'Kiss Anna',
  bio: null,
  role: 'USER',
  createdAt: '2026-10-08T10:00:00.000Z',
};

const requestOf = (fetchMock: ReturnType<typeof stubFetch>, index = 0) => {
  const [url, init] = fetchMock.mock.calls[index]!;
  return {
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

describe('fetchSessionUser', () => {
  it('a GET /api/auth/me válaszából a felhasználót adja', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { user } }));

    await expect(fetchSessionUser()).resolves.toEqual(user);
    expect(requestOf(fetchMock)).toMatchObject({ url: '/api/auth/me', method: 'GET' });
  });

  it('bejelentkezés nélkül a szerver 200-at ad user: null-lal (L26) – null, kérés-hiba nélkül', async () => {
    stubFetch(jsonResponse(200, { data: { user: null } }));

    await expect(fetchSessionUser()).resolves.toBeNull();
  });

  it('a régebbi szerver 401-e és a letiltott fiók 403-a is null – nincs bejelentkezett felhasználó', async () => {
    stubFetch(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Bejelentkezés szükséges' } }),
      jsonResponse(403, { error: { code: 'ACCOUNT_BLOCKED', message: 'A fiókot letiltották' } }),
    );

    await expect(fetchSessionUser()).resolves.toBeNull();
    await expect(fetchSessionUser()).resolves.toBeNull();
  });

  it('más hibát (pl. szerverhiba) továbbad – ilyenkor nem tudni, be van-e jelentkezve', async () => {
    stubFetch(
      jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'Váratlan szerverhiba' } }),
    );

    await expect(fetchSessionUser()).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('a bemutatkozás szöveg is lehet (nem csak null)', async () => {
    stubFetch(jsonResponse(200, { data: { user: { ...user, bio: 'Tájképfotós.' } } }));

    await expect(fetchSessionUser()).resolves.toMatchObject({ bio: 'Tájképfotós.' });
  });

  it('a nem objektum felhasználót és a hiányzó dátumot is váratlan válasznak tekinti', async () => {
    stubFetch(
      jsonResponse(200, { data: { user: 'anna' } }),
      jsonResponse(200, { data: null }),
      jsonResponse(200, { data: { user: { ...user, createdAt: 0 } } }),
      jsonResponse(200, { data: { user: { ...user, bio: 42 } } }),
    );

    for (let i = 0; i < 4; i += 1) {
      await expect(fetchSessionUser()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    }
  });

  it('a hiányos felhasználói adatot (pl. ismeretlen szerepkör) váratlan válasznak tekinti', async () => {
    stubFetch(
      jsonResponse(200, { data: { user: { ...user, role: 'SUPERUSER' } } }),
      jsonResponse(200, { data: { user: { ...user, email: undefined } } }),
      jsonResponse(200, { data: {} }),
      jsonResponse(200, { data: { user: { ...user, id: 42 } } }),
      jsonResponse(200, { data: { user: { ...user, displayName: null } } }),
    );

    for (let i = 0; i < 5; i += 1) {
      await expect(fetchSessionUser()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    }
  });
});

describe('isSessionEndError', () => {
  it('a hiányzó vagy lejárt munkamenet (401 UNAUTHORIZED) és a letiltott fiók (403 ACCOUNT_BLOCKED) a munkamenet végét jelzi', () => {
    expect(isSessionEndError(new ApiError(401, 'UNAUTHORIZED', 'Bejelentkezés szükséges'))).toBe(
      true,
    );
    expect(
      isSessionEndError(
        new ApiError(403, 'ACCOUNT_BLOCKED', 'A fiókot az adminisztrátor letiltotta'),
      ),
    ).toBe(true);
  });

  it('a hibás belépés, a jogosultsághiány és a nem API-hiba nem', () => {
    expect(
      isSessionEndError(new ApiError(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó')),
    ).toBe(false);
    expect(isSessionEndError(new ApiError(403, 'FORBIDDEN', 'Nincs jogosultság'))).toBe(false);
    expect(isSessionEndError(new Error('UNAUTHORIZED'))).toBe(false);
  });
});

describe('login, register, logout', () => {
  it('a belépés POST-tal küldi az adatokat, és a felhasználót adja', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { user } }));

    await expect(login({ email: 'anna@pelda.hu', password: 'titok-jelszo' })).resolves.toEqual(
      user,
    );
    expect(requestOf(fetchMock)).toEqual({
      url: '/api/auth/login',
      method: 'POST',
      body: { email: 'anna@pelda.hu', password: 'titok-jelszo' },
    });
  });

  it('a hibás belépés a szerver hibáját adja tovább (nem null)', async () => {
    stubFetch(
      jsonResponse(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Hibás e-mail-cím vagy jelszó' },
      }),
    );

    await expect(login({ email: 'anna@pelda.hu', password: 'rossz' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('a regisztráció POST-tal küldi az adatokat (201), és a felhasználót adja', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { data: { user } }));
    const input = { displayName: 'Kiss Anna', email: 'anna@pelda.hu', password: 'hosszu-jelszo' };

    await expect(register(input)).resolves.toEqual(user);
    expect(requestOf(fetchMock)).toEqual({
      url: '/api/auth/register',
      method: 'POST',
      body: input,
    });
  });

  it('a kijelentkezés POST /api/auth/logout (204, törzs nélkül)', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();
    expect(requestOf(fetchMock)).toEqual({
      url: '/api/auth/logout',
      method: 'POST',
      body: undefined,
    });
  });
});

describe('a felhasználó azonosítójának és dátumának alakja (L23)', () => {
  it('nem UUID azonosítóval vagy nem ISO dátummal váratlan válasz – a profil hivatkozása az azonosítóból épül', async () => {
    stubFetch(
      jsonResponse(200, { data: { user: { ...user, id: '../dashboard' } } }),
      jsonResponse(200, { data: { user: { ...user, createdAt: 'tegnap' } } }),
    );

    await expect(fetchSessionUser()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    await expect(fetchSessionUser()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
});
