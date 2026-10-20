// Az adminfelület tesztadatai a szerver válaszainak formájában (server/src/modules/admin –
// admin.dto.ts, admin.stats.ts; L16). Az oldal három, egyszerre induló kérése (statisztika,
// felhasználók, képek) útvonalhoz kötött választ kap (adminResponses): a kérések sorrendje nem számít.
import { forPath, jsonResponse, type Outcome } from './fetch';
import { CATEGORIES, OWNER_ID, PENDING_TX_HASH, PHOTO_ID, TX_HASH } from './photos';
import { testAdmin } from './users';

export const BLOCKED_USER_ID = '7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0f';
export const PENDING_PHOTO_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9';
export const FAILED_PHOTO_ID = '2c3d4e5f-6071-4829-93a4-b5c6d7e8f901';
export const OWNER_HIDDEN_PHOTO_ID = '3d4e5f60-7182-493a-a4b5-c6d7e8f90112';
export const TAKEN_DOWN_PHOTO_ID = '4e5f6071-8293-4a4b-b5c6-d7e8f9011223';

/** Egy felhasználó az admin listájában (AdminUserDto) – alapból Fotós Fanni, aktív. */
export function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    id: OWNER_ID,
    email: 'fanni@pelda.hu',
    displayName: 'Fotós Fanni',
    role: 'USER',
    isBlocked: false,
    createdAt: '2026-09-20T08:00:00.000Z',
    photoCount: 3,
    ...overrides,
  };
}

/** A bejelentkezett adminisztrátor saját sora. */
export const adminSelf = () =>
  adminUser({
    id: testAdmin.id,
    email: testAdmin.email,
    displayName: testAdmin.displayName,
    role: 'ADMIN',
    createdAt: '2026-09-01T08:00:00.000Z',
    photoCount: 0,
  });

/** Egy letiltott vásárló. */
export const blockedUser = () =>
  adminUser({
    id: BLOCKED_USER_ID,
    email: 'vera@pelda.hu',
    displayName: 'Vásárló Vera',
    isBlocked: true,
    createdAt: '2026-09-30T15:45:00.000Z',
    photoCount: 0,
  });

/** Egy kép az admin listájában (AdminPhotoDto) – alapból hitelesítve. */
export function adminPhoto(overrides: Record<string, unknown> = {}) {
  return {
    id: PHOTO_ID,
    title: 'Őszi erdő ködben',
    priceHuf: 12500,
    status: 'REGISTERED',
    width: 1600,
    height: 1067,
    thumbnailUrl: `/media/thumbnails/${PHOTO_ID}.webp`,
    category: CATEGORIES[0],
    owner: { id: OWNER_ID, displayName: 'Fotós Fanni', isBlocked: false },
    createdAt: '2026-10-04T12:30:00.000Z',
    hiddenBy: null,
    chainTxHash: TX_HASH,
    registeredAt: '2026-10-04T12:32:15.000Z',
    ...overrides,
  };
}

/** A drótváz öt állapota: hitelesítve, folyamatban, sikertelen, a moderátor levette, a tulajdonos elrejtette. */
export function adminPhotos() {
  return [
    adminPhoto(),
    adminPhoto({
      id: PENDING_PHOTO_ID,
      title: 'Hajnal a tónál',
      status: 'PENDING_CHAIN',
      chainTxHash: PENDING_TX_HASH,
      registeredAt: null,
      createdAt: '2026-10-05T07:12:00.000Z',
    }),
    adminPhoto({
      id: FAILED_PHOTO_ID,
      title: 'Városi esti fények',
      status: 'CHAIN_FAILED',
      chainTxHash: null,
      registeredAt: null,
      createdAt: '2026-10-02T18:40:00.000Z',
    }),
    adminPhoto({
      id: TAKEN_DOWN_PHOTO_ID,
      title: 'Pipacsmező',
      status: 'HIDDEN',
      hiddenBy: 'OWNER_AND_ADMIN',
      thumbnailUrl: null,
      createdAt: '2026-09-21T10:00:00.000Z',
    }),
    adminPhoto({
      id: OWNER_HIDDEN_PHOTO_ID,
      title: 'Régi híd',
      status: 'HIDDEN',
      hiddenBy: 'OWNER',
      thumbnailUrl: null,
      createdAt: '2026-09-28T09:30:00.000Z',
    }),
  ];
}

/** A platform statisztikája (PlatformStats – GET /api/admin/stats), a drótváz számaival. */
export function platformStats(overrides: Record<string, unknown> = {}) {
  return {
    users: { total: 42, blocked: 2, admins: 1 },
    photos: {
      total: 128,
      byStatus: { PENDING_CHAIN: 2, REGISTERED: 121, CHAIN_FAILED: 1, HIDDEN: 4 },
    },
    orders: { total: 57, byStatus: { PENDING: 2, PAID: 51, EXPIRED: 3, FAILED: 1 } },
    revenueHuf: 612_300,
    registeredHashes: 125,
    ...overrides,
  };
}

interface MetaOverrides {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

function pageResponse(key: 'users' | 'photos', items: unknown[], meta: MetaOverrides) {
  const pageSize = meta.pageSize ?? 20;
  const total = meta.total ?? items.length;
  return jsonResponse(200, {
    data: { [key]: items },
    meta: { page: 1, pageSize, total, totalPages: Math.ceil(total / pageSize), ...meta },
  });
}

/** GET /api/admin/users válasza: a felhasználók és a lapozás adatai. */
export const adminUsersResponse = (users: unknown[] = [], meta: MetaOverrides = {}) =>
  pageResponse('users', users, meta);

/** GET /api/admin/photos válasza: a képek és a lapozás adatai. */
export const adminPhotosResponse = (photos: unknown[] = [], meta: MetaOverrides = {}) =>
  pageResponse('photos', photos, meta);

/** GET /api/admin/stats válasza. */
export const statsResponse = (stats: unknown = platformStats()) =>
  jsonResponse(200, { data: { stats } });

/** PATCH /api/admin/users/:id válasza. */
export const adminUserResponse = (user: unknown) => jsonResponse(200, { data: { user } });

/** PATCH /api/admin/photos/:id válasza. */
export const adminPhotoResponse = (photo: unknown) => jsonResponse(200, { data: { photo } });

/** POST /api/admin/photos/:id/retry-registration válasza: elfogadva (202), a kép újra várakozik. */
export const retryResponse = (id: string, status = 'PENDING_CHAIN') =>
  jsonResponse(202, { data: { photo: { id, status } } });

interface AdminOutcomes {
  stats?: Outcome;
  users?: Outcome;
  photos?: Outcome;
}

/** Az adminoldal három kérésének válasza – útvonalhoz kötve, a sorrendjük nem számít. */
export const adminResponses = ({
  stats = statsResponse(),
  users = adminUsersResponse([adminSelf(), adminUser(), blockedUser()]),
  photos = adminPhotosResponse(adminPhotos()),
}: AdminOutcomes = {}) => [
  forPath('/api/admin/stats', stats),
  forPath('/api/admin/users', users),
  forPath('/api/admin/photos', photos),
];
