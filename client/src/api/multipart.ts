// Többrészes (multipart/form-data) űrlap küldése XMLHttpRequest-tel – a képfeltöltés (L21) és a
// hitelesség-ellenőrzés (L24) közös útja: a fetch nem ad feltöltési haladást (a terv L21 pontja). A kérés
// ugyanúgy azonos originű (a süti megy, a Sec-Fetch-Site a böngészőé), a válasz ugyanabban a borítékban
// jön, és ugyanazzá a hibává lesz (interpretResponse), mint a fetch-burkolónál; a megszakítás a fetch-éhez
// hasonló AbortError. Az onSent akkor szól, amikor a törzs hiánytalanul elment: onnantól a szerver
// dolgozik, a megszakítás a feldolgozást már nem állítaná meg.
// Forrás: MDN – XMLHttpRequestUpload: progress event,
// https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestUpload/progress_event;
// MDN – XMLHttpRequestUpload: load event; MDN – FormData,
// https://developer.mozilla.org/en-US/docs/Web/API/FormData (adaptálva)
import {
  API_PREFIX,
  ApiError,
  interpretResponse,
  NETWORK_ERROR_MESSAGE,
  parseJsonText,
  retryAfterSecondsOf,
  unexpectedResponseError,
} from './http';

/** A képfájl mezőneve az űrlapban (server/src/middleware/upload.ts) */
export const IMAGE_FIELD_NAME = 'image';

/** A küldés haladása bájtban */
export interface TransferProgress {
  loaded: number;
  total: number;
}

/** A haladás egész százalékban; az első esemény előtt (vagy ismeretlen méretnél) null. */
export const percentOf = (progress: TransferProgress | null): number | null =>
  progress === null || progress.total === 0
    ? null
    : Math.round((progress.loaded / progress.total) * 100);

export interface MultipartOptions {
  onProgress?: (progress: TransferProgress) => void;
  /** A törzs hiánytalanul elment: a szerver feldolgozza */
  onSent?: () => void;
  signal?: AbortSignal;
}

const abortError = (): DOMException => new DOMException('A kérés megszakítva', 'AbortError');

/**
 * Az űrlap elküldése (POST) az API megadott útvonalára (az /api utáni rész, pl. „/photos”). A haladást
 * (bájtban) az onProgress kapja, a signal megszakítja. A siker adatát az isData ellenőrzi – a szerver adata
 * külső adat –, minden más eset ApiError; a megszakítás AbortError.
 */
export function postMultipart<T>(
  path: string,
  form: FormData,
  isData: (value: unknown) => value is T,
  { onProgress, onSent, signal }: MultipartOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const settle = (finish: () => void) => {
      signal?.removeEventListener('abort', abort);
      finish();
    };

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.({ loaded: event.loaded, total: event.total });
    });
    xhr.upload.addEventListener('load', () => onSent?.());
    xhr.addEventListener('load', () =>
      settle(() => {
        try {
          const payload = parseJsonText(xhr.getResponseHeader('Content-Type'), xhr.responseText);
          const retryAfter = retryAfterSecondsOf(xhr.getResponseHeader('Retry-After'));
          const { data } = interpretResponse(xhr.status, payload, retryAfter);
          if (!isData(data)) throw unexpectedResponseError(xhr.status);
          resolve(data);
        } catch (error) {
          reject(error as Error);
        }
      }),
    );
    xhr.addEventListener('error', () =>
      settle(() => reject(new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE))),
    );
    xhr.addEventListener('abort', () => settle(() => reject(abortError())));

    xhr.open('POST', `${API_PREFIX}${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send(form);
  });
}
