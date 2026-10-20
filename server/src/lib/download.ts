// A letöltött fájl neve és a Content-Disposition fejléc. A név a kép címéből készül: a fájlnévben
// tiltott (Windows) karakterek helyén aláhúzás áll, a vezérlő- és láthatatlan formázó karakterek
// (pl. az irányváltó jel, amellyel egy „.exe” végű név „.jpg”-nek látszhat) kimaradnak. A fejléc az
// RFC 6266 szerint az ékezetes nevet UTF-8 kódolással (filename*), a régi klienseknek ékezet nélküli
// tartalékként (filename) is megadja.
// Forrás: RFC 6266 – Use of the Content-Disposition Header Field in HTTP,
// https://www.rfc-editor.org/rfc/rfc6266; content-disposition (npm) README,
// https://github.com/jshttp/content-disposition; Microsoft Learn – Naming Files, Paths, and
// Namespaces, https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file (adaptálva)
import type { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { create as contentDisposition } from 'content-disposition';

/** A fájlnév leghosszabb része a kiterjesztés előtt (kódpontban) */
const MAX_BASE_LENGTH = 100;
/** A Windows fájlnevekben tiltott karakterei */
const RESERVED_CHARACTERS = /[\\/:*?"<>|]/g;
/** Vezérlő- és formázó (láthatatlan, irányváltó) karakterek */
const INVISIBLE_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE = /\s+/gu;
/** A kezdő és záró pont és szóköz (a Windows a záró pontot csendben levágja) */
const EDGE_DOTS_AND_SPACES = /^[\s.]+|[\s.]+$/gu;
const COMBINING_MARKS = /\p{M}/gu;
/** A tartalék névben a nem nyomtatható ASCII és a % (egy hibás kliens %XX-ként visszafejthetné) */
const NOT_SAFE_ASCII = /[^\x20-\x24\x26-\x7e]/gu;
/** Párosítatlan UTF-16 helyettesítő (surrogate) – ebből nem készíthető érvényes UTF-8 */
const LONE_SURROGATES = /\p{Cs}/gu;
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);
/**
 * A pipeline a célra (a HTTP-válaszra) maga is több „close”-figyelőt tesz (Node 24-ben hetet); a
 * kérésnapló és a letöltési korlát figyelőivel együtt ez túllépné az alapértelmezett 10-es határt,
 * és minden letöltés hamis „memóriaszivárgás”-figyelmeztetést írna a naplóba. A határt ennyivel
 * emeljük – a figyelők valódi halmozódását így is jelezné.
 */
const PIPELINE_LISTENER_HEADROOM = 10;
/**
 * A Windows foglalt eszköznevei: kiterjesztéssel (és az utánuk álló szóközzel) sem lehetnek
 * fájlnevek – a NUL.tar.gz is a NUL eszközt jelenti; a felső indexes számjegy (COM¹) is foglalt
 */
const RESERVED_DEVICE_NAME = /^(?:con|prn|aux|nul|com[\d¹²³]|lpt[\d¹²³]) *(?:\.|$)/iu;

/** A foglalt eszköznévvel kezdődő név elé aláhúzás kerül. */
const escapeReservedName = (name: string): string =>
  RESERVED_DEVICE_NAME.test(name) ? `_${name}` : name;

/**
 * A letöltött fájl neve a kép címéből és a tárolt fájl kiterjesztéséből. Ha a címből semmi nem marad,
 * a tartalék név (pl. photochain-<azonosító>) kerül a helyére.
 */
export function downloadFileName(title: string, fallbackBase: string, extension: string): string {
  const cleaned = title
    .replace(LONE_SURROGATES, REPLACEMENT_CHARACTER)
    .normalize('NFC')
    .replace(WHITESPACE, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(WHITESPACE, ' ')
    .replace(RESERVED_CHARACTERS, '_')
    .replace(EDGE_DOTS_AND_SPACES, '');
  // Kódpontonként vágunk: egy emoji (két UTF-16 egység) sem törik ketté
  const base = Array.from(cleaned)
    .slice(0, MAX_BASE_LENGTH)
    .join('')
    .replace(EDGE_DOTS_AND_SPACES, '');
  if (!base) return `${fallbackBase}.${extension}`;
  return `${escapeReservedName(base)}.${extension}`;
}

/**
 * Az ékezet nélküli tartalék név: a nem ASCII karakterek és a % helyén aláhúzás. Az ékezetek
 * elhagyásával foglalt eszköznév is keletkezhet (Cón → Con) – az is aláhúzást kap.
 */
function asciiFallback(fileName: string): string {
  return escapeReservedName(
    fileName.normalize('NFD').replace(COMBINING_MARKS, '').replace(NOT_SAFE_ASCII, '_'),
  );
}

/** A letöltendő melléklet Content-Disposition fejléce (RFC 6266, RFC 8187). */
export function attachmentDisposition(fileName: string): string {
  return contentDisposition(fileName, { type: 'attachment', fallback: asciiFallback(fileName) });
}

/**
 * A fájl folyamának elküldése. A forrás (a megnyitott fájl) minden esetben lezárul – akkor is, ha a
 * kliens már a küldés előtt bontotta a kapcsolatot (különben a fájlleíró nyitva maradna). Ha a kliens
 * bontja a kapcsolatot, az nem szerverhiba – nincs kinek válaszolni; minden más hiba (az olvasási
 * hiba, a forrás idő előtti lezárása – azaz csonka letöltés) továbbmegy a hibakezelőhöz.
 * Forrás: Node.js dokumentáció – stream.pipeline (stream/promises), readable.destroy,
 * https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options;
 * emitter.setMaxListeners, https://nodejs.org/api/events.html#emittersetmaxlistenersn
 */
export async function sendStream(source: Readable, destination: Writable): Promise<void> {
  if (destination.destroyed) {
    source.destroy();
    return;
  }
  const listenerLimit = destination.getMaxListeners();
  if (listenerLimit !== 0) destination.setMaxListeners(listenerLimit + PIPELINE_LISTENER_HEADROOM);
  // A kliens bontotta a kapcsolatot, ha a cél (a válasz) bezárult, miközben a forrás hibátlan volt:
  // még olvastuk, vagy már végigolvastuk (csak a válasz lezárása volt hátra). Ha a forrás előbb
  // hibázott vagy idő előtt bezárult, az a mi hibánk – csonka letöltés.
  let clientGone = false;
  destination.once('close', () => {
    clientGone = !source.errored && !(source.destroyed && !source.readableEnded);
  });
  try {
    await pipeline(source, destination);
  } catch (error) {
    source.destroy();
    if (!clientGone) throw error;
  }
}
