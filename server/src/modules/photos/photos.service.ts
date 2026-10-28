// A képfeltöltés üzleti logikája (terv 3.2): ellenőrzés → ujjlenyomatok → duplikáció-szűrés (az
// adatbázisban és a láncon) → tárolás → Photo rekord PENDING_CHAIN állapotban → a lánc-regisztráció
// ütemezése (a háttérben fut, lásd photos.registration.ts).
// Forrás: p-queue README (concurrency, AbortSignal), https://github.com/sindresorhus/p-queue
// (adaptálva)
import { randomUUID } from 'node:crypto';

import PQueue from 'p-queue';
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/prisma.js';
import { type BlockchainService, ChainError } from '../../services/blockchain.service.js';
import { findClosest, isNearDuplicate } from '../../services/hashing.service.js';
import type { ImageWork } from '../../services/imageWork.js';
import {
  createPreview,
  createThumbnail,
  type ImageFormat,
  MIN_IMAGE_EDGE_PX,
} from '../../services/image.service.js';
import {
  type AnalysedImage,
  analyseImage,
  imageFailure,
  type ImageRules,
} from '../../services/imageAnalysis.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import { assertCategoryExists } from '../categories/categories.service.js';
import {
  PHOTO_DETAIL_SELECT,
  type PhotoDetailDto,
  type PhotoDetailRow,
  toPhotoDetailDto,
} from './photos.dto.js';
import type { PhotoRegistration } from './photos.registration.js';
import type { CreatePhotoInput } from './photos.schemas.js';
import { isPublic } from './photos.visibility.js';

/** A feltöltött kép szabályai: a piactéren legalább 600 képpontos oldalú kép kínálható. */
const UPLOAD_IMAGE_RULES: ImageRules = { minEdgePx: MIN_IMAGE_EDGE_PX, action: 'tölthető fel' };

/** Ha a lánc nem érhető el, ennyi ideig nem kérdezzük újra feltöltéskor */
const CHAIN_CHECK_PAUSE_MS = 60_000;

const FILE_EXTENSIONS: Record<ImageFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/**
 * Amit a 409-es válasz a már feltöltött képről elárulhat (ki és mikor töltötte fel), és ami alapján
 * eldől, hogy elárulhatja-e (az állapota és a tulajdonosa).
 */
const DUPLICATE_DETAILS_SELECT = {
  id: true,
  title: true,
  createdAt: true,
  status: true,
  ownerId: true,
  owner: { select: { displayName: true, isBlocked: true } },
} as const;

type DuplicateDetails = Prisma.PhotoGetPayload<{ select: typeof DUPLICATE_DETAILS_SELECT }>;

export interface UploadPhotoRequest {
  ownerId: string;
  file: Buffer;
  fields: CreatePhotoInput;
  /** Jelez, ha a kliens megszakította a kérést – a még sorban álló feltöltést ekkor eldobjuk. */
  signal?: AbortSignal;
}

export interface PhotosService {
  /** A válasz ugyanolyan alakú, mint az adatlapé (GET /api/photos/:id) */
  upload(request: UploadPhotoRequest): Promise<PhotoDetailDto>;
}

export interface PhotosServiceDependencies {
  prisma: PrismaClient;
  storage: StorageService;
  logger: Logger;
  /** Legfeljebb ennyi eltérő dHash-bitnél számít két kép másolatnak (DHASH_THRESHOLD) */
  dHashThreshold: number;
  /** A blokklánc-hálózat (CHAIN_ID) – az adatlap alakú válaszhoz */
  chainId: number;
  /** A PhotoRegistry címe ezen a hálózaton – az adatlap alakú válaszhoz */
  contractAddress: string;
  /** A lánc is megkérdezhető, regisztrálva van-e már a kép (a lánc az igazságforrás) */
  blockchain: Pick<BlockchainService, 'isRegistered'>;
  /** A sikeres feltöltés után a lánc-regisztráció ütemezése (a háttérben fut) */
  registration: Pick<PhotoRegistration, 'schedule'>;
  /** A közös képfeldolgozási sor (L32): a képbontás ezen fut */
  imageWork: ImageWork;
  /** Az óra (a tesztek a lánc-ellenőrzés szüneteltetéséhez állíthatják) */
  now?: () => number;
}

/** A nyilvános, újrakódolt képek: vízjeles előnézet és bélyegkép. */
interface Derivatives {
  preview: Buffer;
  thumbnail: Buffer;
}

/** A kép három fájljának tárhelykulcsa – a Photo rekord azonos nevű mezőibe kerülnek. */
interface PhotoKeys {
  originalKey: string;
  previewKey: string;
  thumbnailKey: string;
}

/**
 * 409-es hiba a már feltöltött kép adataival („ki és mikor regisztrálta”). Az adatok csak akkor
 * látszanak, ha a kép nyilvános (a láncon regisztrált, a fotósa nincs letiltva), vagy ha a feltöltő a
 * saját képét töltené fel újra. A többi képről más csak annyit tud meg, hogy van ilyen kép.
 */
function duplicateError(
  code: 'DUPLICATE_EXACT' | 'DUPLICATE_SIMILAR',
  existing: DuplicateDetails,
  distance: number,
  uploaderId: string,
): AppError {
  const message =
    code === 'DUPLICATE_EXACT'
      ? 'Ezt a képet már feltöltötték'
      : 'Ehhez nagyon hasonló képet már feltöltöttek';
  const isVisible = isPublic(existing) || existing.ownerId === uploaderId;
  return new AppError(
    409,
    code,
    message,
    isVisible
      ? {
          photoId: existing.id,
          title: existing.title,
          ownerDisplayName: existing.owner.displayName,
          uploadedAt: existing.createdAt,
          distance,
        }
      : { distance },
  );
}

/** A kliens bontotta a kapcsolatot – a választ már senki nem kapja meg, de nem szerverhiba. */
const uploadAborted = (): AppError => new AppError(400, 'INVALID_UPLOAD', 'A feltöltés megszakadt');

/**
 * Az előnézet és a bélyegkép elkészítése – még a mentés előtt, mert a sérült képadat csak ekkor, a
 * teljes felbontású dekódoláskor derülhet ki. Ez is a kliens hibája (415), nem szerverhiba.
 */
async function createDerivatives(file: Buffer, logger: Logger): Promise<Derivatives> {
  try {
    return { preview: await createPreview(file), thumbnail: await createThumbnail(file) };
  } catch (error) {
    throw imageFailure(error, logger, UPLOAD_IMAGE_RULES);
  }
}

function photoKeys(id: string, format: ImageFormat): PhotoKeys {
  return {
    originalKey: `originals/${id}.${FILE_EXTENSIONS[format]}`,
    previewKey: `previews/${id}.jpg`,
    thumbnailKey: `thumbnails/${id}.jpg`,
  };
}

export function createPhotosService({
  prisma,
  storage,
  logger,
  dHashThreshold,
  chainId,
  contractAddress,
  blockchain,
  registration,
  imageWork,
  now = Date.now,
}: PhotosServiceDependencies): PhotosService {
  /** Eddig az időpontig nem kérdezzük a láncot (egy elérhetetlenség után) */
  let chainCheckPausedUntil = 0;
  // Egyszerre egy feltöltés feldolgozása fut (sor). Így két egyidejűleg érkező, egymáshoz HASONLÓ
  // kép közül a második már látja az elsőt (ezt az adatbázis egyedi indexe nem tudná kizárni), és a
  // képfeldolgozás memóriaigénye sem sokszorozódik meg. Szándékosan nincs a sornak időkorlátja: a
  // p-queue a lejárt feladatot nem állítja le, csak elindítja mellette a következőt – ez a
  // sorrendiséget rontaná el. A képfeldolgozás lépéseinek saját időkorlátjuk van (imageDecoding.ts).
  // Csak egy szerverpéldányon belül véd; több példánynál adatbázis-szintű zár kellene – a pontos
  // egyezést ott is kizárja a photos.sha256 egyedi indexe.
  const queue = new PQueue({ concurrency: 1 });

  /** Van-e már ugyanilyen (SHA-256) vagy nagyon hasonló (dHash) kép? Ha igen, 409-es hibát dob. */
  async function assertNotDuplicate(image: AnalysedImage, uploaderId: string): Promise<void> {
    const exact = await prisma.photo.findUnique({
      where: { sha256: image.sha256 },
      select: DUPLICATE_DETAILS_SELECT,
    });
    if (exact) throw duplicateError('DUPLICATE_EXACT', exact, 0, uploaderId);

    // Minden meglévő kép dHash-ével összevetjük (az elrejtettekkel is) – ehhez csak az azonosító
    // és a hash kell. Prototípus-méretben ez elég; nagy adatmennyiségnél indexelt keresés (pl.
    // BK-fa) kellene.
    // Egyenlő távolságnál a korábban feltöltött kép számít eredetinek (azonos időpontnál az
    // azonosító dönt, így a sorrend állandó)
    const candidates = await prisma.photo.findMany({
      select: { id: true, dHash: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const closest = findClosest(image.dHash, candidates);
    if (!closest || !isNearDuplicate(closest.distance, dHashThreshold)) return;

    const similar = await prisma.photo.findUniqueOrThrow({
      where: { id: closest.id },
      select: DUPLICATE_DETAILS_SELECT,
    });
    throw duplicateError('DUPLICATE_SIMILAR', similar, closest.distance, uploaderId);
  }

  /**
   * A láncot is megkérdezzük (ingyenes olvasás): a lánc az igazságforrás – ott a kép akkor is
   * szerepelhet, ha az adatbázisban nincs (pl. újratelepített adatbázis). Ha a lánc nem érhető el,
   * a feltöltés nem akad meg: naplózzuk, és a lánc a regisztrációkor úgyis visszautasítja a már
   * regisztrált hash-t (a kép ekkor CHAIN_FAILED lesz). Hiba után egy ideig nem kérdezzük – a sorban
   * várakozó feltöltések így nem várnak egyenként az időkorlátig.
   */
  async function assertNotOnChain(image: AnalysedImage): Promise<void> {
    if (now() < chainCheckPausedUntil) return;
    const registered = await blockchain.isRegistered(image.sha256).catch((error: unknown) => {
      chainCheckPausedUntil = now() + CHAIN_CHECK_PAUSE_MS;
      logger.warn(
        { reason: error instanceof ChainError ? error.kind : 'UNKNOWN' },
        'A blokklánc nem érhető el – a feltöltés (és a következő percben a többi is) a lánc ' +
          'ellenőrzése nélkül folytatódik',
      );
      return false;
    });
    if (registered) {
      throw new AppError(409, 'DUPLICATE_EXACT', 'Ezt a képet már regisztrálták a blokkláncon', {
        distance: 0,
      });
    }
  }

  /** A három fájl mentése. */
  async function storeFiles(
    keys: PhotoKeys,
    file: Buffer,
    derivatives: Derivatives,
  ): Promise<void> {
    // Szándékosan egymás után: ha az egyik mentés hibára fut, nincs még folyamatban lévő másik
    // írás, amely a takarítás (removeFiles) után hagyna fájlt a tárhelyen
    await storage.save(keys.originalKey, file);
    await storage.save(keys.previewKey, derivatives.preview);
    await storage.save(keys.thumbnailKey, derivatives.thumbnail);
  }

  /** A félbemaradt feltöltés fájljainak törlése. Ha ez sem sikerül, naplózzuk (árva fájl maradt). */
  async function removeFiles(keys: PhotoKeys): Promise<void> {
    const storageKeys = Object.values(keys);
    // Az async burok miatt a szinkron dobott hiba is elutasított ígéret lesz (nem takarja el az
    // eredeti hibát)
    const results = await Promise.allSettled(storageKeys.map(async (key) => storage.delete(key)));
    const reasons = results.flatMap((result) =>
      result.status === 'rejected' ? [String(result.reason)] : [],
    );
    if (reasons.length > 0) {
      logger.error(
        { keys: storageKeys, reasons },
        'A sikertelen feltöltés fájljait nem sikerült törölni',
      );
    }
  }

  /** A fájlok mentése és a Photo rekord létrehozása; hiba esetén a fájlokat visszatörli. */
  async function saveAndRecord(
    { ownerId, file, fields }: UploadPhotoRequest,
    image: AnalysedImage,
    derivatives: Derivatives,
  ): Promise<PhotoDetailRow> {
    const id = randomUUID();
    const keys = photoKeys(id, image.info.format);
    try {
      await storeFiles(keys, file, derivatives);
      return await prisma.photo.create({
        data: {
          id,
          ownerId,
          categoryId: fields.categoryId,
          title: fields.title,
          description: fields.description || null,
          priceHuf: fields.priceHuf,
          sha256: image.sha256,
          dHash: image.dHash,
          width: image.info.width,
          height: image.info.height,
          ...keys,
        },
        select: PHOTO_DETAIL_SELECT,
      });
    } catch (error) {
      // Sikertelen mentésnél nem maradhat árva fájl a tárhelyen
      await removeFiles(keys);
      // Versenyhelyzet több szerverpéldány között: két egyidejű, azonos feltöltés közül a másodikat
      // az adatbázis egyedi indexe (photos.sha256) utasítja el – ebből ugyanaz a 409-es válasz lesz
      if (isUniqueViolation(error)) await assertNotDuplicate(image, ownerId);
      throw error;
    }
  }

  async function processUpload(request: UploadPhotoRequest): Promise<PhotoDetailDto> {
    const image = await imageWork(async () =>
      analyseImage(request.file, logger, UPLOAD_IMAGE_RULES),
    );
    await assertNotDuplicate(image, request.ownerId);
    await assertNotOnChain(image);
    const derivatives = await imageWork(async () => createDerivatives(request.file, logger));
    const photo = await saveAndRecord(request, image, derivatives);
    // A lánc-regisztráció a háttérben fut: a válasz nem vár a blokkra (terv D12)
    registration.schedule(photo.id);
    return toPhotoDetailDto(photo, { storage, chainId, contractAddress });
  }

  /**
   * A feltöltés beállítása a sorba. A még VÁRAKOZÓ feltöltés megszakítható (a kliens bontotta a
   * kapcsolatot): kikerül a sorból, így a fájlja nem foglalja tovább a memóriát. A már futó
   * feldolgozást nem szakítjuk meg – azzal a sorrendiség sérülne (a következő elindulna mellette).
   */
  async function enqueue(request: UploadPhotoRequest): Promise<PhotoDetailDto> {
    const { signal } = request;
    if (signal?.aborted) throw uploadAborted();

    const waiting = new AbortController();
    let started = false;
    const cancelIfWaiting = (): void => {
      if (!started) waiting.abort();
    };
    signal?.addEventListener('abort', cancelIfWaiting, { once: true });
    try {
      return await queue.add(
        () => {
          started = true;
          return processUpload(request);
        },
        { signal: waiting.signal },
      );
    } catch (error) {
      if (waiting.signal.aborted) throw uploadAborted();
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancelIfWaiting);
    }
  }

  return {
    async upload(request) {
      await assertCategoryExists(prisma, request.fields.categoryId);
      return enqueue(request);
    },
  };
}
