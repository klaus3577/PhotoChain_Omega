// A galéria nézete az URL-ben: keresőszó (q), kategória (categoryId), ár-tartomány (minPrice, maxPrice),
// rendezés (sort) és oldal (page). Az URL-ben tartott állapot megosztható, és a vissza gomb is
// működik. Mivel az URL kézzel is szerkeszthető, a beolvasás a szerver szabályait követi
// (server/src/modules/photos/photos.schemas.ts, lib/schemas.ts): az érvénytelen értéket elhagyja – a
// szerver 400-at adna rá –, így egy elrontott hivatkozás is használható galériát ad. Az URL-be csak az
// alapértéktől eltérő paraméter kerül.
// Forrás: React Router – useSearchParams, https://reactrouter.com/api/hooks/useSearchParams;
// MDN – URLSearchParams, https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams (adaptálva)
import { CONTROL_CHARACTER } from '../lib/text';

/** Oldalanként ennyi kép: a 2, 3 és 4 oszlopos rács is teli sorokkal zárul (L17 drótváz) */
export const GALLERY_PAGE_SIZE = 24;
/** A szerver korlátai: a keresőszó hossza (kódpontban), a legnagyobb ár és kategória-azonosító */
export const MAX_SEARCH_LENGTH = 100;
const MAX_PRICE = 9_999_999;
const MAX_CATEGORY_ID = 2_147_483_647;
/** A legnagyobb oldalszám (a szerver korlátja): a nagyobbat a beolvasás elhagyja, a lapozó sem visz tovább */
export const MAX_GALLERY_PAGE = 1000;
/** A vezérlőkarakterek mindegyike – a beírt keresőszóban szóköz lesz belőlük */
const CONTROL_CHARACTERS = new RegExp(CONTROL_CHARACTER.source, 'gu');

export const GALLERY_SORTS = ['newest', 'oldest', 'price_asc', 'price_desc'] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];

export interface GalleryParams {
  /** A keresőszó (üres: nincs keresés) */
  q: string;
  categoryId: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  sort: GallerySort;
  page: number;
}

export const DEFAULT_GALLERY_PARAMS: Readonly<GalleryParams> = Object.freeze({
  q: '',
  categoryId: null,
  minPrice: null,
  maxPrice: null,
  sort: 'newest',
  page: 1,
});

const DIGITS = /^\d+$/;

/** Nem negatív egész szám szövegként, a határok között – különben null (a vezérlőpult oldalszáma is ezt használja). */
export function integerParam(value: string | null, min: number, max: number): number | null {
  if (value === null || !DIGITS.test(value)) return null;
  // A felső korlátnál több számjegyű szám biztosan túl nagy (a Number() már pontatlan lehetne)
  const digits = value.replace(/^0+(?=\d)/, '');
  if (digits.length > String(max).length) return null;
  const number = Number(digits);
  return number >= min && number <= max ? number : null;
}

/** A keresőszó körülvágva; vezérlőkarakterrel érvénytelen (üres), a túl hosszú levágva. */
export function normalizeSearch(value: string | null): string {
  const q = (value ?? '').trim();
  if (CONTROL_CHARACTER.test(q)) return '';
  const codePoints = [...q];
  return codePoints.length > MAX_SEARCH_LENGTH
    ? codePoints.slice(0, MAX_SEARCH_LENGTH).join('').trimEnd()
    : q;
}

/**
 * A beírt keresőszó: a vezérlőkarakter (pl. beillesztett tabulátor) szóköz lesz – a gépelt keresés nem
 * vész el, mint az URL érvénytelen keresőszava (normalizeSearch).
 */
export function searchFromInput(text: string): string {
  return normalizeSearch(text.replace(CONTROL_CHARACTERS, ' '));
}

export function parseGalleryParams(search: URLSearchParams): GalleryParams {
  const minPrice = integerParam(search.get('minPrice'), 0, MAX_PRICE);
  const maxPrice = integerParam(search.get('maxPrice'), 0, MAX_PRICE);
  // A fordított tartományra a szerver 400-at adna: ilyenkor egyik határ sem érvényes
  const reversed = minPrice !== null && maxPrice !== null && minPrice > maxPrice;
  const sort = search.get('sort');
  return {
    q: normalizeSearch(search.get('q')),
    categoryId: integerParam(search.get('categoryId'), 1, MAX_CATEGORY_ID),
    minPrice: reversed ? null : minPrice,
    maxPrice: reversed ? null : maxPrice,
    sort: GALLERY_SORTS.find((value) => value === sort) ?? DEFAULT_GALLERY_PARAMS.sort,
    page: integerParam(search.get('page'), 1, MAX_GALLERY_PAGE) ?? DEFAULT_GALLERY_PARAMS.page,
  };
}

/** A nézet az URL-ben – csak az alapértéktől eltérő paraméterek. */
export function gallerySearchParams(params: GalleryParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q !== '') search.set('q', params.q);
  if (params.categoryId !== null) search.set('categoryId', String(params.categoryId));
  if (params.minPrice !== null) search.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== null) search.set('maxPrice', String(params.maxPrice));
  if (params.sort !== DEFAULT_GALLERY_PARAMS.sort) search.set('sort', params.sort);
  if (params.page !== DEFAULT_GALLERY_PARAMS.page) search.set('page', String(params.page));
  return search;
}

/** A szerver lekérdezése (GET /api/photos): az URL paraméterei és az oldalméret. */
export function galleryApiQuery(params: GalleryParams): string {
  const search = gallerySearchParams(params);
  search.set('pageSize', String(GALLERY_PAGE_SIZE));
  return `?${search.toString()}`;
}

/** Az aktív szűrők száma (a „Szűrők” gombon): a kategória és az ár-tartomány egy-egy szűrő. */
export function activeFilterCount(params: GalleryParams): number {
  const category = params.categoryId === null ? 0 : 1;
  const price = params.minPrice === null && params.maxPrice === null ? 0 : 1;
  return category + price;
}

/**
 * A beírt ár: egész forintösszeg, szóközzel (nem törő szóközzel) tagolva is; az üres mező „nincs
 * szűrő” (null), minden más 'invalid'.
 */
export function parsePriceInput(text: string): number | null | 'invalid' {
  const compact = text.replace(/\s/g, '');
  if (compact === '') return null;
  return integerParam(compact, 0, MAX_PRICE) ?? 'invalid';
}

/** Szűkíti-e a találatokat: keresőszó, kategória vagy ár (a rendezés és az oldal nem). */
export function isFiltering(params: GalleryParams): boolean {
  return params.q !== '' || activeFilterCount(params) > 0;
}

/** A keresést és a szűrőket törlő gomb neve: azt mondja meg, amit töröl. */
export function clearAllLabel(params: GalleryParams): string {
  const search = params.q !== '';
  const filters = activeFilterCount(params) > 0;
  if (search && filters) return 'Keresés és szűrők törlése';
  return search ? 'Keresés törlése' : 'Szűrők törlése';
}

/** A böngészőfül címe: a keresőszó és az oldal is – a lapok és az előzmények között is felismerhető. */
export function galleryTitle(params: GalleryParams): string {
  const parts = ['Galéria'];
  if (params.q !== '') parts.push(`„${params.q}”`);
  if (params.page > 1) parts.push(`${params.page}. oldal`);
  return parts.join(' – ');
}
