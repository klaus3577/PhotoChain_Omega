// A feltöltött (nem megbízható) képfájlok megnyitása a sharp-pal, közös védőkorlátokkal. A hash-
// és a képfeldolgozó modul is ezen keresztül nyitja meg a képet.
// Forrás: sharp dokumentáció – limitInputPixels (https://sharp.pixelplumbing.com/api-constructor),
// timeout (https://sharp.pixelplumbing.com/api-output#timeout), sharp.block / unblock
// (https://sharp.pixelplumbing.com/api-utility#block) – adaptálva; OWASP File Upload Cheat Sheet,
// https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
import sharp, { type Sharp } from 'sharp';

/**
 * Ennél több képpontot nem dekódolunk. A fájlméret-korlát ezt nem helyettesíti: egy néhány száz
 * kB-os, egyszínű PNG kibontva több száz MB memóriát foglalhat („tömörített bomba”). 50 megapixel
 * a 15 MB-os fájlkorláthoz illő felbontás; egy ekkora kép dekódolva kb. 150–200 MB.
 */
export const MAX_IMAGE_PIXELS = 50_000_000;

const PIXELS_PER_MEGAPIXEL = 1_000_000;

/**
 * Az érvényes képpontkorlát. Alapból MAX_IMAGE_PIXELS; a kisebb memóriájú tárhelyen (az ingyenes
 * Render-példány 512 MB) élesben kisebb (L32, IMAGE_MAX_MEGAPIXELS) – a szerver induláskor egyszer
 * állítja be, mint a dekóderek szűkítését (restrictImageDecoders).
 */
let maxImagePixels = MAX_IMAGE_PIXELS;

/** A képpontkorlát beállítása megapixelben (1 és 50 között, egész szám). */
export function setMaxImageMegapixels(megapixels: number): void {
  const pixels = megapixels * PIXELS_PER_MEGAPIXEL;
  if (!Number.isInteger(megapixels) || pixels < PIXELS_PER_MEGAPIXEL || pixels > MAX_IMAGE_PIXELS) {
    throw new RangeError(
      `A képpontkorlát 1 és ${MAX_IMAGE_PIXELS / PIXELS_PER_MEGAPIXEL} megapixel közötti egész lehet`,
    );
  }
  maxImagePixels = pixels;
}

/**
 * Induláskor (L32): a képpontkorlát beállítása, a sharp műveleti gyorsítótárának kikapcsolása (a
 * szerver minden képet egyszer dolgoz fel, a gyorsítótár csak memóriát foglalna) és a szálszám.
 * Forrás: sharp – cache, concurrency, https://sharp.pixelplumbing.com/api-utility
 */
export function configureImageMemory(maxMegapixels: number): void {
  setMaxImageMegapixels(maxMegapixels);
  sharp.cache(false);
  // Képenként egy libvips-szál: a kis (0,1 CPU-s) példányon a több szál csak memóriát foglalna – a
  // párhuzamosságot a közös képfeldolgozási sor szabja meg (L32 biztonsági átnézés)
  sharp.concurrency(1);
}

/** Az érvényes képpontkorlát (képpontban). */
export function currentMaxImagePixels(): number {
  return maxImagePixels;
}

/** Egy kép feldolgozása legfeljebb ennyi ideig tarthat (a rosszindulatúan lassú fájlok ellen). */
export const IMAGE_PROCESSING_TIMEOUT_SECONDS = 20;

/** A kép megnyitása feldolgozásra, a képpont- és az időkorláttal. */
export function openImage(image: Buffer): Sharp {
  return sharp(image, { limitInputPixels: maxImagePixels }).timeout({
    seconds: IMAGE_PROCESSING_TIMEOUT_SECONDS,
  });
}

/** A libvips betöltő műveletei közül ezek maradnak engedélyezve (mind memóriából olvas). */
const ALLOWED_DECODERS = [
  'VipsForeignLoadJpegBuffer',
  'VipsForeignLoadPngBuffer',
  'VipsForeignLoadWebpBuffer',
  // A vízjel SVG-ből készül; feltöltött SVG ide nem juthat el (lásd inspectImage)
  'VipsForeignLoadSvgBuffer',
];

/**
 * A szerver indulásakor hívandó: a sharp (libvips) összes többi képdekóderét letiltja az egész
 * folyamatra. Így egy feltöltött fájl akkor sem érhet el ritkán használt dekódert (TIFF, GIF,
 * HEIF…), ha a típusellenőrzésben hiba volna – kisebb a támadási felület.
 */
export function restrictImageDecoders(): void {
  sharp.block({ operation: ['VipsForeignLoad'] });
  sharp.unblock({ operation: ALLOWED_DECODERS });
}
