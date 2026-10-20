// A feltöltés kliensoldali ellenőrzése (L21). A mezők szabályai a szerveréi (server/src/modules/photos/
// photos.schemas.ts, lib/text.ts): a hossz kódpontban, a cím minimuma a látható karakterekből, a
// vezérlőkarakter tiltott (a leírásban a sortörés és a tabulátor megengedett), az ár egész forint a
// Stripe legkisebb terhelhető összege és a legnagyobb ár között. A fájlt a típusa, a mérete és – ha a
// böngésző ki tudja olvasni – a felbontása alapján szűrjük még a küldés előtt (a szerver korlátai:
// middleware/upload.ts, services/imageDecoding.ts); a végső döntés a szerveré, ő a tartalom alapján dönt.
// Ez kényelmi ellenőrzés, nem biztonsági: a felesleges körutat spórolja meg, és a hibát azonnal mondja.
import type { FieldErrors } from '../auth/validation';
import { formatBytes } from '../lib/format';
import {
  codePointLength,
  CONTROL_CHARACTER,
  CONTROL_CHARACTER_EXCEPT_NEWLINES,
  hasVisibleLetterOrDigit,
  visibleLength,
} from '../lib/text';

export const UPLOAD_FIELDS = ['title', 'description', 'priceHuf', 'categoryId'] as const;
export type UploadField = (typeof UPLOAD_FIELDS)[number];
export type UploadValues = Record<UploadField, string>;

/** A szerver korlátai (README – Képfeltöltés) */
const MAX_UPLOAD_MEGABYTES = 15;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * 1024 * 1024;
export const MIN_IMAGE_EDGE_PX = 600;
/** A szerver alapértelmezett képpontkorlátja megapixelben (imageDecoding.ts) */
const DEFAULT_MAX_MEGAPIXELS = 50;
const PIXELS_PER_MEGAPIXEL = 1_000_000;

/**
 * A build képpontkorlátja megapixelben (L32): élesben a szerveré kisebb lehet (IMAGE_MAX_MEGAPIXELS –
 * a Dockerfile ugyanebből adja a kliens buildjének is). Hiányzó vagy érvénytelen értéknél a szerver
 * alapértéke – a végső döntés úgyis a szerveré.
 */
export function maxImageMegapixelsFrom(value: string | undefined): number {
  const megapixels = Number(value);
  const valid =
    /^\d+$/.test(value ?? '') && megapixels >= 1 && megapixels <= DEFAULT_MAX_MEGAPIXELS;
  return valid ? megapixels : DEFAULT_MAX_MEGAPIXELS;
}

/** Ennél több képpontot a szerver nem dekódol (a „tömörített bomba” ellen – imageDecoding.ts) */
export const MAX_IMAGE_PIXELS =
  maxImageMegapixelsFrom(import.meta.env.VITE_IMAGE_MAX_MEGAPIXELS as string | undefined) *
  PIXELS_PER_MEGAPIXEL;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MIN_PRICE_HUF = 175;
const MAX_PRICE_HUF = 9_999_999;
const DIGITS = /^\d+$/;

/**
 * A fogadóterület súgója – a korlátok előre látszanak (Nielsen H5), a hibaüzenetek szavaival; a rövidebb
 * oldal korlátja a feltöltésnél 600, az ellenőrzésnél 100 képpont (L24).
 */
export const imageHintOf = (minEdgePx: number): string =>
  `JPEG, PNG vagy WebP · legfeljebb ${MAX_UPLOAD_MEGABYTES} MB és ${MAX_IMAGE_PIXELS / 1_000_000} megapixel · a rövidebb oldal legalább ${minEdgePx} képpont`;
export const UPLOAD_HINT = imageHintOf(MIN_IMAGE_EDGE_PX);
export const PRICE_HINT = 'Egész forint, 175 és 9 999 999 Ft között.';

function validateTitle(value: string): string | undefined {
  const title = value.trim();
  if (title === '') return 'Add meg a kép címét.';
  if (visibleLength(title) < MIN_TITLE_LENGTH)
    return `A cím legalább ${MIN_TITLE_LENGTH} karakter legyen.`;
  if (codePointLength(title) > MAX_TITLE_LENGTH)
    return `A cím legfeljebb ${MAX_TITLE_LENGTH} karakter lehet.`;
  if (CONTROL_CHARACTER.test(title))
    return 'A cím nem tartalmazhat sortörést vagy vezérlőkaraktert.';
  if (!hasVisibleLetterOrDigit(title)) return 'A cím tartalmazzon legalább egy betűt vagy számot.';
  return undefined;
}

/** A leírás, ahogy a szerver is olvassa: a Windows-sortörés egy karakter, a széle levágva. */
export const normalizeDescription = (value: string): string => value.replace(/\r\n?/g, '\n').trim();

function validateDescription(value: string): string | undefined {
  const description = normalizeDescription(value);
  if (codePointLength(description) > MAX_DESCRIPTION_LENGTH)
    return `A leírás legfeljebb ${MAX_DESCRIPTION_LENGTH} karakter lehet.`;
  if (CONTROL_CHARACTER_EXCEPT_NEWLINES.test(description))
    return 'A leírás nem tartalmazhat vezérlőkaraktert.';
  return undefined;
}

/** A beírt ár számjegyei (a tagoló szóközök – nem törő is – és a vezető nullák nélkül); null, ha nem egész szám. */
export function priceDigits(value: string): string | null {
  const compact = value.replace(/\s/g, '').replace(/^0+(?=\d)/, '');
  return DIGITS.test(compact) ? compact : null;
}

function validatePrice(value: string): string | undefined {
  if (value.trim() === '') return 'Add meg az árat.';
  const digits = priceDigits(value);
  if (digits === null) return 'Az ár egész forintösszeg legyen (pl. 12 500).';
  // A felső korlátnál több számjegy biztosan túl nagy (a Number() már pontatlan lehetne)
  if (digits.length > String(MAX_PRICE_HUF).length || Number(digits) > MAX_PRICE_HUF)
    return 'Az ár legfeljebb 9 999 999 Ft lehet.';
  if (Number(digits) < MIN_PRICE_HUF) return `Az ár legalább ${MIN_PRICE_HUF} Ft legyen.`;
  return undefined;
}

/** Csak a hibás mezők maradnak meg. */
function onlyErrors(entries: Record<UploadField, string | undefined>): FieldErrors<UploadField> {
  return Object.fromEntries(
    Object.entries(entries).filter(([, message]) => message),
  ) as FieldErrors<UploadField>;
}

export function validateUploadFields(values: UploadValues): FieldErrors<UploadField> {
  return onlyErrors({
    title: validateTitle(values.title),
    description: validateDescription(values.description),
    priceHuf: validatePrice(values.priceHuf),
    categoryId: values.categoryId === '' ? 'Válassz kategóriát.' : undefined,
  });
}

/** A fájl típusa és mérete – a hiba szövege, vagy undefined, ha küldhető. */
export function checkImageFile(file: File): string | undefined {
  const typeAccepted = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
  // Egyes böngészők (vagy húzással érkező fájlok) nem adnak típust: akkor a kiterjesztés dönt
  const extensionAccepted = file.type === '' && ACCEPTED_EXTENSIONS.test(file.name);
  if (!typeAccepted && !extensionAccepted) return 'Csak JPEG, PNG vagy WebP kép tölthető fel.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `A fájl túl nagy: legfeljebb ${MAX_UPLOAD_MEGABYTES} MB lehet (a kiválasztott fájl ${formatBytes(file.size)}).`;
  }
  return undefined;
}

/**
 * A kép felbontása (ha a böngésző betöltötte): a rövidebb oldal legalább 600 képpont (az ellenőrzésnél
 * 100 – L24), összesen legfeljebb MAX_IMAGE_PIXELS (alapból 50 megapixel; élesben a build értéke, L32).
 */
export function checkImageDimensions(
  width: number,
  height: number,
  minEdgePx = MIN_IMAGE_EDGE_PX,
): string | undefined {
  const size = `(a kiválasztott kép ${width} × ${height} képpontos)`;
  if (Math.min(width, height) < minEdgePx) {
    return `A kép túl kicsi: a rövidebb oldala legalább ${minEdgePx} képpont legyen ${size}.`;
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    return `A kép túl nagy: legfeljebb ${MAX_IMAGE_PIXELS / 1_000_000} megapixel lehet ${size}.`;
  }
  return undefined;
}
