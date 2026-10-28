// A hitelesítés két ujjlenyomata (fejlesztési terv, 1.4 pont és D7 döntés):
// - SHA-256 a fájl bájtjaiból: a bájtra azonos másolatot ismeri fel – egyetlen bit megváltozására
//   teljesen más lesz;
// - dHash (különbség-hash, 64 bit) a kép tartalmából: a kicsinyített, újratömörített vagy más
//   formátumba mentett másolat hash-e csak néhány bitben tér el az eredetiétől.
// Két dHash hasonlóságát a Hamming-távolságuk, vagyis az eltérő bitek száma méri.
//
// Források: Node.js crypto modul, https://nodejs.org/api/crypto.html; NIST FIPS 180-4 – Secure Hash
// Standard, https://doi.org/10.6028/NIST.FIPS.180-4; a dHash N. Krawetz leírásának (Kind of Like
// That, 2013, https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html)
// saját megvalósítása; képfeldolgozás: sharp, https://sharp.pixelplumbing.com/ (adaptálva);
// Hamming-távolság: R. W. Hamming (1950); bitszámlálás: P. Wegner (1960).
import { createHash } from 'node:crypto';

import type { OutputInfo } from 'sharp';

import { openImage } from './imageDecoding.js';

/** A dHash a képet 9×8 képpontra kicsinyíti: soronként 9 képpont 8 szomszédpárt ad. */
export const DHASH_COLUMNS = 9;
export const DHASH_ROWS = 8;
/** A kicsinyített kép képpontjainak száma (72) */
const DHASH_GRID_SIZE = DHASH_COLUMNS * DHASH_ROWS;
/** 8 sor × 8 összehasonlítás = 64 bit */
export const DHASH_BITS = (DHASH_COLUMNS - 1) * DHASH_ROWS;

/**
 * Legfeljebb ennyi eltérő bitnél tekintünk két képet egymás másolatának. Krawetz tapasztalata
 * szerint 10 fölött már valószínűleg más képről van szó; a küszöb a DHASH_THRESHOLD környezeti
 * változóval állítható (a kiértékelése: L29).
 */
export const DEFAULT_DHASH_THRESHOLD = 10;

const DHASH_PATTERN = /^[0-9a-f]{16}$/;

/** A bemenet nem dolgozható fel képként: nem kép, sérült vagy csonka fájl, nem támogatott formátum. */
export class InvalidImageError extends Error {
  constructor(options: ErrorOptions) {
    super('A fájl nem dolgozható fel képként', options);
    this.name = 'InvalidImageError';
  }
}

/** A fájl SHA-256 ujjlenyomata: 64 kisbetűs hexadecimális számjegy. */
export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * A kicsinyítés a sharp-pal (a lépések magyarázata: toDHashGrid). A sharp az üres bemenetre már a
 * lánc felépítésekor, a többi hibás fájlra a feldolgozáskor dob hibát – mindkettőből
 * InvalidImageError lesz, az eredeti hibával az okaként (cause). A képpontkorlátnál nagyobb
 * felbontású képet az openImage nem engedi dekódolni – az is InvalidImageError.
 */
async function reduceWithSharp(image: Buffer): Promise<{ data: Buffer; info: OutputInfo }> {
  try {
    return await openImage(image)
      .autoOrient()
      .flatten({ background: '#ffffff' })
      .resize(DHASH_COLUMNS, DHASH_ROWS, { fit: 'fill', fastShrinkOnLoad: false })
      .greyscale()
      .toColourspace('b-w')
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new InvalidImageError({ cause: error });
  }
}

/**
 * A dHash első két lépése: a kép 9×8 képpontos, szürkeárnyalatos kicsinyítése. Az eredmény 72
 * fényességérték (0 = fekete … 255 = fehér), sorfolytonosan.
 * - autoOrient: a kép abban az állásban számít, ahogyan megjelenik (EXIF-tájolás);
 * - flatten: az átlátszó terület fehérnek számít;
 * - resize „fill”: a képarányt figyelmen kívül hagyva pontosan 9×8 képpont – a részletek és a magas
 *   frekvenciák eltűnnek, csak a kép szerkezete marad. A fastShrinkOnLoad kikapcsolása azért kell,
 *   mert különben a sharp a WebP-t és a JPEG-et már dekódoláskor, gyorsított módon kicsinyítené,
 *   és ugyanaz a kép a fájlformátumtól függően más hash-t kapna;
 * - greyscale + „b-w”: képpontonként egyetlen, 8 bites fényességérték. A libvips súlyozása
 *   (Rec. 709) eltér más könyvtárakétól, ezért a hash más dHash-megvalósításokéval nem vethető
 *   össze – csak az ezzel a modullal (és a rögzített sharp-verzióval) számolt hash-ekkel.
 * Nem kép, sérült vagy csonka bemenetre InvalidImageError-t dob.
 */
export async function toDHashGrid(image: Buffer): Promise<Uint8Array> {
  const { data, info } = await reduceWithSharp(image);
  if (info.channels !== 1 || data.length !== DHASH_GRID_SIZE) {
    throw new Error(`Váratlan képméret a dHash számításakor: ${data.length} bájt`);
  }
  return data;
}

function assertGrid(grid: Uint8Array): void {
  if (grid.length !== DHASH_GRID_SIZE) {
    throw new RangeError(`A dHash rácsa pontosan ${DHASH_GRID_SIZE} fényességértékből áll`);
  }
}

/**
 * A dHash harmadik lépése: soronként minden képpontot a jobb oldali szomszédjával vetünk össze.
 * A bit 1, ha a bal oldali képpont sötétebb a jobb oldalinál (a kép ott balról jobbra világosodik),
 * különben 0. A bitek balról jobbra következnek, a legnagyobb helyiértékkel kezdve: minden sor egy
 * bájt (0 … 255). Csupa 0 bájt: a sor egyszínű vagy végig sötétedik; csupa 1 (255): végig világosodik.
 */
export function dHashRowBytes(grid: Uint8Array): number[] {
  assertGrid(grid);
  return Array.from({ length: DHASH_ROWS }, (_, row) => {
    let rowBits = 0;
    for (let column = 0; column < DHASH_COLUMNS - 1; column += 1) {
      const left = grid[row * DHASH_COLUMNS + column] ?? 0;
      const right = grid[row * DHASH_COLUMNS + column + 1] ?? 0;
      rowBits = (rowBits << 1) | (left < right ? 1 : 0);
    }
    return rowBits;
  });
}

/** A dHash a rácsból: a sorok bájtjai fentről lefelé, két-két hexadecimális számjegyként. */
export function dHashFromGrid(grid: Uint8Array): string {
  return Buffer.from(dHashRowBytes(grid)).toString('hex');
}

/** A kép dHash-e: 16 kisbetűs hexadecimális számjegy (64 bit). */
export async function dHash(image: Buffer): Promise<string> {
  return dHashFromGrid(await toDHashGrid(image));
}

function assertDHash(hash: string): void {
  if (!DHASH_PATTERN.test(hash)) {
    throw new RangeError('A dHash pontosan 16 kisbetűs hexadecimális számjegy kell legyen');
  }
}

/**
 * Két dHash Hamming-távolsága: hány bitben térnek el (0 = azonos … 64 = minden bit más).
 * A kizáró vagy (XOR) eredményében pontosan az eltérő bitek helyén áll 1; ezeket számoljuk meg.
 */
export function hammingDistance(first: string, second: string): number {
  assertDHash(first);
  assertDHash(second);
  let difference = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  let distance = 0;
  // Wegner módszere: az x & (x − 1) a legalsó 1-es bitet törli, így a ciklus annyiszor fut le,
  // ahány 1-es bit van – nem kell mind a 64 bitet végignézni
  while (difference > 0n) {
    difference &= difference - 1n;
    distance += 1;
  }
  return distance;
}

/** Egy jelölt (kép) a megadott dHash-től mért Hamming-távolságával. */
export interface RankedCandidate {
  id: string;
  distance: number;
}

/**
 * A jelöltek a megadott dHash-től mért Hamming-távolságukkal, növekvő távolság szerint. A rendezés
 * stabil: egyenlő távolságnál a lista korábbi eleme marad elöl – a hívók a korábban feltöltött képet
 * teszik előre, mert az számít eredetinek. A hitelesség-ellenőrzés ebben a sorrendben vizsgálja a
 * jelölteket, amíg a lánc az egyiket meg nem erősíti (verification.service.ts).
 * Forrás: MDN – Array.prototype.sort() (ES2019 óta stabil rendezés),
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
 */
export function rankByDistance(
  dHash: string,
  candidates: readonly { id: string; dHash: string }[],
): RankedCandidate[] {
  return candidates
    .map((candidate) => ({ id: candidate.id, distance: hammingDistance(dHash, candidate.dHash) }))
    .sort((first, second) => first.distance - second.distance);
}

/**
 * A megadott dHash-hez legközelebbi (legkisebb Hamming-távolságú) jelölt és a távolsága; üres
 * listára undefined. Egyenlő távolságnál a lista korábbi eleme marad (lásd rankByDistance).
 */
export function findClosest(
  dHash: string,
  candidates: readonly { id: string; dHash: string }[],
): RankedCandidate | undefined {
  return rankByDistance(dHash, candidates)[0];
}

/**
 * Soronként a legvilágosabb és a legsötétebb cella fényességkülönbsége (8 érték, 0 … 255). A dHash
 * egy sora csak akkor hordoz információt, ha a soron belül van fényességkülönbség: az egyszínű sor
 * minden bitje 0, akárhogy tér is el a sor a többitől. A képelemzés ezzel ismeri fel a degenerált
 * hash-t (imageAnalysis.ts).
 */
export function rowBrightnessRanges(grid: Uint8Array): number[] {
  assertGrid(grid);
  return Array.from({ length: DHASH_ROWS }, (_, row) => {
    const cells = grid.subarray(row * DHASH_COLUMNS, (row + 1) * DHASH_COLUMNS);
    return Math.max(...cells) - Math.min(...cells);
  });
}

function assertBitCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > DHASH_BITS) {
    throw new RangeError(`A ${name} 0 és ${DHASH_BITS} közötti egész szám kell legyen`);
  }
}

/** Igaz, ha a két kép a távolság alapján egymás (módosított) másolatának számít. */
export function isNearDuplicate(
  distance: number,
  threshold: number = DEFAULT_DHASH_THRESHOLD,
): boolean {
  assertBitCount(distance, 'távolság');
  assertBitCount(threshold, 'küszöb');
  return distance <= threshold;
}
