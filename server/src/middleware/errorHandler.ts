// Egységes hibakezelés: minden hiba { error: { code, message, details? } } formában jut a klienshez.
// Váratlan hibánál a részletek csak a naplóba kerülnek, a válaszba nem.
// Forrás: Express dokumentáció – Error handling, https://expressjs.com/en/guide/error-handling.html
// (adaptálva)
import { finished } from 'node:stream';

import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';

/** Az Express JSON-feldolgozójának (body-parser) hibái a `type` mezőjükről ismerhetők fel. */
function isBodyParserError(error: unknown): error is { type: string } {
  return typeof error === 'object' && error !== null && 'type' in error && 'status' in error;
}

/** A kliens hibája (ismeretlen karakterkészlet vagy tömörítés a kérésben), nem a szerveré. */
const UNSUPPORTED_BODY_TYPES: ReadonlySet<string> = new Set([
  'charset.unsupported',
  'encoding.unsupported',
]);

/** Bármilyen hibát a kliensnek szóló AppError-rá alakít. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', details);
  }
  if (isBodyParserError(error) && error.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'A kérés törzse nem érvényes JSON');
  }
  if (isBodyParserError(error) && error.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'A kérés törzse túl nagy');
  }
  if (isBodyParserError(error) && UNSUPPORTED_BODY_TYPES.has(error.type)) {
    return new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'A kérés törzsének karakterkészlete vagy tömörítése nem támogatott',
    );
  }
  if (isBadPathEncoding(error) || isExposedClientError(error)) {
    return new AppError(400, 'VALIDATION_ERROR', 'Érvénytelen kérés');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Váratlan szerverhiba');
}

/**
 * A könyvtárak (body-parser, http-errors) a kliens hibáját 4xx státusszal és `expose: true`
 * jelzéssel adják – pl. a sérült tömörített törzs (zlib-hiba), a megszakított vagy a bejelentettnél
 * rövidebb törzs. Ezek nem szerverhibák (L30): 400, és nem kerülnek hibaként a naplóba – különben egy
 * kliens hibás kérésekkel elárasztaná a hibanaplót. A ki nem tehető (expose nélküli) hiba továbbra
 * is váratlan hiba.
 * Forrás: http-errors README (expose, status), https://github.com/jshttp/http-errors
 */
function isExposedClientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}

/**
 * Az Express a hibás %-kódolású útvonal-paraméternél (pl. GET /api/verify/%zz) 400-as státuszú
 * URIError-t dob (expose jelzés nélkül) – ez a kliens hibája, nem szerverhiba. Más, 400-as státuszt
 * hordozó, de ki nem tehető hiba nem ilyen: az váratlan hibaként a naplóba kerül.
 */
function isBadPathEncoding(error: unknown): boolean {
  return error instanceof URIError && 'status' in error && error.status === 400;
}

/** Az ismeretlen útvonalakra 404-es hibát ad (az útvonalak után kell regisztrálni). */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Nem található: ${req.method} ${req.path}`));
};

/**
 * Egy elutasított kérés törzséből legfeljebb ennyi bájtot olvasunk be a válasz előtt (a legnagyobb
 * megengedett feltöltés bőven belefér). Az ennél nagyobbnak bejelentett vagy ismeretlen hosszú
 * törzset nem várjuk meg.
 */
export const MAX_DRAINED_BODY_BYTES = 32 * 1024 * 1024;

/** 503-as válasznál ennyi másodperc múlva érdemes újrapróbálkozni (Retry-After fejléc) */
const RETRY_AFTER_SECONDS = 5;

/**
 * A Retry-After fejléc: az AppError által megadott idő; egyébként 503-nál az általános érték – ha
 * egy korábbi lépés (pl. a sebességkorlát a saját időablakával) még nem állította be.
 * Forrás: MDN – Retry-After, https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After
 */
function setRetryAfter(res: Response, error: AppError): void {
  if (error.retryAfterSeconds !== undefined) {
    res.set('Retry-After', String(error.retryAfterSeconds));
  } else if (error.statusCode === 503 && !res.hasHeader('Retry-After')) {
    res.set('Retry-After', String(RETRY_AFTER_SECONDS));
  }
}

/** A böngészőnek szóló hibaoldal adatai: a címe és a „Vissza” hivatkozás célja. */
export interface HtmlErrorPageOptions {
  title: string;
  backHref: string;
}

/** A hibaoldal adatai a válasz helyi változói között (htmlErrorPage állítja be, errorHandler olvassa). */
const HTML_ERROR_PAGE = 'htmlErrorPage';

/**
 * Egy útvonal kérheti, hogy a böngésző közvetlen navigációja (pl. egy letöltési hivatkozásra
 * kattintás) a hibát olvasható oldalként kapja, ne nyers JSON-ként: a böngésző ilyenkor
 * `Sec-Fetch-Dest: document` fejlécet küld. A JavaScriptből (fetch) indított kérés és minden más
 * útvonal továbbra is JSON-t kap; a státusz, a naplózás és a Retry-After ugyanaz marad.
 * Forrás: MDN – Sec-Fetch-Dest,
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Dest (adaptálva)
 */
export function htmlErrorPage(optionsOf: (req: Request) => HtmlErrorPageOptions): RequestHandler {
  return (req, res, next) => {
    if (req.get('sec-fetch-dest') === 'document') res.locals[HTML_ERROR_PAGE] = optionsOf(req);
    next();
  };
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);

/** Egyszerű, önálló hibaoldal (külső erőforrás nélkül – a CSP ezt engedi). */
function renderErrorPage(error: AppError, { title, backHref }: HtmlErrorPageOptions): string {
  const login = error.statusCode === 401 ? '<a href="/login">Bejelentkezés</a> · ' : '';
  return [
    '<!doctype html>',
    '<html lang="hu">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)} – PhotoChain</title></head>`,
    '<body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:40rem;margin:4rem auto;padding:0 1rem">',
    `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(error.message)}</p>`,
    `<p>${login}<a href="${escapeHtml(backHref)}">Vissza</a></p></main>`,
    '</body></html>',
  ].join('\n');
}

/** Van-e a kérésnek még be nem olvasott, ismert és korláton belüli hosszú törzse? */
function hasUnreadBoundedBody(req: Request): boolean {
  if (req.complete) return false;
  // Hiányzó fejlécnél (pl. darabolt átvitel) a Number(undefined) NaN – az nem egész szám
  const declaredLength = Number(req.headers['content-length']);
  return Number.isInteger(declaredLength) && declaredLength <= MAX_DRAINED_BODY_BYTES;
}

/**
 * A központi hibakezelő (az Express a 4 paraméterből ismeri fel; utolsóként kell regisztrálni).
 *
 * Ha a kérést a törzse beolvasása előtt utasítottuk el (pl. bejelentkezés nélküli képfeltöltés), a
 * válasz előtt a törzs maradékát beolvassuk és eldobjuk. Enélkül a `Connection: close` fejléccel
 * küldő kliens (pl. egy proxy) a hibaválasz helyett megszakadt kapcsolatot látna, mert a szerver
 * úgy bontaná a kapcsolatot, hogy a kliens még küldi a fájlt. (A body-parser és a multer a saját
 * hibáinál ugyanígy jár el.) A várakozásnak a kérés időkorlátja (server.ts, 3 perc) szab határt.
 * Forrás: Node.js dokumentáció – stream.finished, message.complete,
 * https://nodejs.org/api/stream.html#streamfinishedstream-options-callback (adaptálva); Express –
 * Error handling (headersSent), https://expressjs.com/en/guide/error-handling.html
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const appError = toAppError(error);
  // Csak a váratlan hiba kerül hibaként a naplóba; a szándékosan dobott AppError (pl. a 503-as
  // terheléskorlátozás) nem
  if (appError.statusCode >= 500 && !(error instanceof AppError)) {
    req.log?.error({ err: error }, 'Váratlan szerverhiba');
  }
  // Ha a válasz küldése már elkezdődött, új válasz nem küldhető: az Express alapértelmezett
  // kezelője ilyenkor bontja a kapcsolatot
  if (res.headersSent) {
    next(error);
    return;
  }
  const respond = (): void => {
    if (res.headersSent) return;
    setRetryAfter(res, appError);
    const page = res.locals[HTML_ERROR_PAGE] as HtmlErrorPageOptions | undefined;
    if (page) {
      res.status(appError.statusCode).type('html').send(renderErrorPage(appError, page));
      return;
    }
    res.status(appError.statusCode).json(appError.toBody());
  };
  if (!hasUnreadBoundedBody(req)) {
    respond();
    return;
  }
  // A finished akkor is jelez, ha a kliens közben megszakítja a kérést
  finished(req, respond);
  req.resume();
};
