// Az admin végpontok kliense (server/src/modules/admin – L16; L25): a platform statisztikája (GET
// /api/admin/stats), a felhasználók listája és tiltása (GET /api/admin/users, PATCH
// /api/admin/users/:id), a képek listája minden állapotban, elrejtése és visszaállítása (GET
// /api/admin/photos, PATCH /api/admin/photos/:id), a sikertelen lánc-regisztráció újrapróbálása (POST
// /api/admin/photos/:id/retry-registration – 202). A válasz külső adat: futás közben is ellenőrizzük,
// a módosító kérés válasza csak a kért elemé lehet. A szerver minden kérésnél maga is ellenőrzi az
// admin szerepkört – a felület csak nem kínál elérhetetlen műveletet.
import type { Role } from './auth.api';
import { type Category, isCategory } from './categories.api';
import {
  expectQueryString,
  expectValid,
  isInteger,
  isIsoDate,
  isMediaPath,
  isPageMeta,
  isRecord,
  isString,
  isTxHash,
  isUuid,
  type PageMeta,
} from './guards';
import { apiRequest, apiRequestEnvelope, pathSegment, unexpectedResponseError } from './http';
import type { OrderStatus } from './orders.api';
import { type HiddenBy, isHiddenBy, isPhotoStatus, type PhotoStatus } from './photos.api';

/** Egy felhasználó az admin listájában (AdminUserDto). */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isBlocked: boolean;
  createdAt: string;
  /** A felhasználó képeinek száma (minden állapotban) */
  photoCount: number;
}

export interface AdminPhotoOwner {
  id: string;
  displayName: string;
  isBlocked: boolean;
}

/** Egy kép az admin listájában (AdminPhotoDto): a galéria mezői a moderáláshoz szükségesekkel. */
export interface AdminPhoto {
  id: string;
  title: string;
  priceHuf: number;
  status: PhotoStatus;
  width: number;
  height: number;
  /** Az elrejtett kép bélyegképe törlődött: null */
  thumbnailUrl: string | null;
  category: Category;
  owner: AdminPhotoOwner;
  createdAt: string;
  /** Ki rejtette el – pontosan a rejtett (HIDDEN) képnél; a visszaállítás csak a moderátori levételnél */
  hiddenBy: HiddenBy | null;
  /** A regisztrációs tranzakció hash-e (a sikertelen képnél is lehet, pl. időtúllépés után) */
  chainTxHash: string | null;
  registeredAt: string | null;
}

export interface AdminUserPage {
  users: AdminUser[];
  meta: PageMeta;
}

export interface AdminPhotoPage {
  photos: AdminPhoto[];
  meta: PageMeta;
}

/** Darabszámok állapotonként (minden állapot szerepel) és összesen (admin.stats.ts). */
export interface StatusCounts<Status extends string> {
  total: number;
  byStatus: Record<Status, number>;
}

/** A platform statisztikája (PlatformStats – GET /api/admin/stats). */
export interface PlatformStats {
  users: { total: number; blocked: number; admins: number };
  photos: StatusCounts<PhotoStatus>;
  orders: StatusCounts<OrderStatus>;
  /** A kifizetett rendelések összege forintban */
  revenueHuf: number;
  /** A láncon regisztrált képek száma – az elrejtetteké is */
  registeredHashes: number;
}

/** Az újrapróbálás elfogadva (202): a kép újra regisztrációra vár. */
export interface RetryStart {
  id: string;
  status: 'PENDING_CHAIN';
}

/** Egy oldalon ennyi felhasználó, illetve kép (a szerver alapértelmezése) */
export const ADMIN_PAGE_SIZE = 20;

/** A képek állapotai a statisztika és a szűrő sorrendjében */
export const PHOTO_STATUS_LIST = [
  'REGISTERED',
  'PENDING_CHAIN',
  'CHAIN_FAILED',
  'HIDDEN',
] as const satisfies readonly PhotoStatus[];

const ORDER_STATUS_LIST = [
  'PENDING',
  'PAID',
  'EXPIRED',
  'FAILED',
] as const satisfies readonly OrderStatus[];

const ROLES: readonly unknown[] = ['USER', 'ADMIN'] satisfies Role[];

/**
 * A lekérdezések helye a gyorsítótárban – mind az „admin” előtag alatt: egy művelet után együtt
 * érvényteleníthetők. Felhasználói adat: a munkamenet váltásakor alaphelyzetbe kerül (sessionCache.ts).
 */
export const adminKeys = {
  all: () => ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  /** A felhasználók minden oldala és szűrése (érvénytelenítéshez) */
  users: () => ['admin', 'users'] as const,
  usersPage: (query: string) => ['admin', 'users', query] as const,
  /** A képek minden oldala és szűrése (érvénytelenítéshez) */
  photos: () => ['admin', 'photos'] as const,
  photosPage: (query: string) => ['admin', 'photos', query] as const,
};

const isAdminUser = (value: unknown): value is AdminUser =>
  isRecord(value) &&
  isUuid(value.id) &&
  isString(value.email) &&
  isString(value.displayName) &&
  ROLES.includes(value.role) &&
  typeof value.isBlocked === 'boolean' &&
  isIsoDate(value.createdAt) &&
  isInteger(value.photoCount);

const isAdminPhotoOwner = (value: unknown): value is AdminPhotoOwner =>
  isRecord(value) &&
  isUuid(value.id) &&
  isString(value.displayName) &&
  typeof value.isBlocked === 'boolean';

/** A kép: a galéria mezői, és ki rejtette el – pontosan a rejtett képnél (a szerver CHECK-je is ezt mondja). */
const isAdminPhoto = (value: unknown): value is AdminPhoto =>
  isRecord(value) &&
  isUuid(value.id) &&
  isString(value.title) &&
  isInteger(value.priceHuf) &&
  isPhotoStatus(value.status) &&
  isInteger(value.width, 1) &&
  isInteger(value.height, 1) &&
  (value.thumbnailUrl === null || isMediaPath(value.thumbnailUrl)) &&
  isCategory(value.category) &&
  isAdminPhotoOwner(value.owner) &&
  isIsoDate(value.createdAt) &&
  (value.hiddenBy === null || isHiddenBy(value.hiddenBy)) &&
  (value.status === 'HIDDEN') === (value.hiddenBy !== null) &&
  (value.chainTxHash === null || isTxHash(value.chainTxHash)) &&
  (value.registeredAt === null || isIsoDate(value.registeredAt));

const isAdminUserList = (value: unknown): value is { users: AdminUser[] } =>
  isRecord(value) && Array.isArray(value.users) && value.users.every(isAdminUser);

const isAdminUserResponse = (value: unknown): value is { user: AdminUser } =>
  isRecord(value) && isAdminUser(value.user);

const isAdminPhotoList = (value: unknown): value is { photos: AdminPhoto[] } =>
  isRecord(value) && Array.isArray(value.photos) && value.photos.every(isAdminPhoto);

const isAdminPhotoResponse = (value: unknown): value is { photo: AdminPhoto } =>
  isRecord(value) && isAdminPhoto(value.photo);

const isRetryStart = (value: unknown): value is RetryStart =>
  isRecord(value) && isUuid(value.id) && value.status === 'PENDING_CHAIN';

const isRetryResponse = (value: unknown): value is { photo: RetryStart } =>
  isRecord(value) && isRetryStart(value.photo);

/** Minden állapot egész számmal, az összeg a total (a szerver így számolja). */
function isStatusCounts<Status extends string>(
  value: unknown,
  statuses: readonly Status[],
): value is StatusCounts<Status> {
  if (!isRecord(value) || !isInteger(value.total) || !isRecord(value.byStatus)) return false;
  const counts = value.byStatus;
  if (!statuses.every((status) => isInteger(counts[status]))) return false;
  const sum = statuses.reduce((total, status) => total + (counts[status] as number), 0);
  return sum === value.total;
}

const isUserCounts = (value: unknown): value is PlatformStats['users'] =>
  isRecord(value) &&
  isInteger(value.total) &&
  isInteger(value.blocked, 0, value.total) &&
  isInteger(value.admins, 0, value.total);

const isPlatformStats = (value: unknown): value is PlatformStats =>
  isRecord(value) &&
  isUserCounts(value.users) &&
  isStatusCounts(value.photos, PHOTO_STATUS_LIST) &&
  isStatusCounts(value.orders, ORDER_STATUS_LIST) &&
  isInteger(value.revenueHuf) &&
  isInteger(value.registeredHashes);

const isStatsResponse = (value: unknown): value is { stats: PlatformStats } =>
  isRecord(value) && isPlatformStats(value.stats);

/** A módosító kérés válasza csak a kért elemé lehet. */
function sameId<Item extends { id: string }>(item: Item, id: string): Item {
  if (item.id !== id) throw unexpectedResponseError(200);
  return item;
}

/**
 * A felhasználók egy oldala, a legutóbb regisztrált elöl; a query a kérés teljes lekérdezése
 * („?q=…&blocked=true&page=1&pageSize=20” – adminParams.ts).
 */
export async function listAdminUsers(query: string, signal?: AbortSignal): Promise<AdminUserPage> {
  const { data, meta } = await apiRequestEnvelope(`/admin/users${expectQueryString(query)}`, {
    signal,
  });
  return { users: expectValid(data, isAdminUserList).users, meta: expectValid(meta, isPageMeta) };
}

/** Tiltás vagy feloldás (PATCH); adminisztrátor nem tiltható (409). Ismételve is sikeres. */
export async function setUserBlocked(id: string, isBlocked: boolean): Promise<AdminUser> {
  const data = await apiRequest<unknown>(`/admin/users/${pathSegment(id)}`, {
    method: 'PATCH',
    body: { isBlocked },
  });
  return sameId(expectValid(data, isAdminUserResponse).user, id);
}

/** A képek egy oldala minden állapotban, a legújabb elöl („?status=HIDDEN&page=1&pageSize=20”). */
export async function listAdminPhotos(
  query: string,
  signal?: AbortSignal,
): Promise<AdminPhotoPage> {
  const { data, meta } = await apiRequestEnvelope(`/admin/photos${expectQueryString(query)}`, {
    signal,
  });
  return {
    photos: expectValid(data, isAdminPhotoList).photos,
    meta: expectValid(meta, isPageMeta),
  };
}

/**
 * Moderátori elrejtés vagy visszaállítás (PATCH). A csak a tulajdonos által elrejtett kép nem
 * állítható vissza (409); ha a tulajdonos is elrejtette, csak a moderátori levétel szűnik meg – a válasz
 * ilyenkor is rejtett képet ad.
 */
export async function setPhotoHidden(id: string, hidden: boolean): Promise<AdminPhoto> {
  const data = await apiRequest<unknown>(`/admin/photos/${pathSegment(id)}`, {
    method: 'PATCH',
    body: { hidden },
  });
  return sameId(expectValid(data, isAdminPhotoResponse).photo, id);
}

/** A sikertelen lánc-regisztráció újrapróbálása (POST, 202): gázdíjba kerül, adminonként korlátozott (429). */
export async function retryRegistration(id: string): Promise<RetryStart> {
  const data = await apiRequest<unknown>(`/admin/photos/${pathSegment(id)}/retry-registration`, {
    method: 'POST',
  });
  return sameId(expectValid(data, isRetryResponse).photo, id);
}

/** A platform statisztikája egyetlen adatbázis-pillanatképből. */
export async function getPlatformStats(signal?: AbortSignal): Promise<PlatformStats> {
  const data = await apiRequest<unknown>('/admin/stats', { signal });
  return expectValid(data, isStatsResponse).stats;
}
