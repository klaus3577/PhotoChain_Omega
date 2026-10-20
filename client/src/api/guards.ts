// A szerver válaszainak futásidejű ellenőrzéséhez közös építőkockák (a *.api.ts fájlok használják): a
// szerver adata külső adat, a TypeScript-típus csak ígéret. A képcím külön szabályt kap: csak saját,
// /media/ alatti útvonal lehet – így egy hibás válasz sem tehet az oldalra idegen forrást, ../ vagy
// javascript: címet.
import { unexpectedResponseError } from './http';

export type Fields = Record<string, unknown>;

/** Értékelések összesítése (server/src/modules/reviews/reviews.rating.ts): átlag (nincs: null) és darabszám. */
export interface RatingSummary {
  average: number | null;
  count: number;
}

/** A lapozott lista adatai (server/src/lib/schemas.ts – pageMeta). */
export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/**
 * A szerver azonosítóinak formája: pontosan a szerver Zod-sémájának (z.uuid()) mintája – a verziójel
 * 1–8, a variáns 8–b, és a nil, illetve a max UUID. Ami itt érvényes, arra a szerver sem ad 400-at.
 * Forrás: Zod – String formats: UUIDs (zod/v4/core/regexes.js, MIT), https://zod.dev/api#uuids (átvéve)
 */
const UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

/** Egész szám a megadott határok között (alapból nem negatív). */
export const isInteger = (
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;

/** Dátum ISO-szövegként (a JSON így adja a Date-et). */
export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Saját médiafájl: /media/<mappa>/<fájlnév>.<kiterjesztés> (server/src/services/storage) */
const MEDIA_PATH = /^\/media\/[a-z]+\/[A-Za-z0-9_-]+\.[a-z0-9]+$/;

export const isMediaPath = (value: unknown): value is string =>
  typeof value === 'string' && MEDIA_PATH.test(value);

/** A csillagok száma 1–5; értékelés nélkül az átlag null. */
const MIN_RATING = 1;
const MAX_RATING = 5;

export const isRating = (value: unknown): value is number =>
  isInteger(value, MIN_RATING, MAX_RATING);

export const isRatingSummary = (value: unknown): value is RatingSummary =>
  isRecord(value) &&
  isInteger(value.count) &&
  (value.average === null ||
    (typeof value.average === 'number' &&
      value.average >= MIN_RATING &&
      value.average <= MAX_RATING));

export const isPageMeta = (value: unknown): value is PageMeta =>
  isRecord(value) &&
  isInteger(value.page, 1) &&
  isInteger(value.pageSize, 1) &&
  isInteger(value.total) &&
  isInteger(value.totalPages);

/** A hash-ek és címek alakja: a szerver a SHA-256-ot és a dHash-t kisbetűs hexában tárolja és adja */
const SHA256 = /^[0-9a-f]{64}$/;
const DHASH = /^[0-9a-f]{16}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
/** A szerver Sepolián ide mutató linkeket ad (server/src/services/chainExplorer.ts) */
export const EXPLORER_BASE_URL = 'https://sepolia.etherscan.io';

export const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && SHA256.test(value);

export const isDHash = (value: unknown): value is string =>
  typeof value === 'string' && DHASH.test(value);

export const isTxHash = (value: unknown): value is string =>
  typeof value === 'string' && TX_HASH.test(value);

export const isAddress = (value: unknown): value is string =>
  typeof value === 'string' && ADDRESS.test(value);

/** A tranzakció linkje: nincs (lokális lánc), vagy pontosan a kiírt hash Etherscan-oldala. */
export const isTransactionUrl = (url: unknown, txHash: string): boolean =>
  url === null || url === `${EXPLORER_BASE_URL}/tx/${txHash}`;

/**
 * A lezárt tranzakció adatai (server/src/services/chainExplorer.ts – TransactionProof): a blokk, a hash és
 * a link együtt ismertek – a link csak a hash oldala lehet –, vagy együtt hiányoznak (elveszett nyugta).
 */
export function hasTransactionProof(value: Fields): boolean {
  const { txHash, blockNumber, txUrl } = value;
  if (txHash === null) return blockNumber === null && txUrl === null;
  return isTxHash(txHash) && isInteger(blockNumber) && isTransactionUrl(txUrl, txHash);
}

/** Az ellenőrzött érték – vagy UNEXPECTED_RESPONSE hiba, ha a válasz nem a várt formájú. */
export function expectValid<T>(value: unknown, guard: (value: unknown) => value is T): T {
  if (!guard(value)) throw unexpectedResponseError(200);
  return value;
}

/** A lista lekérdezése csak „?…” alakú lehet (URLSearchParams-ból): az útvonalat nem változtathatja. */
const QUERY_STRING = /^(\?[^#]*)?$/;

/**
 * A lekérdezés, ha „?”-lel kezdődik (vagy üres); más alakú szöveg (pl. „/../admin”) nem viheti a kérést
 * másik API-útvonalra: kérés nélkül RangeError.
 */
export function expectQueryString(query: string): string {
  if (!QUERY_STRING.test(query)) throw new RangeError('A lekérdezés „?”-lel kezdődik');
  return query;
}
