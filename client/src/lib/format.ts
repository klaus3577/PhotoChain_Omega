// A felület magyar formázásai (Intl, hu-HU): ár forintban, szám ezres tagolással, átlagos értékelés egy
// tizedesre, dátum és időpont – budapesti idő szerint, hogy a regisztráció ideje a néző gépének
// beállításától függetlenül ugyanaz legyen. Az ezres tagoló és a pénznem előtti szóköz nem törő
// (a „12 500 Ft” nem törik két sorba). A hosszú hexa értékek (hash, cím) rövidítve jelennek meg.
// Forrás: MDN – Intl.NumberFormat, Intl.DateTimeFormat,
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl (adaptálva)
const LOCALE = 'hu-HU';
const TIME_ZONE = 'Europe/Budapest';

const PRICE = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'HUF',
  maximumFractionDigits: 0,
});
const INTEGER = new Intl.NumberFormat(LOCALE);
const RATING = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const DATE = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeZone: TIME_ZONE });
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MEGABYTES = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const NBSP = '\u00A0';

/** „12 500 Ft” */
export const formatPrice = (huf: number): string => PRICE.format(huf);

/** Fájlméret: „8,4 MB” (1024-es alapon, mint a szerver korlátja), 1 MB alatt „640 kB”, illetve „512 B”. */
export function formatBytes(bytes: number): string {
  if (bytes >= BYTES_PER_MEGABYTE)
    return `${MEGABYTES.format(bytes / BYTES_PER_MEGABYTE)}${NBSP}MB`;
  if (bytes >= BYTES_PER_KILOBYTE) {
    return `${INTEGER.format(Math.round(bytes / BYTES_PER_KILOBYTE))}${NBSP}kB`;
  }
  return `${INTEGER.format(bytes)}${NBSP}B`;
}

/** Megabájtban, mértékegység nélkül („5,2”) – a haladásjelző „5,2 / 8,4 MB” alakjához. */
export const formatMegabytes = (bytes: number): string =>
  MEGABYTES.format(bytes / BYTES_PER_MEGABYTE);

/** „11 820 993” */
export const formatInteger = (value: number): string => INTEGER.format(value);

/** Ár-tartomány: „5000 – 20 000 Ft”, „legalább 5000 Ft”, „legfeljebb 20 000 Ft” (null: nincs határ). */
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null) return max === null ? '' : `legfeljebb ${formatPrice(max)}`;
  return max === null
    ? `legalább ${formatPrice(min)}`
    : `${formatInteger(min)} – ${formatPrice(max)}`;
}

/** „4,6” – az átlagos értékelés egy tizedesre */
export const formatRating = (average: number): string => RATING.format(average);

/** „2026. október 4.” */
export const formatDate = (iso: string): string => DATE.format(new Date(iso));

/** „2026. 10. 04. 14:32” */
export const formatDateTime = (iso: string): string => DATE_TIME.format(new Date(iso));

/** A hexa érték eleje és vége („5a1f9c3e…8b20d47e”); a „0x” előtag megmarad, a rövid érték változatlan. */
export function shortenHex(value: string, visible = 8): string {
  const prefix = value.startsWith('0x') ? '0x' : '';
  const digits = value.slice(prefix.length);
  if (digits.length <= visible * 2 + 1) return value;
  return `${prefix}${digits.slice(0, visible)}…${digits.slice(-visible)}`;
}
