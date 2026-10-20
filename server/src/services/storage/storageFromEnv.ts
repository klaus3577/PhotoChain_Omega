// A tárhely kiválasztása a konfigurációból (terv D11, L32): fejlesztéskor a helyi lemez – a nyilvános
// mappát az Express szolgálja ki –, élesben a Supabase Storage két privát bucketje, amelynek
// nyilvános képeit a szerver a /media útvonalon adja tovább (middleware/mediaProxy.ts).
import type { Env } from '../../config/env.js';
import { createLocalStorage, localPublicDirectory } from './local.storage.js';
import type { StorageService } from './storage.types.js';
import { createSupabaseStorage } from './supabase.storage.js';

export interface SelectedStorage {
  storage: StorageService;
  /** Helyi tárhelynél a nyilvánosan kiszolgált mappa; távoli tárhelynél nincs */
  publicUploadsDirectory?: string;
  /** A naplóba: melyik tárhely működik */
  description: string;
  /** Induláskor: a tárhely használható-e (Supabase: mindkét bucket létezik és privát) */
  checkReady(): Promise<void>;
}

type StorageEnv = Pick<
  Env,
  | 'STORAGE_DRIVER'
  | 'UPLOAD_DIR'
  | 'SUPABASE_URL'
  | 'SUPABASE_SECRET_KEY'
  | 'SUPABASE_ORIGINALS_BUCKET'
  | 'SUPABASE_PREVIEWS_BUCKET'
  | 'STORAGE_TIMEOUT_MS'
>;

export function createStorageFromEnv(env: StorageEnv): SelectedStorage {
  if (env.STORAGE_DRIVER === 'supabase') {
    // A konfiguráció ellenőrzése (env.ts) ezt már kizárja – a típus kedvéért és védekezésül
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
      throw new Error('A Supabase tárhelyhez a SUPABASE_URL és a SUPABASE_SECRET_KEY is kell');
    }
    const storage = createSupabaseStorage({
      url: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
      originalsBucket: env.SUPABASE_ORIGINALS_BUCKET,
      previewsBucket: env.SUPABASE_PREVIEWS_BUCKET,
      timeoutMs: env.STORAGE_TIMEOUT_MS,
    });
    return {
      storage,
      description: `Supabase Storage (${env.SUPABASE_ORIGINALS_BUCKET}, ${env.SUPABASE_PREVIEWS_BUCKET})`,
      checkReady: async () => storage.checkBuckets(),
    };
  }
  return {
    storage: createLocalStorage(env.UPLOAD_DIR),
    publicUploadsDirectory: localPublicDirectory(env.UPLOAD_DIR),
    description: 'helyi lemez',
    checkReady: async () => undefined,
  };
}
