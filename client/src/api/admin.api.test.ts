// Az admin végpontok kliense (L25): a listák lekérdezése a szerver paramétereivel, a tiltás, az
// elrejtés és az újrapróbálás kérése; a válasz külső adat – a hibás alakú sor (ismeretlen szerepkör,
// a rejtett állapottal ellentmondó hiddenBy, hiányzó állapot a statisztikában) UNEXPECTED_RESPONSE.
import { describe, expect, it } from 'vitest';

import {
  adminPhoto,
  adminPhotoResponse,
  adminPhotosResponse,
  adminUser,
  adminUserResponse,
  adminUsersResponse,
  FAILED_PHOTO_ID,
  platformStats,
  retryResponse,
  statsResponse,
} from '../test/admin';
import { jsonResponse, requestedUrls, stubFetch } from '../test/fetch';
import { OWNER_ID, PHOTO_ID } from '../test/photos';
import {
  getPlatformStats,
  listAdminPhotos,
  listAdminUsers,
  retryRegistration,
  setPhotoHidden,
  setUserBlocked,
} from './admin.api';
import { ApiError } from './http';

const unexpectedResponse = expect.objectContaining({ code: 'UNEXPECTED_RESPONSE' });

/** A fetch egyetlen hívásának címe, metódusa és JSON-törzse. */
function sentRequest(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url: String(url), method: init?.method, body: init?.body };
}

describe('listAdminUsers', () => {
  it('a lekérdezést változatlanul küldi (GET /api/admin/users?…), a válasz felhasználói ellenőrzöttek', async () => {
    const fetchMock = stubFetch(adminUsersResponse([adminUser()], { total: 42 }));

    const page = await listAdminUsers('?q=fa&blocked=false&page=2&pageSize=20');

    expect(requestedUrls(fetchMock)).toEqual([
      '/api/admin/users?q=fa&blocked=false&page=2&pageSize=20',
    ]);
    expect(page.users[0]).toMatchObject({ displayName: 'Fotós Fanni', photoCount: 3 });
    expect(page.meta.total).toBe(42);
  });

  it('csak „?”-lel kezdődő lekérdezéssel indít kérést (az útvonal nem módosítható)', async () => {
    await expect(listAdminUsers('/../photos')).rejects.toThrow(RangeError);
  });

  it.each([
    ['ismeretlen szerepkör', { role: 'OWNER' }],
    ['hiányzó e-mail', { email: undefined }],
    ['nem egész képszám', { photoCount: 1.5 }],
    ['nem logikai tiltás', { isBlocked: 'true' }],
    ['érvénytelen dátum', { createdAt: 'tegnap' }],
  ])('hibás sor (%s) → UNEXPECTED_RESPONSE', async (_name, overrides) => {
    stubFetch(adminUsersResponse([adminUser(overrides)]));

    await expect(listAdminUsers('?page=1&pageSize=20')).rejects.toMatchObject(unexpectedResponse);
  });
});

describe('setUserBlocked', () => {
  it('PATCH /api/admin/users/:id a tiltással; a válasz a felhasználó', async () => {
    const fetchMock = stubFetch(adminUserResponse(adminUser({ isBlocked: true })));

    const user = await setUserBlocked(OWNER_ID, true);

    expect(sentRequest(fetchMock)).toEqual({
      url: `/api/admin/users/${OWNER_ID}`,
      method: 'PATCH',
      body: JSON.stringify({ isBlocked: true }),
    });
    expect(user.isBlocked).toBe(true);
  });

  it('más felhasználó a válaszban → UNEXPECTED_RESPONSE; a szerver hibája ApiError', async () => {
    stubFetch(adminUserResponse(adminUser({ id: '00000000-0000-0000-0000-000000000000' })));
    await expect(setUserBlocked(OWNER_ID, true)).rejects.toMatchObject(unexpectedResponse);

    stubFetch(
      jsonResponse(409, {
        error: { code: 'CONFLICT', message: 'Adminisztrátor nem tiltható le' },
      }),
    );
    await expect(setUserBlocked(OWNER_ID, true)).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'CONFLICT',
    });
  });
});

describe('listAdminPhotos', () => {
  it('a lekérdezést változatlanul küldi; a válasz képei ellenőrzöttek (tulajdonos tiltása, ki rejtette el, lánc-adatok)', async () => {
    const fetchMock = stubFetch(
      adminPhotosResponse([
        adminPhoto(),
        adminPhoto({ status: 'HIDDEN', hiddenBy: 'OWNER_AND_ADMIN', thumbnailUrl: null }),
        adminPhoto({ status: 'CHAIN_FAILED', chainTxHash: null, registeredAt: null }),
      ]),
    );

    const page = await listAdminPhotos('?status=HIDDEN&page=1&pageSize=20');

    expect(requestedUrls(fetchMock)).toEqual([
      '/api/admin/photos?status=HIDDEN&page=1&pageSize=20',
    ]);
    expect(page.photos).toHaveLength(3);
    expect(page.photos[0]).toMatchObject({
      title: 'Őszi erdő ködben',
      owner: { displayName: 'Fotós Fanni', isBlocked: false },
    });
  });

  it.each([
    ['rejtett kép hiddenBy nélkül', { status: 'HIDDEN', hiddenBy: null }],
    ['nyilvános kép hiddenBy-jal', { status: 'REGISTERED', hiddenBy: 'ADMIN' }],
    ['ismeretlen hiddenBy', { status: 'HIDDEN', hiddenBy: 'MODERATOR' }],
    ['hibás tranzakció-hash', { chainTxHash: 'abc' }],
    ['hibás regisztrációs idő', { registeredAt: 12 }],
    ['tulajdonos tiltása nem logikai', { owner: { id: OWNER_ID, displayName: 'F', isBlocked: 1 } }],
    ['idegen bélyegkép', { thumbnailUrl: 'https://pelda.hu/kep.webp' }],
  ])('hibás sor (%s) → UNEXPECTED_RESPONSE', async (_name, overrides) => {
    stubFetch(adminPhotosResponse([adminPhoto(overrides)]));

    await expect(listAdminPhotos('?page=1&pageSize=20')).rejects.toMatchObject(unexpectedResponse);
  });
});

describe('setPhotoHidden', () => {
  it('PATCH /api/admin/photos/:id az elrejtéssel; a válasz a kép', async () => {
    const hidden = adminPhoto({ status: 'HIDDEN', hiddenBy: 'ADMIN', thumbnailUrl: null });
    const fetchMock = stubFetch(adminPhotoResponse(hidden));

    const photo = await setPhotoHidden(PHOTO_ID, true);

    expect(sentRequest(fetchMock)).toEqual({
      url: `/api/admin/photos/${PHOTO_ID}`,
      method: 'PATCH',
      body: JSON.stringify({ hidden: true }),
    });
    expect(photo).toMatchObject({ status: 'HIDDEN', hiddenBy: 'ADMIN', thumbnailUrl: null });
  });

  it('más kép a válaszban → UNEXPECTED_RESPONSE', async () => {
    stubFetch(adminPhotoResponse(adminPhoto({ id: FAILED_PHOTO_ID })));

    await expect(setPhotoHidden(PHOTO_ID, false)).rejects.toMatchObject(unexpectedResponse);
  });
});

describe('retryRegistration', () => {
  it('POST /api/admin/photos/:id/retry-registration → 202, a kép újra várakozik', async () => {
    const fetchMock = stubFetch(retryResponse(FAILED_PHOTO_ID));

    const started = await retryRegistration(FAILED_PHOTO_ID);

    expect(sentRequest(fetchMock)).toEqual({
      url: `/api/admin/photos/${FAILED_PHOTO_ID}/retry-registration`,
      method: 'POST',
      body: undefined,
    });
    expect(started).toEqual({ id: FAILED_PHOTO_ID, status: 'PENDING_CHAIN' });
  });

  it('más kép vagy más állapot a válaszban → UNEXPECTED_RESPONSE', async () => {
    stubFetch(retryResponse(PHOTO_ID));
    await expect(retryRegistration(FAILED_PHOTO_ID)).rejects.toMatchObject(unexpectedResponse);

    stubFetch(retryResponse(FAILED_PHOTO_ID, 'REGISTERED'));
    await expect(retryRegistration(FAILED_PHOTO_ID)).rejects.toMatchObject(unexpectedResponse);
  });

  it('a korlátozás (429) hibája a várakozás idejével érkezik', async () => {
    stubFetch(
      jsonResponse(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Túl sok újrapróbálás' } },
        { 'Retry-After': '60' },
      ),
    );

    await expect(retryRegistration(FAILED_PHOTO_ID)).rejects.toSatisfy(
      (error) => error instanceof ApiError && error.retryAfterSeconds === 60,
    );
  });
});

describe('getPlatformStats', () => {
  it('GET /api/admin/stats: minden állapot számmal, az összegek egyeznek', async () => {
    const fetchMock = stubFetch(statsResponse());

    const stats = await getPlatformStats();

    expect(requestedUrls(fetchMock)).toEqual(['/api/admin/stats']);
    expect(stats).toEqual(platformStats());
  });

  it.each([
    ['hiányzó képállapot', { photos: { total: 3, byStatus: { REGISTERED: 3 } } }],
    [
      'az összeg nem egyezik',
      {
        photos: {
          total: 5,
          byStatus: { PENDING_CHAIN: 0, REGISTERED: 3, CHAIN_FAILED: 0, HIDDEN: 0 },
        },
      },
    ],
    ['több tiltott, mint felhasználó', { users: { total: 1, blocked: 2, admins: 1 } }],
    ['negatív bevétel', { revenueHuf: -1 }],
    ['nem egész hash-szám', { registeredHashes: '125' }],
  ])('hibás statisztika (%s) → UNEXPECTED_RESPONSE', async (_name, overrides) => {
    stubFetch(statsResponse(platformStats(overrides)));

    await expect(getPlatformStats()).rejects.toMatchObject(unexpectedResponse);
  });
});
