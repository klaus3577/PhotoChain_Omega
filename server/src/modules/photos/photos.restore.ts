// Az elrejtett kép visszaállítása (terv 5.1, L16 – PATCH /api/admin/photos/:id). Csak az admin
// által elrejtett kép állítható vissza: a tulajdonos döntését (a saját elrejtését) az admin nem írja
// felül (szerzői döntés, 2026-10-06). Ha a tulajdonos is elrejtette (OWNER_AND_ADMIN), csak a
// moderátori levétel szűnik meg – a kép rejtett marad (photos.hiding.ts).
// - Az elrejtéskor törölt nyilvános fájlok (vízjeles előnézet, bélyegkép) az eredetiből újra
//   elkészülnek – ugyanazzal az eljárással, mint a feltöltéskor –, MIELŐTT a kép nyilvános lesz. Az
//   eredeti beolvasása és kibontása a közös képfeldolgozási soron fut (L32, services/imageWork.ts): egy
//   nagy kép kibontása több száz MB memória (config/imageMemory.ts); a feltöltés, az ellenőrzés és a
//   visszaállítás együtt legfeljebb IMAGE_PROCESSING_CONCURRENCY képet bont. A mentés már a soron kívül.
// - Az új állapot a lánc szerint: a regisztrált (registeredAt) kép REGISTERED, a regisztráció
//   nélküli CHAIN_FAILED (az admin újrapróbálhatja – minden újrapróbálás gázdíjba kerül, ezért nem
//   indul magától).
// - Az állapot csak feltételesen változik (updateMany): ha a képet közben a tulajdonos elrejtette,
//   vagy a regisztrációja közben lezárult, 409 – és ha a kép még rejtett, a már elkészült nyilvános
//   fájlok törlődnek (a máshol közben visszaállított kép fájljai megmaradnak). Az írás hibájánál is.
// - Ugyanannak a képnek egyszerre csak egy visszaállítása futhat (szerverpéldányon belül). Elfogadott
//   versenyhelyzet: ha egy másik admin ugyanekkor rejti el, a kép nyilvános fájljai hiányozhatnak –
//   egy újabb elrejtés és visszaállítás rendbe teszi.
// Forrás: Prisma ORM v7 – CRUD (updateMany), https://www.prisma.io/docs/orm/v7/prisma-client/queries/crud
// (adaptálva)
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { createPreview, createThumbnail } from '../../services/image.service.js';
import type { ImageWork } from '../../services/imageWork.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import { deletePublicFiles, publicKeysOf } from './photos.files.js';
import { hiddenByAfterLiftingTakedown } from './photos.hiding.js';
import type { PhotoViewer } from './photos.visibility.js';

export interface PhotoRestore {
  /** Az admin által elrejtett kép visszaállítása; a nem rejtett képen nem változtat. */
  restore(id: string, actor: PhotoViewer): Promise<void>;
}

export interface PhotoRestoreDependencies {
  prisma: PrismaClient;
  storage: Pick<StorageService, 'read' | 'save' | 'delete'>;
  logger: Logger;
  /** A közös képfeldolgozási sor (L32): az előnézet és a bélyegkép újrakészítése ezen fut */
  imageWork: ImageWork;
}

const RESTORE_SELECT = {
  id: true,
  status: true,
  hiddenBy: true,
  registeredAt: true,
  originalKey: true,
  previewKey: true,
  thumbnailKey: true,
} as const satisfies Prisma.PhotoSelect;

type RestorablePhoto = Prisma.PhotoGetPayload<{ select: typeof RESTORE_SELECT }>;

const conflict = (message: string): AppError => new AppError(409, 'CONFLICT', message);

export function createPhotoRestore({
  prisma,
  storage,
  logger,
  imageWork,
}: PhotoRestoreDependencies): PhotoRestore {
  /** A folyamatban lévő visszaállítások (képazonosítók) */
  const inProgress = new Set<string>();

  /** A visszaállításkor elkészült nyilvános fájlok törlése; ha nem sikerül, naplózzuk. */
  async function removePublicFiles(photo: RestorablePhoto): Promise<void> {
    const reasons = await deletePublicFiles(storage, photo);
    if (reasons.length > 0) {
      logger.error(
        { photoId: photo.id, keys: publicKeysOf(photo), reasons },
        'A félbemaradt visszaállítás nyilvános fájljait nem sikerült törölni',
      );
    }
  }

  /** A kép egy nyilvános fájljának mentése (egy korábbi, félbemaradt kísérlet fájlja helyett). */
  async function replace(key: string, data: Buffer): Promise<void> {
    await storage.delete(key);
    await storage.save(key, data);
  }

  async function writePublicFiles(photo: RestorablePhoto): Promise<void> {
    // A közös soron csak az eredeti beolvasása és kibontása fut (memóriakeret); a tárhely-mentések már
    // nem foglalják a helyet (L32 kódátnézés)
    const { preview, thumbnail } = await imageWork(async () => {
      const original = await storage.read(photo.originalKey);
      return { preview: await createPreview(original), thumbnail: await createThumbnail(original) };
    });
    await replace(photo.previewKey, preview);
    await replace(photo.thumbnailKey, thumbnail);
  }

  /** Az előnézet és a bélyegkép az eredetiből; hiba esetén 500 (naplózva), fájl nem marad. */
  async function recreatePublicFiles(photo: RestorablePhoto): Promise<void> {
    try {
      await writePublicFiles(photo);
    } catch (error) {
      logger.error(
        { photoId: photo.id, err: error },
        'Az elrejtett kép nyilvános fájljai nem készültek el újra',
      );
      await cleanUpUnlessPublished(photo);
      throw new AppError(500, 'INTERNAL_ERROR', 'A kép visszaállítása nem sikerült – próbáld újra');
    }
  }

  /** Az állapot írása: csak ha a kép még az admin által rejtett, és a regisztrációja sem változott. */
  async function publish(photo: RestorablePhoto): Promise<'REGISTERED' | 'CHAIN_FAILED' | null> {
    const status = photo.registeredAt === null ? 'CHAIN_FAILED' : 'REGISTERED';
    const { count } = await prisma.photo.updateMany({
      where: {
        id: photo.id,
        status: 'HIDDEN',
        hiddenBy: 'ADMIN',
        registeredAt: photo.registeredAt,
      },
      data: { status, hiddenBy: null },
    });
    return count > 0 ? status : null;
  }

  /**
   * A félbemaradt visszaállítás után: a még rejtett kép nyilvános fájljai nem maradhatnak meg. Csak
   * a közben (pl. egy másik szerverpéldányon) már visszaállított kép fájljai maradnak; ha az állapot
   * nem olvasható, a biztonságos irány a törlés.
   */
  async function cleanUpUnlessPublished(photo: RestorablePhoto): Promise<void> {
    const current = await prisma.photo
      .findUnique({ where: { id: photo.id }, select: { status: true } })
      .catch((error: unknown) => {
        logger.error({ photoId: photo.id, err: error }, 'A kép állapota nem olvasható');
        return null;
      });
    if (current === null || current.status === 'HIDDEN') await removePublicFiles(photo);
  }

  /**
   * A tulajdonos is elrejtette a képet: csak a moderátori levétel szűnik meg, a kép a tulajdonos
   * döntése szerint rejtett marad (nyilvános fájl sem készül).
   */
  async function liftTakedownOnly(photo: RestorablePhoto, actor: PhotoViewer): Promise<void> {
    const hiddenBy = hiddenByAfterLiftingTakedown('OWNER_AND_ADMIN');
    const { count } = await prisma.photo.updateMany({
      where: { id: photo.id, status: 'HIDDEN', hiddenBy: 'OWNER_AND_ADMIN' },
      data: { hiddenBy },
    });
    if (count === 0) {
      throw conflict('A kép állapota közben megváltozott – frissítsd, és próbáld újra');
    }
    logger.info(
      { photoId: photo.id, actorId: actor.id, hiddenBy },
      'A moderátori levétel feloldva – a kép a tulajdonos döntése szerint rejtett marad',
    );
  }

  async function restoreHidden(photo: RestorablePhoto, actor: PhotoViewer): Promise<void> {
    await recreatePublicFiles(photo);
    let status: 'REGISTERED' | 'CHAIN_FAILED' | null;
    try {
      status = await publish(photo);
    } catch (error) {
      // Az írás hibája (pl. az adatbázis nem érhető el): a rejtett kép fájljai nem maradhatnak meg –
      // de ha az írás mégis lefutott (csak a válasza veszett el), a már nyilvános képé igen
      await cleanUpUnlessPublished(photo);
      throw error;
    }
    if (status === null) {
      await cleanUpUnlessPublished(photo);
      throw conflict('A kép állapota közben megváltozott – frissítsd, és próbáld újra');
    }
    logger.info({ photoId: photo.id, actorId: actor.id, status }, 'A kép visszaállítva');
  }

  async function restoreOnce(id: string, actor: PhotoViewer): Promise<void> {
    const photo = await prisma.photo.findUnique({ where: { id }, select: RESTORE_SELECT });
    if (!photo) throw new AppError(404, 'NOT_FOUND', 'A kép nem található');
    if (photo.status !== 'HIDDEN') return;
    if (photo.hiddenBy === 'OWNER_AND_ADMIN') {
      await liftTakedownOnly(photo, actor);
      return;
    }
    if (photo.hiddenBy !== 'ADMIN') {
      throw conflict('A képet a tulajdonosa rejtette el – csak ő dönthet róla');
    }
    await restoreHidden(photo, actor);
  }

  return {
    async restore(id, actor) {
      // A foglalás a kép beolvasása ELŐTT: így egy közben lezáruló másik visszaállítás régi
      // pillanatképével sem fut tovább. A kulcs kisbetűs: a UUID nagybetűvel is ugyanaz a kép
      const key = id.toLowerCase();
      if (inProgress.has(key)) throw conflict('A kép visszaállítása már folyamatban van');
      inProgress.add(key);
      try {
        await restoreOnce(id, actor);
      } finally {
        inProgress.delete(key);
      }
    },
  };
}
