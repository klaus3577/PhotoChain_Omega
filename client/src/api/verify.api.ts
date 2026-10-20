// A nyilvános hitelesség-ellenőrző kliense (server/src/modules/verification – L12; a felület: L24). Fájl
// alapján POST /api/verify (multipart, XMLHttpRequest-tel – haladással, mint a feltöltés), hash alapján
// GET /api/verify/:sha256. A válasz külső adat: a három eredmény mezői csak egymással összhangban
// fogadhatók el (a szolgáltatás szabályai szerint), a tranzakció linkje csak a kiírt hash
// Etherscan-oldala, a bélyegkép csak saját /media/ útvonal lehet. A vizsgált fájl a szerveren nem
// tárolódik (README – Hitelesség-ellenőrzés).
import {
  expectValid,
  type Fields,
  hasTransactionProof,
  isDHash,
  isInteger,
  isIsoDate,
  isMediaPath,
  isRecord,
  isSha256,
  isString,
  isUuid,
} from './guards';
import { apiRequest, unexpectedResponseError } from './http';
import { IMAGE_FIELD_NAME, type MultipartOptions, postMultipart } from './multipart';

export type VerificationOutcome = 'VERIFIED' | 'SIMILAR' | 'NOT_FOUND';

/**
 * A regisztráció bizonyítéka: a lánc szerinti idő és – ha az adatbázisban lezárt tranzakció tartozik
 * hozzá – a tranzakció blokkja, hash-e és Etherscan-linkje (különben mind null).
 */
export interface RegistrationProof {
  registeredAt: string;
  blockNumber: number | null;
  txHash: string | null;
  /** A tranzakció az Etherscanen; a lokális hálózaton null */
  txUrl: string | null;
}

/** A nyilvános (REGISTERED) kép adatai. */
export interface VerifiedPhoto {
  id: string;
  title: string;
  thumbnailUrl: string;
  photographer: { id: string; displayName: string };
}

/** Az ellenőrzés eredménye (VerificationResult) – minden mező mindig jelen van, a nem értelmezhető null. */
export interface Verification {
  result: VerificationOutcome;
  /** A vizsgált fájl SHA-256 hash-e (hash alapján: a megadott hash) */
  sha256: string;
  /** A vizsgált fájl dHash-e; hash alapján nem ismert: null */
  dHash: string | null;
  /** SIMILAR-nál az eltérő bitek száma (Hamming-távolság), egyébként null */
  distance: number | null;
  /** VERIFIED-nél és SIMILAR-nál a regisztráció bizonyítéka, NOT_FOUND-nál null */
  registration: RegistrationProof | null;
  /** A kép adatai – csak ha nyilvános, egyébként null */
  photo: VerifiedPhoto | null;
}

/** A dHash 64 bites: az eltérő bitek száma legfeljebb ennyi */
export const DHASH_BITS = 64;

const OUTCOMES: readonly unknown[] = [
  'VERIFIED',
  'SIMILAR',
  'NOT_FOUND',
] satisfies VerificationOutcome[];

/** A beírható alak: 64 hexa karakter, előtte elhagyható 0x (a szerver sémája – verification.schemas.ts) */
const SHA256_INPUT = /^(?:0x)?([0-9a-f]{64})$/i;

const isRegistration = (value: unknown): value is RegistrationProof =>
  isRecord(value) && isIsoDate(value.registeredAt) && hasTransactionProof(value);

const isVerifiedPhoto = (value: unknown): value is VerifiedPhoto =>
  isRecord(value) &&
  isUuid(value.id) &&
  isString(value.title) &&
  isMediaPath(value.thumbnailUrl) &&
  isRecord(value.photographer) &&
  isUuid(value.photographer.id) &&
  isString(value.photographer.displayName);

/** Az eredmény és a többi mező összhangja (a szolgáltatás szabályai – verification.service.ts). */
function isConsistent(value: Fields): boolean {
  if (value.result === 'NOT_FOUND') {
    return value.registration === null && value.photo === null && value.distance === null;
  }
  if (value.result === 'VERIFIED') return value.registration !== null && value.distance === null;
  return (
    value.registration !== null && value.dHash !== null && isInteger(value.distance, 0, DHASH_BITS)
  );
}

export const isVerificationResult = (value: unknown): value is Verification =>
  isRecord(value) &&
  OUTCOMES.includes(value.result) &&
  isSha256(value.sha256) &&
  (value.dHash === null || isDHash(value.dHash)) &&
  (value.distance === null || isInteger(value.distance)) &&
  (value.registration === null || isRegistration(value.registration)) &&
  (value.photo === null || isVerifiedPhoto(value.photo)) &&
  isConsistent(value);

/** A beírt hash a szerver tárolt alakjában (kisbetűs, előtag nélkül); null, ha nem SHA-256 hash. */
export function normalizeSha256(input: string): string | null {
  const match = SHA256_INPUT.exec(input.trim());
  return match === null ? null : match[1]!.toLowerCase();
}

/**
 * A fájl neve az űrlapban: a sajátja nem megy el – a szervernek nem kell (a kép tartalma dönt), és a név
 * személyes adatot hordozhat (adattakarékosság).
 */
export const VERIFY_FILE_NAME = 'kep';

/** Ellenőrzés a fájl alapján: pontos egyezés a láncon, illetve hasonlóság a nyilvános képekkel. */
export function verifyFile(file: File, options: MultipartOptions = {}): Promise<Verification> {
  const form = new FormData();
  form.append(IMAGE_FIELD_NAME, file, VERIFY_FILE_NAME);
  return postMultipart('/verify', form, isVerificationResult, options);
}

/**
 * Ellenőrzés a SHA-256 hash alapján – csak pontos egyezés; hibás hash-sel kérés sem indul. A válasznak
 * a kért hash-ről kell szólnia (fájl nélkül, dHash sincs): más hash eredménye – hibás gyorsítótár vagy
 * közvetítő esetén – nem jelenhet meg a beírt hash igazolásaként.
 */
export async function verifyHash(input: string, signal?: AbortSignal): Promise<Verification> {
  const sha256 = normalizeSha256(input);
  if (sha256 === null) throw new RangeError('A SHA-256 hash 64 hexadecimális karakter');
  const data = await apiRequest<unknown>(`/verify/${sha256}`, { signal });
  const result = expectValid(data, isVerificationResult);
  if (result.sha256 !== sha256 || result.dHash !== null) throw unexpectedResponseError(200);
  return result;
}
