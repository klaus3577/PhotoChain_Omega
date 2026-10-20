// A képek böngészése és kezelése (terv 5.1, L13): a nyilvános galéria (keresés, szűrés, rendezés,
// lapozás), az adatlap a tanúsítvánnyal, a saját képek listája, a módosítás és az elrejtés. A listák
// eleme a kép értékeléseinek összesítését, az adatlap a néző jelzőjét (megvette-e) is adja (L20).
// Láthatóság (photos.visibility.ts): a nyilvános képet – regisztrált, a fotósa nincs letiltva –
// bárki látja, a többit csak a tulajdonosa és az admin – mások számára nem létezik (404). Módosítani
// csak a tulajdonos, elrejteni a tulajdonos és az admin tud; aki a képet látja, de nem jogosult,
// 403-at kap. Az elrejtés a láncon semmit nem változtat (a rekord megmarad); a kép nyilvános fájljai
// (előnézet, bélyegkép) viszont törlődnek, mert a statikus kiszolgálás – és az L32-es felhőtárhely –
// az állapotot nem ellenőrzi. Az eredeti fájl megmarad. Az elrejtés azt is rögzíti, ki döntött róla
// (hiddenBy, L16 – photos.hiding.ts): a tulajdonos és az admin (moderátori levétel) döntése független,
// egyik sem szünteti meg a másikét; a kép nyitott fizetései lezárulnak.
// Forrás: Prisma ORM v7 – Filtering and sorting, Pagination (skip, take), Transactions,
// https://www.prisma.io/docs/orm/v7/prisma-client/queries (adaptálva); RFC 9110 – HTTP Semantics
// (403, 404), https://www.rfc-editor.org/rfc/rfc9110
import type { Logger } from 'pino';

import type { HiddenBy, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { type PageMeta, pageMeta, type Pagination } from '../../lib/schemas.js';
import { containsText } from '../../lib/search.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import { assertCategoryExists } from '../categories/categories.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import { deletePublicFiles, publicKeysOf } from './photos.files.js';
import { hiddenByAfterHide, type HidingParty, type HidingState } from './photos.hiding.js';
import {
  NO_RATING,
  RATING_AGGREGATE,
  ratingsByPhoto,
  type RatingSummary,
  VISIBLE_REVIEW_WHERE,
} from '../reviews/reviews.rating.js';
import {
  OWN_PHOTO_SELECT,
  type OwnPhotoListItemDto,
  pendingTransactionOf,
  PHOTO_DETAIL_SELECT,
  PHOTO_SUMMARY_SELECT,
  type PhotoDetailDto,
  type PhotoDetailViewDto,
  type PhotoDtoContext,
  type PhotoListItemDto,
  type PhotoViewerFlags,
  toOwnPhotoListItemDto,
  toPhotoDetailDto,
  toPhotoListItemDto,
} from './photos.dto.js';
import type { ListPhotosQuery, PhotoSort, UpdatePhotoInput } from './photos.schemas.js';
import {
  canManage,
  canView,
  isPublic,
  PUBLIC_PHOTO_WHERE,
  type PhotoViewer,
  type PhotoVisibility,
  VISIBILITY_SELECT,
} from './photos.visibility.js';

/** Egy lista-oldal: a képek (az értékeléseik összesítésével) és a lapozás adatai. */
export interface PhotoPage {
  photos: PhotoListItemDto[];
  meta: PageMeta;
}

/** A saját képek egy oldala: a tulajdonosnak szóló mezőkkel (hiddenBy, pendingTransaction – L22). */
export interface OwnPhotoPage {
  photos: OwnPhotoListItemDto[];
  meta: PageMeta;
}

export interface PhotoCatalog {
  /** A nyilvános galéria: csak a nyilvános képek (regisztrált, a fotósa nincs letiltva). */
  list(query: ListPhotosQuery): Promise<PhotoPage>;
  /**
   * A felhasználó saját képei minden állapotban, a legújabb elöl – a vezérlőpultnak azzal együtt, ki
   * rejtette el a képet, és mi a függő regisztrációs tranzakciója.
   */
  listOwn(ownerId: string, pagination: Pagination): Promise<OwnPhotoPage>;
  /**
   * Az adatlap a néző jelzőjével (megvette-e); a nem nyilvános képet csak a tulajdonos és az admin
   * látja (másnak 404).
   */
  get(id: string, viewer: PhotoViewer | null): Promise<PhotoDetailViewDto>;
  /** A cím, a leírás, az ár és a kategória módosítása – csak a tulajdonosnak. */
  update(id: string, editor: PhotoViewer, input: UpdatePhotoInput): Promise<PhotoDetailDto>;
  /** Elrejtés – a tulajdonosnak és az adminnak; ismételve is sikeres. */
  hide(id: string, actor: PhotoViewer): Promise<void>;
}

export interface PhotoCatalogDependencies {
  prisma: PrismaClient;
  storage: Pick<StorageService, 'publicUrl' | 'delete'>;
  logger: Logger;
  /** A blokklánc-hálózat (CHAIN_ID) – ebből készül a tanúsítvány tranzakció- és szerződés-linkje */
  chainId: number;
  /** A PhotoRegistry címe ezen a hálózaton – a tanúsítványban (L20) */
  contractAddress: string;
  /** Az elrejtett kép nyitott fizetéseinek lezárása (L16) */
  checkouts: Pick<OrdersService, 'closeOpenCheckouts'>;
}

/** A rendezések; döntetlennél az azonosító dönt, így a lapozás stabil (nincs átfedés, kihagyás). */
const PHOTO_ORDER: Record<PhotoSort, Prisma.PhotoOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  price_asc: [{ priceHuf: 'asc' }, { id: 'asc' }],
  price_desc: [{ priceHuf: 'desc' }, { id: 'desc' }],
};

/** A jogosultság eldöntéséhez és az elrejtéshez szükséges mezők. */
const ACCESS_SELECT = {
  ...VISIBILITY_SELECT,
  id: true,
  hiddenBy: true,
  previewKey: true,
  thumbnailKey: true,
} as const satisfies Prisma.PhotoSelect;

/** Az elrejtés legfeljebb ennyiszer próbálkozik, ha a kép állapota közben változik */
const MAX_HIDE_ATTEMPTS = 3;

type PhotoAccess = Prisma.PhotoGetPayload<{ select: typeof ACCESS_SELECT }>;

/** Az adatlap mezői és a láthatóság eldöntéséhez szükségesek. */
const VISIBLE_DETAIL_SELECT = {
  ...PHOTO_DETAIL_SELECT,
  ownerId: true,
  owner: { select: { ...PHOTO_DETAIL_SELECT.owner.select, isBlocked: true } },
} as const satisfies Prisma.PhotoSelect;

const photoNotFound = (): AppError => new AppError(404, 'NOT_FOUND', 'A kép nem található');

/** A keresőszó a címben, a leírásban vagy a fotós nevében (kis- és nagybetűtől függetlenül). */
function searchConditions(q: string): Prisma.PhotoWhereInput[] {
  const contains = containsText(q);
  return [{ title: contains }, { description: contains }, { owner: { displayName: contains } }];
}

/** A galéria szűrői: csak a nyilvános képek; a meg nem adott (undefined) szűrőt a Prisma kihagyja. */
function galleryWhere(query: ListPhotosQuery): Prisma.PhotoWhereInput {
  return {
    ...PUBLIC_PHOTO_WHERE,
    categoryId: query.categoryId,
    ownerId: query.ownerId,
    priceHuf: { gte: query.minPrice, lte: query.maxPrice },
    ...(query.q === undefined ? {} : { OR: searchConditions(query.q) }),
  };
}

export function createPhotoCatalog({
  prisma,
  storage,
  logger,
  chainId,
  contractAddress,
  checkouts,
}: PhotoCatalogDependencies): PhotoCatalog {
  const dtoContext: PhotoDtoContext = { storage, chainId, contractAddress };

  /**
   * Az oldal képeinek értékelései egyetlen, képenként csoportosító lekérdezéssel (nem képenként egy-egy
   * lekérdezéssel); a letiltott szerzőé – mint mindenhol – kimarad (L16).
   */
  async function ratingsOf(photoIds: string[]): Promise<ReadonlyMap<string, RatingSummary>> {
    if (photoIds.length === 0) return new Map();
    const groups = await prisma.review.groupBy({
      by: ['photoId'],
      where: { photoId: { in: photoIds }, ...VISIBLE_REVIEW_WHERE },
      ...RATING_AGGREGATE,
    });
    return ratingsByPhoto(groups);
  }

  /**
   * A bejelentkezett néző jelzői (L20, L23): van-e kifizetett rendelése a képre; írhat-e értékelést –
   * vásárló, nyilvános kép, nem a sajátja, még nem értékelte (ugyanaz, amit a reviews.service íráskor
   * ellenőriz) –; és a saját értékelésének azonosítója, ha már értékelt.
   */
  async function viewerFlags(
    photo: Pick<PhotoVisibility, 'ownerId' | 'status' | 'owner'> & { id: string },
    viewer: PhotoViewer,
  ): Promise<PhotoViewerFlags> {
    const [purchase, ownReview] = await Promise.all([
      prisma.order.findFirst({
        where: { buyerId: viewer.id, photoId: photo.id, status: 'PAID' },
        select: { id: true },
      }),
      prisma.review.findUnique({
        where: { photoId_authorId: { photoId: photo.id, authorId: viewer.id } },
        select: { id: true },
      }),
    ]);
    const purchased = purchase !== null;
    return {
      purchased,
      canReview: purchased && ownReview === null && isPublic(photo) && photo.ownerId !== viewer.id,
      ownReviewId: ownReview?.id ?? null,
    };
  }

  /**
   * Egy lista-oldal: a találatok száma és az oldal képei. A kettő ugyanabból a pillanatképből jön
   * (REPEATABLE READ): egy közben regisztrált kép miatt sem térhetnek el egymástól. Az értékelések
   * összesítése utána, külön lekérdezésben jön – egy közben érkező értékelés legfeljebb már látszik.
   */
  /** A darabszám és az oldal sorai egy pillanatképből – a galéria és a saját képek közös szabálya. */
  function snapshot<T>(count: Prisma.PrismaPromise<number>, rows: Prisma.PrismaPromise<T[]>) {
    return prisma.$transaction([count, rows], { isolationLevel: 'RepeatableRead' });
  }

  const pageQuery = ({ page, pageSize }: Pagination) => ({
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  async function findPage(
    where: Prisma.PhotoWhereInput,
    orderBy: Prisma.PhotoOrderByWithRelationInput[],
    pagination: Pagination,
  ): Promise<PhotoPage> {
    const [total, photos] = await snapshot(
      prisma.photo.count({ where }),
      prisma.photo.findMany({
        where,
        orderBy,
        ...pageQuery(pagination),
        select: PHOTO_SUMMARY_SELECT,
      }),
    );
    const ratings = await ratingsOf(photos.map((photo) => photo.id));
    return {
      photos: photos.map((photo) =>
        toPhotoListItemDto(photo, storage, ratings.get(photo.id) ?? NO_RATING),
      ),
      meta: pageMeta(pagination, total),
    };
  }

  /** A saját képek oldala: a lista mezői és a tulajdonosnak szóló mezők (hiddenBy, függő tranzakció). */
  async function findOwnPage(ownerId: string, pagination: Pagination): Promise<OwnPhotoPage> {
    const where = { ownerId };
    const [total, photos] = await snapshot(
      prisma.photo.count({ where }),
      prisma.photo.findMany({
        where,
        orderBy: PHOTO_ORDER.newest,
        ...pageQuery(pagination),
        select: OWN_PHOTO_SELECT,
      }),
    );
    const ratings = await ratingsOf(photos.map((photo) => photo.id));
    return {
      photos: photos.map((photo) =>
        toOwnPhotoListItemDto(photo, storage, ratings.get(photo.id) ?? NO_RATING, chainId),
      ),
      meta: pageMeta(pagination, total),
    };
  }

  /** A kép, ha a felhasználó láthatja; egyébként 404 (a nem látható kép létezését sem áruljuk el). */
  async function findAccessible(id: string, viewer: PhotoViewer): Promise<PhotoAccess> {
    const photo = await prisma.photo.findUnique({ where: { id }, select: ACCESS_SELECT });
    if (!photo || !canView(photo, viewer)) throw photoNotFound();
    return photo;
  }

  /**
   * Az elrejtett kép nyilvános fájljainak törlése. Ha nem sikerül, naplózzuk, és 500-at adunk: a kép
   * már rejtett, az ismételt kérés a törlést újrapróbálja.
   */
  async function removePublicFiles(photo: PhotoAccess): Promise<void> {
    const reasons = await deletePublicFiles(storage, photo);
    if (reasons.length === 0) return;
    logger.error(
      { photoId: photo.id, keys: publicKeysOf(photo), reasons },
      'Az elrejtett kép nyilvános fájljait nem sikerült törölni',
    );
    throw new AppError(500, 'INTERNAL_ERROR', 'A kép elrejtése nem fejeződött be – próbáld újra');
  }

  /**
   * Az elrejtés rögzítése: az új hiddenBy a kép jelenlegi állapotából (photos.hiding.ts), feltételesen
   * írva – ha a kép közben változott (pl. lezárult a regisztrációja, vagy a másik fél is elrejtette),
   * újraolvassa. Az új hiddenBy-t adja, vagy null-t, ha a fél döntése már érvényben volt.
   */
  async function recordHiding(photo: PhotoAccess, party: HidingParty): Promise<HiddenBy | null> {
    let current: HidingState = photo;
    for (let attempt = 0; attempt < MAX_HIDE_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        current = await prisma.photo.findUniqueOrThrow({
          where: { id: photo.id },
          select: { status: true, hiddenBy: true },
        });
      }
      const hiddenBy = hiddenByAfterHide(current, party);
      if (hiddenBy === null) return null;
      const { count } = await prisma.photo.updateMany({
        where: { id: photo.id, status: current.status, hiddenBy: current.hiddenBy },
        data: { status: 'HIDDEN', hiddenBy },
      });
      if (count > 0) return hiddenBy;
    }
    throw new AppError(
      409,
      'CONFLICT',
      'A kép állapota közben többször megváltozott – próbáld újra',
    );
  }

  /** A jogosulatlan kísérlet nyoma a naplóban (ki, melyik képen, mit), és a 403-as hiba. */
  function accessDenied(
    photoId: string,
    actor: PhotoViewer,
    action: 'update' | 'hide',
    message: string,
  ): AppError {
    logger.warn(
      { photoId, actorId: actor.id, action },
      'Jogosulatlan kísérlet egy kép módosítására vagy elrejtésére',
    );
    return new AppError(403, 'FORBIDDEN', message);
  }

  /** Az adatlap az adatbázis friss állapotából. */
  async function detailOf(id: string): Promise<PhotoDetailDto> {
    const photo = await prisma.photo.findUniqueOrThrow({
      where: { id },
      select: PHOTO_DETAIL_SELECT,
    });
    return toPhotoDetailDto(photo, dtoContext);
  }

  return {
    list: (query) => findPage(galleryWhere(query), PHOTO_ORDER[query.sort], query),

    listOwn: findOwnPage,

    async get(id, viewer) {
      const photo = await prisma.photo.findUnique({ where: { id }, select: VISIBLE_DETAIL_SELECT });
      if (!photo || !canView(photo, viewer)) throw photoNotFound();
      // A függő tranzakció a kép kezelőjének (tulajdonos, admin) szól – a nem nyilvános képet más
      // úgysem látja, de a nyilvánosnál sem adjuk ki idegennek
      return {
        ...toPhotoDetailDto(photo, dtoContext),
        viewer: viewer === null ? null : await viewerFlags(photo, viewer),
        pendingTransaction: canManage(photo, viewer) ? pendingTransactionOf(photo, chainId) : null,
      };
    },

    async update(id, editor, input) {
      const photo = await findAccessible(id, editor);
      if (photo.ownerId !== editor.id) {
        throw accessDenied(id, editor, 'update', 'Csak a saját képed adatait módosíthatod');
      }
      const hidden = (): AppError =>
        new AppError(409, 'CONFLICT', 'Az elrejtett kép adatai nem módosíthatók');
      if (photo.status === 'HIDDEN') throw hidden();
      if (input.categoryId !== undefined) await assertCategoryExists(prisma, input.categoryId);
      // A feltétel az írásban is szerepel: ha a képet közben elrejtették, nem módosul
      const { count } = await prisma.photo.updateMany({
        where: { id, status: { not: 'HIDDEN' } },
        // Csak a módosítható mezők; a meg nem adott (undefined) mező változatlan marad
        data: {
          title: input.title,
          description: input.description,
          priceHuf: input.priceHuf,
          categoryId: input.categoryId,
        },
      });
      if (count === 0) throw hidden();
      return detailOf(id);
    },

    async hide(id, actor) {
      const photo = await findAccessible(id, actor);
      if (!canManage(photo, actor)) {
        throw accessDenied(id, actor, 'hide', 'Csak a saját képedet rejtheted el');
      }
      // A még regisztrációra váró kép tranzakciója így el sem indul (photos.registration.ts)
      const hiddenBy = await recordHiding(photo, photo.ownerId === actor.id ? 'OWNER' : 'ADMIN');
      if (hiddenBy !== null) {
        logger.info({ photoId: id, actorId: actor.id, hiddenBy }, 'A kép elrejtve');
      }
      // Ismételt kérésnél is: egy korábbi, félbemaradt elrejtés így befejeződik. A két lépés
      // független: a fájlok törlése (a tényleges levétel) nem vár a Stripe-ra, és egyik hibája sem
      // hagyja ki a másikat – mindkettő hibája a naplóba kerül, az első a végén tovább is jut
      const closing = checkouts.closeOpenCheckouts({ photoId: id }).catch((error: unknown) => {
        logger.error(
          { photoId: id, err: error },
          'Az elrejtett kép nyitott fizetéseit nem sikerült lezárni',
        );
        throw error;
      });
      const results = await Promise.allSettled([removePublicFiles(photo), closing]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
    },
  };
}
