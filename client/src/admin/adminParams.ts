// Az adminfelület nézete az URL-ben (L25; L17 drótváz „Adminisztráció”, 2. és 4. jegyzet): a
// felhasználók keresőszava (q), tiltási szűrője (blocked – a szerver paramétere) és oldala (usersPage),
// a képek állapotszűrője (status) és oldala (photosPage). A két lista paraméterei függetlenek: az egyik
// szűrése vagy lapozása a másikat nem érinti. A beolvasás a szerver szabályait követi (admin.schemas.ts,
// lib/schemas.ts): az érvénytelen értéket elhagyja – a szerver 400-at adna rá –, az URL-be csak az
// alapértelmezettől eltérő paraméter kerül; a szerver lekérdezése ebből készül.
import { ADMIN_PAGE_SIZE } from '../api/admin.api';
import { isPhotoStatus, type PhotoStatus } from '../api/photos.api';
import { integerParam, normalizeSearch } from '../photos/galleryParams';

export const USER_FILTERS = ['all', 'active', 'blocked'] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

export interface AdminParams {
  /** A felhasználók keresőszava (üres: nincs keresés) */
  q: string;
  users: UserFilter;
  usersPage: number;
  /** A képek állapotszűrője (null: minden állapot) */
  status: PhotoStatus | null;
  photosPage: number;
}

/** A szerver legfeljebb ennyi oldalt lapoz (lib/schemas.ts – MAX_PAGE) */
export const MAX_ADMIN_PAGE = 1000;

export const DEFAULT_ADMIN_PARAMS: Readonly<AdminParams> = Object.freeze({
  q: '',
  users: 'all',
  usersPage: 1,
  status: null,
  photosPage: 1,
});

export const USER_FILTER_LABELS: Record<UserFilter, string> = {
  all: 'Mind',
  active: 'Aktív',
  blocked: 'Tiltott',
};

/** A szűrő a szerver blocked paramétere: aktív = blocked=false, tiltott = blocked=true */
const BLOCKED_VALUES: Record<Exclude<UserFilter, 'all'>, 'true' | 'false'> = {
  active: 'false',
  blocked: 'true',
};

function userFilterOf(blocked: string | null): UserFilter {
  if (blocked === 'true') return 'blocked';
  if (blocked === 'false') return 'active';
  return 'all';
}

export function parseAdminParams(search: URLSearchParams): AdminParams {
  const status = search.get('status');
  return {
    q: normalizeSearch(search.get('q')),
    users: userFilterOf(search.get('blocked')),
    usersPage:
      integerParam(search.get('usersPage'), 1, MAX_ADMIN_PAGE) ?? DEFAULT_ADMIN_PARAMS.usersPage,
    status: isPhotoStatus(status) ? status : DEFAULT_ADMIN_PARAMS.status,
    photosPage:
      integerParam(search.get('photosPage'), 1, MAX_ADMIN_PAGE) ?? DEFAULT_ADMIN_PARAMS.photosPage,
  };
}

/** A nézet az URL-ben – csak az alapértéktől eltérő paraméterek, rögzített sorrendben. */
export function adminSearchParams(params: AdminParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q !== '') search.set('q', params.q);
  if (params.users !== 'all') search.set('blocked', BLOCKED_VALUES[params.users]);
  if (params.usersPage !== DEFAULT_ADMIN_PARAMS.usersPage) {
    search.set('usersPage', String(params.usersPage));
  }
  if (params.status !== null) search.set('status', params.status);
  if (params.photosPage !== DEFAULT_ADMIN_PARAMS.photosPage) {
    search.set('photosPage', String(params.photosPage));
  }
  return search;
}

/** A nézet lekérdezése az URL-hez („?q=tó&usersPage=2”); az alapértelmezett nézeté üres. */
export function adminSearch(params: AdminParams): string {
  const text = adminSearchParams(params).toString();
  return text === '' ? '' : `?${text}`;
}

/** A felhasználók lekérdezése (GET /api/admin/users): keresőszó, tiltási szűrő, oldal és oldalméret. */
export function usersApiQuery({ q, users, usersPage }: AdminParams): string {
  const search = new URLSearchParams();
  if (q !== '') search.set('q', q);
  if (users !== 'all') search.set('blocked', BLOCKED_VALUES[users]);
  search.set('page', String(usersPage));
  search.set('pageSize', String(ADMIN_PAGE_SIZE));
  return `?${search.toString()}`;
}

/** A képek lekérdezése (GET /api/admin/photos): állapotszűrő, oldal és oldalméret. */
export function photosApiQuery({ status, photosPage }: AdminParams): string {
  const search = new URLSearchParams();
  if (status !== null) search.set('status', status);
  search.set('page', String(photosPage));
  search.set('pageSize', String(ADMIN_PAGE_SIZE));
  return `?${search.toString()}`;
}

const USER_TITLE_LABELS: Record<UserFilter, string> = {
  all: 'felhasználók',
  active: 'aktív felhasználók',
  blocked: 'tiltott felhasználók',
};

const STATUS_TITLE_LABELS: Record<PhotoStatus, string> = {
  REGISTERED: 'hitelesített képek',
  PENDING_CHAIN: 'folyamatban lévő képek',
  CHAIN_FAILED: 'sikertelen regisztrációjú képek',
  HIDDEN: 'rejtett képek',
};

const paged = (label: string, page: number) => (page > 1 ? `${label}, ${page}. oldal` : label);

/**
 * A böngészőfül címe: a szűrőkkel és a lapozott listák oldalával – a keresőszó (akár egy e-mail-cím)
 * nélkül, az az előzményekben és a fül címében is megmaradna.
 */
export function adminTitle(params: AdminParams): string {
  const parts = ['Adminisztráció'];
  if (params.users !== 'all' || params.usersPage > 1) {
    parts.push(paged(USER_TITLE_LABELS[params.users], params.usersPage));
  }
  if (params.status !== null || params.photosPage > 1) {
    const label = params.status === null ? 'képek' : STATUS_TITLE_LABELS[params.status];
    parts.push(paged(label, params.photosPage));
  }
  return parts.join(' – ');
}
