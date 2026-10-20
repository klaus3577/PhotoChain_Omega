// Felhasználónak szóló szövegek: a szerver rövid hibaüzeneteiből teljes mondat, és a korlátozásnál
// (429) a várakozás ideje.
import { ApiError } from '../api/http';

const SECONDS_PER_MINUTE = 60;

const character = (codePoint: number) => String.fromCodePoint(codePoint);
/**
 * Vezérlőkarakter, sor- és bekezdéselválasztó, irányváltó jel – mint a szerver NO_CONTROL_CHARACTERS-e
 * (server/src/lib/text.ts): a név és a keresőszó nem tartalmazhatja.
 */
export const CONTROL_CHARACTER = new RegExp(
  `[\\p{Cc}${character(0x2028)}${character(0x2029)}${character(0x202a)}-${character(0x202e)}${character(0x2066)}-${character(0x2069)}]`,
  'u',
);
/** Többsoros mezőhöz (leírás): mint fent, de a sortörés és a tabulátor megengedett (a szerver szabálya) */
export const CONTROL_CHARACTER_EXCEPT_NEWLINES = new RegExp(
  `[^\\P{Cc}\\n\\r\\t]|[${character(0x2028)}${character(0x2029)}${character(0x202a)}-${character(0x202e)}${character(0x2066)}-${character(0x2069)}]`,
  'u',
);

/** A megjelenítéskor láthatatlan karakterek (Unicode Default_Ignorable_Code_Point) – mint a szerveren */
const INVISIBLE_CHARACTERS = /\p{Default_Ignorable_Code_Point}/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** A láthatatlan karakterek nélkül. */
export const visibleText = (text: string): string => text.replace(INVISIBLE_CHARACTERS, '');
/** Hossz kódpontban, mint a szerver Zod 4 sémájában (a kiegészítő síkú karakter is egy, nem kettő). */
export const codePointLength = (text: string): number => [...text].length;
/** A látható karakterek száma kódpontban (a szerver visibleLength függvénye). */
export const visibleLength = (text: string): number => codePointLength(visibleText(text));
/** Van-e a szövegben látható betű vagy szám (ne jelenhessen meg üres cím vagy név). */
export const hasVisibleLetterOrDigit = (text: string): boolean =>
  LETTER_OR_DIGIT.test(visibleText(text));

/** Nagy kezdőbetű és mondatvégi írásjel (a szerver mezőüzenetei pl. „legalább 8 karakter kell”). */
export function toSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') return trimmed;
  const capitalized = trimmed[0]!.toLocaleUpperCase('hu-HU') + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** Mikor próbálható újra – a Retry-After másodpercei alapján. */
export function retryHint(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `Kb. ${seconds} másodperc múlva próbálhatod újra.`;
  return `Kb. ${Math.ceil(seconds / SECONDS_PER_MINUTE)} perc múlva próbálhatod újra.`;
}

/**
 * A hibák, amelyeknél a szerver Retry-After fejléce megmondja, mikor érdemes újrapróbálni: korlátozás,
 * túlterhelt szerver, és a lánc elérhetetlensége (utána a szerver egy percig nem is kérdezi a láncot – L24)
 */
const RETRY_LATER_CODES = new Set(['RATE_LIMITED', 'SERVER_BUSY', 'CHAIN_UNAVAILABLE']);

/**
 * A hiba szövege a felhasználónak (a szerver magyar üzenete, korlátozásnál és túlterhelt szervernél a
 * várakozással); üres üzenet helyett általános szöveg – üres hibajelzés nem jelenhet meg.
 */
export function errorText(error: unknown): string {
  const text = (error instanceof Error && toSentence(error.message)) || 'Váratlan hiba történt.';
  if (
    error instanceof ApiError &&
    RETRY_LATER_CODES.has(error.code) &&
    error.retryAfterSeconds !== undefined
  ) {
    return `${text} ${retryHint(error.retryAfterSeconds)}`;
  }
  return text;
}
