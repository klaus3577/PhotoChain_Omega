// A kliens egyetlen HTTP-belépési pontja (L18): minden API-hívás ezen megy át. Az API a felülettel
// azonos originen érhető el (fejlesztéskor a Vite proxyja, később az Express szolgálja ki – L31), ezért
// a kérés relatív (/api/...), és a munkamenet-süti azonos eredetű kérésként (credentials:
// 'same-origin') megy. A szerver válaszborítéka: siker esetén { data }, hibánál { error: { code,
// message, details? } } (server/src/lib/errors.ts) – a hibából mindig ApiError lesz, így a felület
// egyetlen formában kapja meg a szerver magyar üzenetét.
// Forrás: MDN – Using the Fetch API, https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch;
// MDN – Retry-After, https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After (adaptálva)

/** Az API címeinek közös előtagja (relatív: a felülettel azonos originen) */
export const API_PREFIX = '/api';

export const NETWORK_ERROR_MESSAGE =
  'A szerver nem érhető el. Ellenőrizd a kapcsolatot, és próbáld újra.';

/** Átjáróhibák (Bad Gateway, Service Unavailable, Gateway Timeout) */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestBase {
  /** Megszakító jelzés – a TanStack Query ezzel mondja le a már nem szükséges kérést */
  signal?: AbortSignal;
}

/**
 * A kérés beállításai. A GET (alapértelmezés) törzs nélküli – a fetch futás közben elutasítaná, és a
 * programhiba hálózati hibának látszana; a többi metódus JSON-ként küldött törzset kaphat.
 */
export type RequestOptions =
  | (RequestBase & { method?: 'GET'; body?: never })
  | (RequestBase & { method: Exclude<HttpMethod, 'GET'>; body?: unknown });

interface ApiErrorExtra {
  details?: unknown;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** Az API hibája: a HTTP-státusz (hálózati hibánál 0), a szerver hibakódja és magyar üzenete. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, code: string, message: string, extra: ApiErrorExtra = {}) {
    super(message, extra.cause === undefined ? undefined : { cause: extra.cause });
    this.status = status;
    this.code = code;
    this.details = extra.details;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

interface DataEnvelope {
  data: unknown;
  meta?: unknown;
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isDataEnvelope = (payload: unknown): payload is DataEnvelope =>
  isObject(payload) && 'data' in payload;

const isErrorEnvelope = (payload: unknown): payload is ErrorEnvelope =>
  isObject(payload) &&
  isObject(payload.error) &&
  typeof payload.error.code === 'string' &&
  typeof payload.error.message === 'string';

/** Megszakított kérés hibája (a fetch és az XMLHttpRequest-feltöltés is ezt adja). */
export const isAbortError = (error: unknown): boolean =>
  isObject(error) && (error as { name?: unknown }).name === 'AbortError';

/** A JSON-törzs szövegből, ha a válasz JSON (az XMLHttpRequest-feltöltés válaszához). */
export function parseJsonText(contentType: string | null, text: string): unknown {
  if (!contentType?.includes('application/json')) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** A JSON-törzs, ha a válasz JSON (a proxy vagy egy hibaoldal HTML-je nem az). */
async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get('Content-Type')?.includes('application/json')) return undefined;
  try {
    return await response.json();
  } catch (error) {
    // A törzs olvasása közben megszakított kérés megszakítás marad, nem „váratlan válasz”
    if (isAbortError(error)) throw error;
    return undefined;
  }
}

/** Váratlan (nem a szerver borítékjában érkező) válasz hibája. */
export function unexpectedResponseError(status: number, retryAfterSeconds?: number): ApiError {
  return new ApiError(
    status,
    'UNEXPECTED_RESPONSE',
    `A szerver váratlan választ adott (HTTP ${status}).`,
    { retryAfterSeconds },
  );
}

/** A Retry-After fejléc értéke másodpercben (a szerver ezt a formát küldi). */
export function retryAfterSecondsOf(value: string | null): number | undefined {
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

/**
 * A szerver válaszának értelmezése a státusz és a (JSON) törzs alapján – a fetch-burkoló és az
 * XMLHttpRequest-feltöltés közös szabálya: a sikerborítékból adat lesz, a hibaborítékból ApiError, a
 * boríték nélküli átjáróhibából SERVER_UNAVAILABLE, minden másból UNEXPECTED_RESPONSE.
 */
export function interpretResponse(
  status: number,
  payload: unknown,
  retryAfterSeconds: number | undefined,
): ApiEnvelope {
  const ok = status >= 200 && status < 300;
  if (ok && isDataEnvelope(payload)) return { data: payload.data, meta: payload.meta };
  if (!ok && isErrorEnvelope(payload)) {
    const { code, message, details } = payload.error;
    throw new ApiError(status, code, message, { details, retryAfterSeconds });
  }
  // A boríték nélküli 502/503/504 a proxytól (vagy átjárótól) jön: az API nem fut vagy nem válaszol
  if (GATEWAY_STATUSES.has(status)) {
    throw new ApiError(
      status,
      'SERVER_UNAVAILABLE',
      `A szerver most nem érhető el (HTTP ${status}). Próbáld újra később.`,
      { retryAfterSeconds },
    );
  }
  throw unexpectedResponseError(status, retryAfterSeconds);
}

/**
 * Egy dinamikus útvonal-szakasz (pl. a kép azonosítója) kódolva: a perjel, a kérdőjel és a
 * kettőskereszt sem törhet ki belőle. A „.” és a „..” szakaszt a böngésző feloldaná (a
 * /api/photos/.. a /api/ címre mutatna), ezért ezeket – és az üreset – elutasítja.
 */
export function pathSegment(value: string): string {
  if (value === '' || value === '.' || value === '..') {
    throw new RangeError(`Érvénytelen útvonal-szakasz: „${value}”`);
  }
  return encodeURIComponent(value);
}

/** A sikeres válasz teljes borítéka: az adat és a lista lapozási adatai (meta), ha vannak. */
export interface ApiEnvelope {
  data: unknown;
  meta: unknown;
}

/**
 * Kérés az API-hoz. A path az /api utáni rész („/photos?page=2”). Siker esetén a válasz data mezőjét adja
 * (törzs nélküli 204-nél undefined – az ilyen végpontot apiRequest<void> formában hívjuk), minden más
 * esetben ApiError-t dob – kivéve a megszakítást, amelyet változatlanul továbbad. A T típus a hívó
 * ígérete: a külső adatot a végponthoz tartozó *.api.ts ellenőrzi (pl. fetchSessionUser).
 */
export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await apiRequestEnvelope(path, options)).data as T;
}

/**
 * Mint az apiRequest, de a teljes sikerborítékot adja – a lapozott listákhoz, amelyeknél a lapozás
 * adatai (meta) a data mellett érkeznek. A hiányzó rész (204-nél mindkettő) undefined.
 */
export async function apiRequestEnvelope(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<ApiEnvelope> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE, { cause: error });
  }

  if (response.status === 204) return { data: undefined, meta: undefined };

  const payload = await readJson(response);
  return interpretResponse(
    response.status,
    payload,
    retryAfterSecondsOf(response.headers.get('Retry-After')),
  );
}
