// Képfeldolgozás a feltöltéshez: a fájl valódi típusának és méretének ellenőrzése, vízjeles
// előnézet és bélyegkép készítése (terv D10: az előnézet nyilvános, az eredeti privát).
// Forrás: sharp dokumentáció – metadata, resize, composite, https://sharp.pixelplumbing.com/
// (adaptálva); OWASP File Upload Cheat Sheet,
// https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
import sharp, { type Metadata, type Sharp } from 'sharp';

import { currentMaxImagePixels, openImage } from './imageDecoding.js';

export type ImageFormat = 'jpeg' | 'png' | 'webp';

/** A kép mindkét oldala legalább ennyi képpont legyen. */
export const MIN_IMAGE_EDGE_PX = 600;
/** A vízjeles előnézet, illetve a bélyegkép hosszabbik oldala legfeljebb ennyi képpont. */
export const PREVIEW_MAX_EDGE_PX = 1200;
export const THUMBNAIL_MAX_EDGE_PX = 400;

const PREVIEW_JPEG_QUALITY = 82;
const THUMBNAIL_JPEG_QUALITY = 80;
const WATERMARK_TEXT = 'PhotoChain';

/** A fájl nem ép JPEG-, PNG- vagy WebP-kép, vagy több képkockából áll (animált). */
export class UnsupportedImageError extends Error {
  constructor(options?: ErrorOptions) {
    super('A fájl nem támogatott formátumú vagy nem dolgozható fel képként', options);
    this.name = 'UnsupportedImageError';
  }
}

export class ImageTooSmallError extends Error {
  constructor(width: number, height: number) {
    super(`A kép túl kicsi: ${width}×${height} képpont`);
    this.name = 'ImageTooSmallError';
  }
}

export class ImageTooLargeError extends Error {
  constructor(width: number, height: number) {
    super(`A kép felbontása túl nagy: ${width}×${height} képpont`);
    this.name = 'ImageTooLargeError';
  }
}

export interface ImageInfo {
  format: ImageFormat;
  /** A megjelenő (EXIF szerint elforgatott) szélesség és magasság */
  width: number;
  height: number;
}

// A három elfogadott formátum fájl eleji azonosítója („mágikus szám”)
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF_SIGNATURE = Buffer.from('RIFF', 'latin1');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'latin1');
/** A WebP-fájlban a „WEBP” azonosító a RIFF fejléc (4 bájt) és a fájlméret (4 bájt) után áll. */
const WEBP_SIGNATURE_OFFSET = 8;

/**
 * A formátum a fájl első bájtjai alapján. Ez dönti el, melyik fájl juthat el egyáltalán a
 * képdekóderig: más formátumot (SVG, TIFF, GIF…) a sharp meg sem kap.
 */
function detectFormat(image: Buffer): ImageFormat | undefined {
  const startsWith = (signature: Buffer, offset = 0): boolean =>
    image.subarray(offset, offset + signature.length).equals(signature);
  if (startsWith(JPEG_SIGNATURE)) return 'jpeg';
  if (startsWith(PNG_SIGNATURE)) return 'png';
  if (startsWith(RIFF_SIGNATURE) && startsWith(WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)) {
    return 'webp';
  }
  return undefined;
}

const PNG_CHUNK_HEADER_BYTES = 8; // 4 bájt hossz + 4 bájt típus
const PNG_CHUNK_CHECKSUM_BYTES = 4;

/**
 * Animált PNG-e (APNG)? A PNG-dekóder az animációs blokkokat figyelmen kívül hagyja, ezért a
 * sharp az ilyen fájlt egy képkockásnak látja – a böngésző viszont az animációt játszaná le. Az
 * animációt a képadat (IDAT) előtt álló acTL blokk jelzi.
 * Forrás: APNG Specification, https://wiki.mozilla.org/APNG_Specification; PNG (W3C) – a blokkok
 * felépítése, https://www.w3.org/TR/png/#5Chunk-layout
 */
function isAnimatedPng(png: Buffer): boolean {
  let offset = PNG_SIGNATURE.length;
  while (offset + PNG_CHUNK_HEADER_BYTES <= png.length) {
    const dataLength = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + PNG_CHUNK_HEADER_BYTES);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += PNG_CHUNK_HEADER_BYTES + dataLength + PNG_CHUNK_CHECKSUM_BYTES;
  }
  return false;
}

/** A kép fejlécének adatai – ehhez a sharp a képpontokat még nem dekódolja. */
async function readMetadata(image: Buffer): Promise<Metadata> {
  try {
    return await sharp(image, { limitInputPixels: false }).metadata();
  } catch (error) {
    throw new UnsupportedImageError({ cause: error });
  }
}

/**
 * A fájl típusát a tartalmából állapítja meg (nem a nevéből vagy a kliens által küldött típusból):
 * csak egyetlen képkockából álló JPEG, PNG vagy WebP fogadható el. A több képkockás (animált) kép
 * azért nem, mert a dHash csak az első képkockát látná – azzal a másolatszűrés megkerülhető volna.
 * A rövidebb oldal legkisebb mérete alapból a feltöltésé; a hitelesség-ellenőrzés kisebbet is enged.
 */
export async function inspectImage(
  image: Buffer,
  minEdgePx: number = MIN_IMAGE_EDGE_PX,
): Promise<ImageInfo> {
  const format = detectFormat(image);
  if (!format || (format === 'png' && isAnimatedPng(image))) throw new UnsupportedImageError();

  const metadata = await readMetadata(image);
  if (metadata.format !== format || (metadata.pages ?? 1) > 1) throw new UnsupportedImageError();

  const { width, height } = metadata.autoOrient;
  if (width * height > currentMaxImagePixels()) throw new ImageTooLargeError(width, height);
  if (Math.min(width, height) < minEdgePx) throw new ImageTooSmallError(width, height);
  return { format, width, height };
}

/**
 * Átlósan ismétlődő, félig átlátszó vízjel (felirat + vonal) a kép méretében. A vonal betűkészlet
 * nélküli környezetben (pl. egy karcsú Docker-képben) is megjelenik.
 * Forrás: MDN – SVG pattern elem,
 * https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/pattern (adaptálva)
 */
/** A vízjel feliratának átlátszatlansága; a körvonalé és a vonalé ehhez képest arányos */
export const DEFAULT_WATERMARK_OPACITY = 0.45;
const WATERMARK_OUTLINE_OPACITY_RATIO = 0.3 / DEFAULT_WATERMARK_OPACITY;
const WATERMARK_LINE_OPACITY_RATIO = 0.35 / DEFAULT_WATERMARK_OPACITY;

function watermarkSvg(width: number, height: number, opacity: number): Buffer {
  const fontSize = Math.round(Math.max(width, height) / 20);
  const tileWidth = fontSize * 7;
  const tileHeight = fontSize * 4;
  const outlineOpacity = opacity * WATERMARK_OUTLINE_OPACITY_RATIO;
  const lineOpacity = opacity * WATERMARK_LINE_OPACITY_RATIO;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <pattern id="watermark" width="${tileWidth}" height="${tileHeight}"
          patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="0" y="${fontSize}" font-family="Arial, Helvetica, sans-serif"
            font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="${opacity}"
            stroke="#000000" stroke-opacity="${outlineOpacity}" stroke-width="1.5">${WATERMARK_TEXT}</text>
          <line x1="0" y1="${fontSize * 2.5}" x2="${tileWidth}" y2="${fontSize * 2.5}"
            stroke="#ffffff" stroke-opacity="${lineOpacity}" stroke-width="${Math.max(2, fontSize / 10)}"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)"/>
    </svg>`,
  );
}

/** A megjelenő állásba forgatott, lekicsinyített kép nyers képpontjai (metaadatok nélkül). */
function resizeInside(image: Buffer, maxEdge: number): Sharp {
  return openImage(image)
    .autoOrient()
    .flatten({ background: '#ffffff' })
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
}

/**
 * A feltöltött kép dekódolása. Egy sérült képadat (pl. a fájl közepéből hiányzó darab) csak a
 * teljes felbontású dekódoláskor derülhet ki – a fejléc és a kicsinyítve olvasó dHash még átmehet
 * rajta –, ezért az itt fellépő hiba is UnsupportedImageError, az eredeti hibával az okaként.
 */
async function decodeUpload<Result>(decode: () => Promise<Result>): Promise<Result> {
  try {
    return await decode();
  } catch (error) {
    throw new UnsupportedImageError({ cause: error });
  }
}

export interface PreviewOptions {
  /**
   * A vízjel átlátszatlansága 0 (nincs vízjel) és 1 között. A szerver mindig az alapértékkel dolgozik;
   * a beállítás a hitelesítés kiértékeléséhez (L29) van: mennyire változtatja meg a vízjel a dHash-t.
   */
  watermarkOpacity?: number;
}

/**
 * Nyilvános, vízjeles előnézet: legfeljebb 1200 képpontos JPEG. A sharp a kimenetbe alapból nem
 * írja át a metaadatokat, így az EXIF (GPS, a gép sorozatszáma) az előnézetből kimarad.
 */
export async function createPreview(
  image: Buffer,
  { watermarkOpacity = DEFAULT_WATERMARK_OPACITY }: PreviewOptions = {},
): Promise<Buffer> {
  const { data, info } = await decodeUpload(() =>
    resizeInside(image, PREVIEW_MAX_EDGE_PX).raw().toBuffer({ resolveWithObject: true }),
  );
  // A vízjelezés már a saját, ellenőrzött nyers adatunkon fut: az itteni hiba szerverhiba volna
  const preview = sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  });
  const watermarked =
    watermarkOpacity > 0
      ? preview.composite([{ input: watermarkSvg(info.width, info.height, watermarkOpacity) }])
      : preview;
  return watermarked.jpeg({ quality: PREVIEW_JPEG_QUALITY }).toBuffer();
}

/** Nyilvános bélyegkép a listákhoz: legfeljebb 400 képpontos JPEG, metaadatok nélkül. */
export function createThumbnail(image: Buffer): Promise<Buffer> {
  return decodeUpload(() =>
    resizeInside(image, THUMBNAIL_MAX_EDGE_PX).jpeg({ quality: THUMBNAIL_JPEG_QUALITY }).toBuffer(),
  );
}
