// Az admin képkezelése (terv 5.1, L16): a képek listája minden állapotban (állapot szerint
// szűrhető), az elrejtés és a visszaállítás, valamint a sikertelen lánc-regisztráció újrapróbálása.
// - Az elrejtés ugyanaz, mint a tulajdonosé (photos.catalog.ts: a nyilvános fájlok törlődnek, a
//   nyitott fizetések lezárulnak), de az adminé visszaállítható (photos.restore.ts).
// - Az újrapróbálás tranzakciót küld, gázdíjba kerül: csak a CHAIN_FAILED (vagy futó feladat nélkül
//   beragadt PENDING_CHAIN) kép próbálható újra (photos.registration.ts), és adminonként korlátozott
//   (admin.routes.ts). A regisztráció a háttérben fut; az újrapróbálás ténye a naplóba kerül.
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { type PageMeta, pageMeta } from '../../lib/schemas.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import type { PhotoCatalog } from '../photos/photos.catalog.js';
import type { PhotoRegistration } from '../photos/photos.registration.js';
import type { PhotoRestore } from '../photos/photos.restore.js';
import type { PhotoViewer } from '../photos/photos.visibility.js';
import { ADMIN_PHOTO_SELECT, type AdminPhotoDto, toAdminPhotoDto } from './admin.dto.js';
import type { ListAdminPhotosQuery } from './admin.schemas.js';

export interface AdminPhotoPage {
  photos: AdminPhotoDto[];
  meta: PageMeta;
}

export interface AdminPhotos {
  /** A képek minden állapotban (a letiltott fotósoké is), a legújabb elöl. */
  list(query: ListAdminPhotosQuery): Promise<AdminPhotoPage>;
  /** Elrejtés vagy visszaállítás; a kép friss adataival tér vissza. */
  setHidden(id: string, actor: PhotoViewer, hidden: boolean): Promise<AdminPhotoDto>;
  /** A sikertelen lánc-regisztráció újraindítása (a háttérben fut). */
  retryRegistration(id: string, actor: PhotoViewer): Promise<void>;
}

export interface AdminPhotosDependencies {
  prisma: PrismaClient;
  storage: Pick<StorageService, 'publicUrl'>;
  logger: Logger;
  catalog: Pick<PhotoCatalog, 'hide'>;
  restore: PhotoRestore;
  registration: Pick<PhotoRegistration, 'retryRegistration'>;
}

/** A legújabb elöl; azonos időpontnál az azonosító dönt, így a lapozás stabil. */
const PHOTO_ORDER: Prisma.PhotoOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

export function createAdminPhotos({
  prisma,
  storage,
  logger,
  catalog,
  restore,
  registration,
}: AdminPhotosDependencies): AdminPhotos {
  return {
    async list({ status, page, pageSize }) {
      const where = { status };
      // A darabszám és az oldal ugyanabból a pillanatképből (mint a galériánál, L13)
      const [total, photos] = await prisma.$transaction(
        [
          prisma.photo.count({ where }),
          prisma.photo.findMany({
            where,
            orderBy: PHOTO_ORDER,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: ADMIN_PHOTO_SELECT,
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      return {
        photos: photos.map((photo) => toAdminPhotoDto(photo, storage)),
        meta: pageMeta({ page, pageSize }, total),
      };
    },

    async setHidden(id, actor, hidden) {
      if (hidden) await catalog.hide(id, actor);
      else await restore.restore(id, actor);
      const photo = await prisma.photo.findUniqueOrThrow({
        where: { id },
        select: ADMIN_PHOTO_SELECT,
      });
      return toAdminPhotoDto(photo, storage);
    },

    async retryRegistration(id, actor) {
      await registration.retryRegistration(id);
      logger.info(
        { photoId: id, actorId: actor.id, action: 'retry-registration' },
        'A lánc-regisztráció újrapróbálása elindítva',
      );
    },
  };
}
