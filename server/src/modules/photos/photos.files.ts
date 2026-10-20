// A kép nyilvános fájljai (vízjeles előnézet, bélyegkép): az elrejtés törli (photos.catalog.ts), a
// visszaállítás – sikertelen kísérlet után – szintén (photos.restore.ts). Az eredeti fájl privát, ide
// nem tartozik.
import type { StorageService } from '../../services/storage/storage.types.js';

/** A kép nyilvános fájljainak tárhelykulcsa. */
export interface PublicFileKeys {
  previewKey: string;
  thumbnailKey: string;
}

/** A nyilvános fájlok kulcsai (a naplóhoz is). */
export const publicKeysOf = (photo: PublicFileKeys): string[] => [
  photo.previewKey,
  photo.thumbnailKey,
];

/**
 * A nyilvános fájlok törlése; a sikertelen törlések okait adja vissza (üres lista: minden törlődött).
 * A nem létező fájl nem hiba.
 */
export async function deletePublicFiles(
  storage: Pick<StorageService, 'delete'>,
  photo: PublicFileKeys,
): Promise<string[]> {
  // Az async burok miatt a szinkron dobott hiba is elutasított ígéret lesz
  const results = await Promise.allSettled(
    publicKeysOf(photo).map(async (key) => storage.delete(key)),
  );
  return results.flatMap((result) => (result.status === 'rejected' ? [String(result.reason)] : []));
}
