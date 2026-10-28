// A nyilvános képek (vízjeles előnézet, bélyegkép) kiszolgálása távoli tárhelyről (L32): a Supabase
// Storage privát bucketjéből a szerver adja tovább őket ugyanazon a /media útvonalon, mint a helyi
// tárhelynél az express.static. Így a kliens képcím-ellenőrzése és a CSP változatlan, az elrejtett
// kép (törölt előnézet) pedig azonnal 404 – nincs külső gyorsítótár, amely tovább adná.
// - Csak a previews és a thumbnails mappa érhető el; az eredeti kép soha (a tárhelyhez sem fordul).
// - A kulcsot a tárhely saját mintája ellenőrzi (UUID-fájlnév, jpg/png/webp): más útvonal 404.
// - A kép láthatóságát (állapot, a fotós tiltása) már előtte a mediaAccess.ts ellenőrizte az
//   adatbázisból: ide csak a kérő által látható kép kulcsa jut el.
// - A nyilvános képet a böngésző 5 percig újrakérés nélkül használhatja (az ingyenes tárhely kimenő
//   forgalma véges); köztes (CDN-) gyorsítótár nem tárolhatja (private), így az elrejtett kép valóban
//   eltűnik. A nem nyilvános (csak a kezelőjének járó) kép válasza no-store – azt az őr állítja be.
// - A fájl folyamként megy át (a tárhely sem tölti egészben a memóriába); a sebességkorlát az app.ts-ben.
// Forrás: Express 5 API – req.params, res.set, https://expressjs.com/en/5x/api.html; Node.js –
// stream.pipeline, https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
// (adaptálva)
import { pipeline } from 'node:stream/promises';

import { type RequestHandler, Router } from 'express';

import {
  parseStorageKey,
  StorageKeyError,
  StorageNotFoundError,
  type StorageService,
} from '../services/storage/storage.types.js';

/** Csak a böngésző (köztes gyorsítótár nem) használhatja 5 percig újrakérés nélkül – helyi tárhelynél is */
export const MEDIA_CACHE_CONTROL = 'private, max-age=300';
/** A nyilvános mappák – az eredeti képek (originals) nem */
const PUBLIC_FOLDERS = new Set(['previews', 'thumbnails']);

/** A kulcs tartalomtípusa, vagy undefined, ha a kulcs nem a tárhely mintáját követi. */
function contentTypeOf(key: string): string | undefined {
  try {
    return parseStorageKey(key).contentType;
  } catch (error) {
    if (error instanceof StorageKeyError) return undefined;
    throw error;
  }
}

export function createMediaRouter(storage: Pick<StorageService, 'openRead'>): Router {
  const serveMedia: RequestHandler<{ folder: string; file: string }> = async (req, res, next) => {
    const { folder, file } = req.params;
    const key = `${folder}/${file}`;
    const contentType = PUBLIC_FOLDERS.has(folder) ? contentTypeOf(key) : undefined;
    if (!contentType) {
      next();
      return;
    }
    try {
      const { stream, size } = await storage.openRead(key);
      res.set({ 'Content-Type': contentType, 'Content-Length': String(size) });
      // A nem nyilvános kép válaszát a mediaAccess.ts már no-store-ra állította
      if (!res.get('Cache-Control')) res.set('Cache-Control', MEDIA_CACHE_CONTROL);
      await pipeline(stream, res);
    } catch (error) {
      // A hiányzó fájl (pl. az elrejtett kép törölt előnézete) a központi 404-es választ kapja
      if (error instanceof StorageNotFoundError) {
        next();
        return;
      }
      // Küldés közben (pl. a kliens bontotta a kapcsolatot) már nem lehet hibaválaszt adni
      if (res.headersSent) {
        res.destroy();
        return;
      }
      next(error);
    }
  };

  const router = Router();
  router.get('/:folder/:file', serveMedia);
  return router;
}
