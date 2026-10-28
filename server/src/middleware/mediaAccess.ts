// A nyilvános képek (vízjeles előnézet, bélyegkép) kiszolgálása ELŐTT a kép láthatóságának
// ellenőrzése az adatbázisból (témavezetői észrevétel, 2026-10-27). A fájl léte önmagában nem elég: a
// tiltás nem törli a fájlokat (a feloldás után vissza kell jönniük), így a letiltott fotós egyszer
// megismert előnézet-URL-jei eddig a tiltás alatt is működtek – új kérésre is, nem csak a böngésző
// gyorsítótárából –, és a még nem regisztrált kép előnézete is bárkinek elérhető volt. Most ugyanaz a
// szabály érvényes, mint az adatlapon (photos.visibility.ts): a nyilvános képet bárki, a többit csak
// a kezelője (tulajdonos, admin) kapja meg – a munkamenet-sütit a böngésző a saját oldal képkéréséhez
// is csatolja; a letiltott tulajdonos névtelen néző –, a rejtett kép fájlját pedig senki. Másnak
// 404, ugyanaz, mint a nem létező vagy hiányzó fájlú képre, így a kép létezése sem derül ki.
// - A fájl nevét a feltöltés a kép azonosítójából képzi (photos.service.ts), ezért a kép az elsődleges
//   kulcsán kereshető; a kért kulcsnak a kép saját kulcsai közt kell lennie – egy más néven maradt
//   (árva) fájl sem adható ki.
// - Csak a két nyilvános mappa és a tárhely saját kulcsmintája (UUID-fájlnév, jpg/png/webp) jut el az
//   adatbázisig; minden más útvonal (az eredeti képé, mappalista, a mappából kivezető út) azonnal 404.
// - A munkamenetet csak a nem nyilvános képnél töltjük be (egy további lekérdezés), a nyilvános képhez
//   nem kell. A nem nyilvános kép válasza a munkamenettől függ, ezért nem kerülhet gyorsítótárba
//   (no-store) – mint ahogy a 404 sem, hogy a feloldás vagy a regisztráció után ne maradjon „hiányzó”.
// - Minden kérés egy adatbázis-lekérdezés (és távoli tárhelynél egy tárhely-letöltés), ezért az
//   útvonal IP-címenként korlátozott (app.ts, MEDIA_RATE_LIMIT_MAX).
// Forrás: Express 5 API – req.path, res.set, https://expressjs.com/en/5x/api.html (adaptálva)
import type { Request, RequestHandler, Response } from 'express';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import {
  canManage,
  isPublic,
  type PhotoViewer,
  VISIBILITY_SELECT,
} from '../modules/photos/photos.visibility.js';
import { parseStorageKey, StorageKeyError } from '../services/storage/storage.types.js';

export interface MediaAccessDependencies {
  prisma: PrismaClient;
  /** A bejelentkezett, nem letiltott felhasználó (vagy null) – csak a nem nyilvános képnél kérdezzük */
  sessionViewer: (req: Request) => Promise<PhotoViewer | null>;
}

/** A kért nyilvános fájl: a tárhelykulcsa és a kép azonosítója (a fájl neve a kiterjesztés nélkül). */
export interface PublicMediaTarget {
  key: string;
  photoId: string;
}

/** A nyilvános mappák – az eredeti képek (originals) nem */
const PUBLIC_FOLDERS = new Set<string>(['previews', 'thumbnails']);

/** A munkamenettől függő válasz (nem nyilvános kép, 404) egyik gyorsítótárban sem maradhat meg */
export const NON_PUBLIC_CACHE_CONTROL = 'no-store';

/** A láthatóság eldöntéséhez és a kulcs ellenőrzéséhez szükséges mezők. */
const MEDIA_ACCESS_SELECT = {
  ...VISIBILITY_SELECT,
  previewKey: true,
  thumbnailKey: true,
} as const satisfies Prisma.PhotoSelect;

/** Ugyanaz a válasz, mint a nem létező képre: a nem látható kép létezését nem áruljuk el. */
const mediaNotFound = (): AppError => new AppError(404, 'NOT_FOUND', 'A kép nem található');

/**
 * Az útvonal (a /media előtag után, nyers alakban) mint nyilvános fájl: csak a pontosan
 * `/<previews|thumbnails>/<UUID>.<jpg|png|webp>` alakú útvonal felel meg; minden másra null.
 */
export function parsePublicMediaPath(path: string): PublicMediaTarget | null {
  if (!path.startsWith('/')) return null;
  const key = path.slice(1);
  try {
    const { folder, fileName, extension } = parseStorageKey(key);
    if (!PUBLIC_FOLDERS.has(folder)) return null;
    return { key, photoId: fileName.slice(0, -(extension.length + 1)) };
  } catch (error) {
    if (error instanceof StorageKeyError) return null;
    throw error;
  }
}

/** A nem nyilvános válasz (a kép nem adható ki, vagy csak a kezelőjének) nem kerülhet gyorsítótárba. */
function markNonPublic(res: Response): void {
  res.set('Cache-Control', NON_PUBLIC_CACHE_CONTROL);
}

/**
 * A /media lánc vége: ha a látható kép fájlja mégsem található a tárhelyen (pl. egy visszaállítás
 * közben), ugyanaz a válasz, mint a nem látható vagy nem létező képre – a /media minden 404-e
 * egyforma, és egyik sem kerül gyorsítótárba.
 */
export const mediaFileMissing: RequestHandler = (_req, res, next) => {
  markNonPublic(res);
  next(mediaNotFound());
};

/**
 * A /media útvonal őre: a kérés csak akkor jut tovább a fájl kiszolgálásához (express.static,
 * illetve a tárhely továbbítása), ha a kért fájl egy olyan kép saját előnézete vagy bélyegképe,
 * amelyet a kérő láthat.
 */
export function createMediaAccess({
  prisma,
  sessionViewer,
}: MediaAccessDependencies): RequestHandler {
  return async (req, res, next) => {
    const deny = (): void => {
      markNonPublic(res);
      next(mediaNotFound());
    };
    // Csak olvasni lehet; más metódus és szabálytalan útvonal az adatbázist sem éri el
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      deny();
      return;
    }
    const target = parsePublicMediaPath(req.path);
    if (!target) {
      deny();
      return;
    }
    const photo = await prisma.photo.findUnique({
      where: { id: target.photoId },
      select: MEDIA_ACCESS_SELECT,
    });
    if (!photo || (photo.previewKey !== target.key && photo.thumbnailKey !== target.key)) {
      deny();
      return;
    }
    // A rejtett kép nyilvános fájljai senkinek nem járnak: az elrejtés törli őket, a visszaállítás
    // újra elkészíti (photos.catalog.ts, photos.restore.ts) – a kezelője az adatlapon sem kap URL-t
    if (photo.status === 'HIDDEN') {
      deny();
      return;
    }
    // A nyilvános képhez munkamenet sem kell; a nem nyilvánosat csak a kezelője kapja meg
    if (isPublic(photo)) {
      next();
      return;
    }
    if (!canManage(photo, await sessionViewer(req))) {
      deny();
      return;
    }
    markNonPublic(res);
    next();
  };
}
