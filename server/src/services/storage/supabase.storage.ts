// Supabase Storage tárhely élesben (terv D11, L32). Két privát bucket: az eredeti képeké
// (originals) és a nyilvános előnézeteké (previews – az előnézetek és a bélyegképek). A böngésző a
// képeket nem közvetlenül a Supabase-ről kapja, hanem a szerver /media útvonalán: így a kliens és a
// CSP változatlan, és az elrejtett kép azonnal elérhetetlen (az ingyenes Supabase-CDN egy óráig
// tárolná, és nem üríthető). A titkos kulcs minden jogosultsági szabályt megkerül – csak itt, a
// szerveren használjuk.
// Forrás: Supabase JavaScript Reference – Storage (upload, download, remove, getBucket),
// https://supabase.com/docs/reference/javascript/storage-from-upload; Supabase – Understanding API
// keys (titkos kulcs csak a szerveren), https://supabase.com/docs/guides/api/api-keys; Supabase –
// Smart CDN (az ingyenes csomag gyorsítótára), https://supabase.com/docs/guides/storage/cdn/smart-cdn;
// MDN – AbortSignal.timeout() (a műveletek időkorlátja),
// https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static (adaptálva)
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

import { createClient } from '@supabase/supabase-js';

import {
  parseStorageKey,
  publicMediaUrl,
  StorageNotFoundError,
  type StorageService,
} from './storage.types.js';

export interface SupabaseStorageOptions {
  /** A projekt címe (https://<projekt>.supabase.co) */
  url: string;
  /** A szerver titkos kulcsa (sb_secret_…) */
  secretKey: string;
  originalsBucket: string;
  previewsBucket: string;
  /**
   * A tárhely ennyi idő alatt válaszoljon (L10); az egészben beolvasott fájlra (read) a teljes
   * tartalomra is ennyi
   */
  timeoutMs: number;
  /** A tesztekben a hamis Storage API */
  fetch?: typeof fetch;
}

export interface SupabaseStorage extends StorageService {
  /** Induláskor: mindkét bucket létezik és privát – különben a szerver el sem indul. */
  checkBuckets(): Promise<void>;
}

/** A tárhely nem érhető el, nem válaszolt időben, vagy elutasította a műveletet. */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

/** A storage-js hibájának mezői (StorageApiError: HTTP-állapot és a válasz statusCode-ja). */
interface StorageFailure {
  status?: number;
  statusCode?: string;
}

/** A hiányzó fájlra a Storage API 404-et, vagy 400-at „404” statusCode-dal ad. */
const isNotFound = (error: StorageFailure): boolean =>
  error.status === 404 || error.statusCode === '404';

/** A méret fejléce: nemnegatív egész szám (más alakúnál a fájlt egészben olvassuk be) */
const CONTENT_LENGTH = /^\d+$/;

/**
 * Időkorlát a válasz fejlécéig (L10, L32): a tárhely ennyi idő alatt válaszoljon. A válasz tartalma
 * ezután már nem szakad meg – egy lassan olvasó kliensnek továbbított kép sem. Az egészben beolvasott
 * fájlra (read) a teljes tartalomra vonatkozó korlát külön jár. A hívó saját jelzését is megtartja.
 */
function withResponseTimeout(baseFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException('A tárhely nem válaszolt időben', 'TimeoutError'));
    }, timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    try {
      return await baseFetch(input, { ...init, signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** A sikertelen válasz HTTP-állapota és a Storage API saját statusCode-ja (ha JSON-t adott). */
async function failureOf(response: Response): Promise<StorageFailure> {
  const body: unknown = await response.json().catch(() => undefined);
  const statusCode =
    typeof body === 'object' && body !== null && 'statusCode' in body
      ? String(body.statusCode)
      : undefined;
  return { status: response.status, ...(statusCode === undefined ? {} : { statusCode }) };
}

export function createSupabaseStorage({
  url,
  secretKey,
  originalsBucket,
  previewsBucket,
  timeoutMs,
  fetch: baseFetch = globalThis.fetch,
}: SupabaseStorageOptions): SupabaseStorage {
  const timedFetch = withResponseTimeout(baseFetch, timeoutMs);
  const client = createClient(url, secretKey, {
    // Felhasználói munkamenet nincs: a szerver a saját kulcsával éri el a tárhelyet
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });

  /** A kulcs bucketje és típusa; érvénytelen kulcsra (kérés előtt) StorageKeyError. */
  const target = (key: string) => {
    const { folder, contentType } = parseStorageKey(key);
    const bucket = folder === 'originals' ? originalsBucket : previewsBucket;
    return { bucket, files: client.storage.from(bucket), contentType };
  };

  const failure = (operation: string, error: StorageFailure): Error =>
    isNotFound(error)
      ? new StorageNotFoundError()
      : new StorageUnavailableError(
          `A tárhely-művelet sikertelen (${operation}${error.status ? `, HTTP ${error.status}` : ''})`,
          { cause: error },
        );

  /** A váratlan hiba (pl. a törzs olvasása közbeni időtúllépés) is a tárhely hibája. */
  const guard = async <T>(operation: string, task: () => Promise<T>): Promise<T> => {
    try {
      return await task();
    } catch (error) {
      if (error instanceof StorageNotFoundError || error instanceof StorageUnavailableError) {
        throw error;
      }
      throw new StorageUnavailableError(`A tárhely nem érhető el (${operation})`, { cause: error });
    }
  };

  return {
    async save(key, data) {
      const { files, contentType } = target(key);
      await guard('mentés', async () => {
        // upsert: false – meglévő fájlt semmi nem írhat felül (mint a helyi tárhelyen)
        const { error } = await files.upload(key, data, { contentType, upsert: false });
        if (error) throw failure('mentés', error);
      });
    },

    async read(key) {
      const { files } = target(key);
      return guard('olvasás', async () => {
        // A teljes tartalomra is időkorlát: egy elakadt letöltés ne tartsa fel a képfeldolgozást
        const { data, error } = await files.download(key, undefined, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (error) throw failure('olvasás', error);
        return Buffer.from(await data.arrayBuffer());
      });
    },

    async openRead(key) {
      // Folyamként, a Storage REST API-ján át (a storage-js a letöltést egészben adná vissza): a nagy
      // fájl sem kerül egészben a memóriába, a mérete a válasz fejlécéből jön (L32 átnézések). A
      // hitelesítő fejlécek ugyanazok, mint a supabase-js alapbeállításáé.
      const { bucket } = target(key);
      const response = await guard('olvasás', async () =>
        timedFetch(`${url}/storage/v1/object/${bucket}/${key}`, {
          headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
        }),
      );
      if (!response.ok) throw failure('olvasás', await failureOf(response));
      const length = response.headers.get('content-length');
      if (response.body && length !== null && CONTENT_LENGTH.test(length)) {
        const body = response.body as WebReadableStream<Uint8Array>;
        return { size: Number(length), stream: Readable.fromWeb(body) };
      }
      // Méret nélküli (darabolt) válasznál egészben olvassuk be – így a mérete is ismert
      const data = await guard('olvasás', async () => Buffer.from(await response.arrayBuffer()));
      return { size: data.length, stream: Readable.from(data) };
    },

    async delete(key) {
      const { files } = target(key);
      await guard('törlés', async () => {
        // A nem létező fájl törlése nem hiba: a Storage API ilyenkor üres listát ad
        const { error } = await files.remove([key]);
        if (error) throw failure('törlés', error);
      });
    },

    publicUrl: publicMediaUrl,

    async checkBuckets() {
      for (const name of [originalsBucket, previewsBucket]) {
        const { data, error } = await guard('bucket', async () => client.storage.getBucket(name));
        if (error) {
          // A valódi ok is látsszon (pl. hibás kulcsnál 401) – L32 kódátnézés
          const { status } = error as StorageFailure;
          throw new StorageUnavailableError(
            `A(z) „${name}” bucket nem érhető el${status ? ` (HTTP ${status})` : ''}`,
            { cause: error },
          );
        }
        if (data.public) {
          throw new StorageUnavailableError(
            `A(z) „${name}” bucket nyilvános – privátnak kell lennie (a képeket a szerver adja tovább)`,
          );
        }
      }
    },
  };
}
