// Az eredeti kép védett letöltése (terv 5.1, L14). Az eredeti fájlt csak ez az út szolgálja ki – a
// nyilvános /media alatt csak a vízjeles előnézet és a bélyegkép van (terv D10).
// - Letöltheti a tulajdonos (minden állapotban) és a kifizetett (PAID) rendeléssel rendelkező
//   vásárló – a tulajdonos által később elrejtett vagy a letiltott fotósú képet is (szerzői
//   döntés, 2026-10-04, 2026-10-06: a megvásárolt licenc nem vész el; az eredeti fájl az elrejtéskor
//   megmarad). Kivétel a moderátori levétel (L16, szerzői döntés, 2026-10-06): amíg a képet az
//   admin rejti el (pl. jogsértő tartalom), a vásárló sem töltheti le – a visszaállítás után igen.
// - Másnak 403, ha a képet látja (nyilvános, illetve az adminnak), egyébként 404 – a nem látható kép
//   létezését nem áruljuk el (L13). A jogosulatlan kísérlet a naplóba kerül.
// - A fájl útvonala csak az adatbázisban tárolt kulcsból jöhet; a tárhely a kulcs mintáját is
//   ellenőrzi (StorageKeyError).
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { attachmentDisposition, downloadFileName } from '../../lib/download.js';
import { AppError } from '../../lib/errors.js';
import {
  parseStorageKey,
  type StorageService,
  type StoredFile,
} from '../../services/storage/storage.types.js';
import { isTakenDown } from './photos.hiding.js';
import { canView, type PhotoViewer, VISIBILITY_SELECT } from './photos.visibility.js';

/**
 * A letöltendő fájl: a Content-Disposition fejléce (a kép címéből képzett névvel), a típusa, a
 * mérete és a tartalma folyamként. A folyamot a hívónak kell elküldenie vagy lezárnia.
 */
export interface PhotoDownload extends StoredFile {
  contentDisposition: string;
  contentType: string;
}

export interface PhotoDownloads {
  /** Az eredeti fájl megnyitása a jogosult felhasználónak; másnak 403 vagy 404. */
  open(photoId: string, viewer: PhotoViewer): Promise<PhotoDownload>;
}

export interface PhotoDownloadsDependencies {
  prisma: PrismaClient;
  storage: Pick<StorageService, 'openRead'>;
  logger: Logger;
}

const DOWNLOAD_SELECT = {
  ...VISIBILITY_SELECT,
  id: true,
  title: true,
  originalKey: true,
  hiddenBy: true,
} as const satisfies Prisma.PhotoSelect;

const photoNotFound = (): AppError => new AppError(404, 'NOT_FOUND', 'A kép nem található');

export function createPhotoDownloads({
  prisma,
  storage,
  logger,
}: PhotoDownloadsDependencies): PhotoDownloads {
  /** A tulajdonos, vagy van kifizetett rendelése a képre. */
  async function isEntitled(photoId: string, ownerId: string, viewerId: string): Promise<boolean> {
    if (ownerId === viewerId) return true;
    const paid = await prisma.order.findFirst({
      where: { buyerId: viewerId, photoId, status: 'PAID' },
      select: { id: true },
    });
    return paid !== null;
  }

  return {
    async open(photoId, viewer) {
      const photo = await prisma.photo.findUnique({
        where: { id: photoId },
        select: DOWNLOAD_SELECT,
      });
      if (!photo) throw photoNotFound();
      if (!(await isEntitled(photo.id, photo.ownerId, viewer.id))) {
        if (!canView(photo, viewer)) throw photoNotFound();
        logger.warn(
          { photoId, actorId: viewer.id, action: 'download' },
          'Jogosulatlan kísérlet egy eredeti kép letöltésére',
        );
        throw new AppError(
          403,
          'FORBIDDEN',
          'Az eredeti képet csak a tulajdonosa és a vásárlói tölthetik le',
        );
      }
      // A moderátori levétel a terjesztést is megállítja: a vásárlónak sem (a tulajdonosnak igen) –
      // akkor sem, ha a tulajdonos is elrejtette a képet
      if (isTakenDown(photo.hiddenBy) && photo.ownerId !== viewer.id) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'A képet a moderátor eltávolította – jelenleg nem tölthető le',
        );
      }
      // A fejléc a fájl megnyitása ELŐTT készül: ha ez hibát dobna, nem maradhat nyitott fájl
      const { extension, contentType } = parseStorageKey(photo.originalKey);
      const fileName = downloadFileName(photo.title, `photochain-${photo.id}`, extension);
      const contentDisposition = attachmentDisposition(fileName);
      const file = await storage.openRead(photo.originalKey);
      return { ...file, contentDisposition, contentType };
    },
  };
}
