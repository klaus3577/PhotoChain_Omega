// A kérésnaplózás (pino-http) szabályai: tömör, egysoros üzenet, a státusznak megfelelő szinttel.
// A fejlécek (süti, böngésző-azonosító, IP-cím) szándékosan nem kerülnek a naplóba.
// Forrás: pino-http README – Custom serializers, customLogLevel, customSuccessMessage,
// https://github.com/pinojs/pino-http (adaptálva)
import type { Level } from 'pino';

/** A szándékos terheléskorlátozás („a szerver most foglalt”) – nem hiba, csak figyelmeztetés. */
const SERVICE_UNAVAILABLE = 503;

/** 2xx/3xx → info, 4xx és 503 → warn, a többi 5xx vagy kivétel → error. */
export function requestLogLevel(statusCode: number, error?: Error): Level {
  if (error !== undefined) return 'error';
  if (statusCode >= 500 && statusCode !== SERVICE_UNAVAILABLE) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * A hitelesség-ellenőrzés hash-alapú útvonala (a hash és az esetleges lekérdezési rész) – kis- és
 * nagybetűtől függetlenül, a teljes URL-es kérésnél is (az Express mindkettőt kiszolgálja).
 */
const VERIFY_HASH_PATH = /^((?:[a-z][\d+.a-z-]*:\/\/[^/]*)?\/api\/verify\/)[^#?]+(?:[#?].*)?$/i;

/** A rendelés állapotának útvonala a Stripe-munkamenet azonosítójával (és a lekérdezési résszel) */
const ORDER_SESSION_PATH =
  /^((?:[a-z][\d+.a-z-]*:\/\/[^/]*)?\/api\/orders\/by-session\/)[^#?]+(?:[#?].*)?$/i;

/** SHA-256 alakú (64 hexadecimális jegyű, esetleg 0x előtagú) szakasz bárhol az útvonalban */
const SHA256_LIKE = /(?:0x)?[\da-f]{64}/gi;

/**
 * A galéria keresőszava a lekérdezési részben – a százalékkódolt kulccsal (%71 = „q”) küldött is: a
 * szerver a kulcsot is dekódolja, így az ugyanaz a paraméter
 */
const SEARCH_TERM = /([?&](?:q|%71)=)[^&#]*/g;

/**
 * Az útvonal a naplóba: a hitelesség-ellenőrzésre küldött hash helyett csak az útvonal mintája
 * (/api/verify/:sha256) kerül be – a naplóból így nem derül ki, ki milyen képet ellenőrzött. Ha az
 * útvonal szokatlan alakú, akkor is kitakarja a benne álló SHA-256 alakú szakaszt. A keresőszó
 * (személynév is lehet) helyett csak a helye marad: q=***. A rendelés állapotának útvonalán a
 * Stripe-munkamenet azonosítója helyett is csak a minta marad (/api/orders/by-session/:sessionId).
 */
export function redactRequestPath(path: string | undefined): string | undefined {
  return path
    ?.replace(VERIFY_HASH_PATH, '$1:sha256')
    .replace(ORDER_SESSION_PATH, '$1:sessionId')
    .replace(SHA256_LIKE, ':sha256')
    .replace(SEARCH_TERM, '$1***');
}

/**
 * A kérés teljes útvonala (kitakarva, lásd redactRequestPath). Az Express a routerek alá csatolt
 * útvonalaknál a req.url elejéről levágja a csatolási pontot (pl. /api/auth), amíg a kérés a
 * routerben van; az eredetit az originalUrl őrzi.
 */
export function requestPath(req: { url?: string; originalUrl?: string }): string | undefined {
  return redactRequestPath(req.originalUrl ?? req.url);
}

/** Pl. „GET /api/photos → 200 (12 ms)”. */
export function requestLogMessage(
  method: string | undefined,
  url: string | undefined,
  statusCode: number,
  responseTimeMs: number,
): string {
  return `${method} ${url} → ${statusCode} (${Math.round(responseTimeMs)} ms)`;
}
