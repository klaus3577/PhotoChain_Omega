// Tárhely-absztrakció (terv D11): az alkalmazás csak ezt az interfészt ismeri, így a helyi lemez
// (fejlesztés) később felhőtárhelyre (Supabase Storage, L32) cserélhető a többi kód módosítása nélkül.
import type { Readable } from 'node:stream';

/** Olvasásra megnyitott fájl: a tartalma folyamként (stream) és a mérete bájtban. */
export interface StoredFile {
  stream: Readable;
  size: number;
}

export interface StorageService {
  /** Új fájl mentése; meglévő kulcsot nem ír felül. */
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  /**
   * Megnyitás folyamként (a letöltéshez – a fájl nem kerül egészben a memóriába). A hiányzó fájl
   * már itt hibát ad, a válasz fejléceinek elküldése előtt.
   */
  openRead(key: string): Promise<StoredFile>;
  /** Törlés; a nem létező fájl nem hiba. */
  delete(key: string): Promise<void>;
  /** Az előnézet vagy a bélyegkép nyilvános URL-je (az eredetinek nincs ilyen). */
  publicUrl(key: string): string;
}

/** A kulcs nem a tárhely saját mintáját követi (pl. a mappából kivezető útvonal). */
export class StorageKeyError extends Error {
  constructor(message = 'Érvénytelen tárhelykulcs') {
    super(message);
    this.name = 'StorageKeyError';
  }
}

/** A kért fájl nincs a tárhelyen (pl. az elrejtett kép törölt előnézete). */
export class StorageNotFoundError extends Error {
  constructor() {
    super('A fájl nem található a tárhelyen');
    this.name = 'StorageNotFoundError';
  }
}

const STORAGE_FOLDERS = ['originals', 'previews', 'thumbnails'] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

/** A nyilvános fájlok URL-előtagja (terv L18: a kliens fejlesztői proxyja a /media utat továbbítja) */
export const PUBLIC_URL_PREFIX = '/media';

/** A tárolt képek kiterjesztései és tartalomtípusai (a feltöltés csak ezt a hármat fogadja el). */
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
export type FileExtension = keyof typeof CONTENT_TYPES;
const FILE_EXTENSIONS = Object.keys(CONTENT_TYPES) as FileExtension[];

// <mappa>/<UUID>.<kiterjesztés> – a kulcsot mindig a szerver állítja elő, felhasználói adat nincs benne
const STORAGE_KEY_PATTERN =
  /^([a-z]+)\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp))$/;

export interface StorageKeyParts {
  folder: StorageFolder;
  fileName: string;
  extension: FileExtension;
  /** A fájl tartalomtípusa (Content-Type) a kiterjesztés szerint */
  contentType: string;
}

/** A kulcs felbontása mappára, fájlnévre és típusra; más alakú kulcsra StorageKeyError-t dob. */
export function parseStorageKey(key: string): StorageKeyParts {
  const [, folderName, fileName, extensionName] = STORAGE_KEY_PATTERN.exec(key) ?? [];
  const folder = STORAGE_FOLDERS.find((known) => known === folderName);
  const extension = FILE_EXTENSIONS.find((known) => known === extensionName);
  if (!folder || !fileName || !extension) throw new StorageKeyError();
  return { folder, fileName, extension, contentType: CONTENT_TYPES[extension] };
}

/**
 * Az előnézet vagy a bélyegkép nyilvános URL-je a szerver /media útvonalán – minden tárhelynél
 * ugyanaz (a Supabase Storage fájljait is a szerver adja tovább, L32). Az eredeti képnek nincs.
 */
export function publicMediaUrl(key: string): string {
  const { folder, fileName } = parseStorageKey(key);
  if (folder === 'originals') throw new StorageKeyError('Az eredeti képnek nincs nyilvános URL-je');
  return `${PUBLIC_URL_PREFIX}/${folder}/${fileName}`;
}
