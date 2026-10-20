// Az értékelések üzleti logikája (terv 5.1, L15): a kép értékeléseinek listája az átlaggal, az
// értékelés írása és törlése, valamint a fotós átlaga a profilhoz.
// - Írni csak a kép kifizetett (PAID) vásárlója tud, csak nyilvános (REGISTERED) képre, és képenként
//   egyszer: ezt az adatbázis egyedi indexe (reviews: photoId + authorId) a párhuzamos kérésekkel
//   szemben is garantálja. A fotós a saját képét nem értékelheti.
// - A nem nyilvános kép értékeléseit csak az látja, aki a képet is (tulajdonos, admin): másnak 404.
//   A letiltott szerző értékelése a tiltás idejére kimarad a listából és az átlagból (L16); mások
//   számára nem létezik.
// - Törölni a szerző (a később elrejtett kép értékelését is – az a saját tartalma) és az admin tud;
//   aki az értékelést látja, de nem jogosult, 403-at kap. A jogosulatlan kísérlet és a törlés is a
//   naplóba kerül (ki, mit).
// - Elfogadott versenyhelyzet: ha a képet az ellenőrzés és az írás között elrejtik, az értékelés a
//   rejtett képhez kerül – ugyanez az állapot jönne létre, ha egy pillanattal korábban érkezik.
// Forrás: Prisma ORM v7 – Pagination (skip, take) és Transactions (lekérdezések tömbje,
// isolationLevel), https://www.prisma.io/docs/orm/v7/prisma-client/queries (adaptálva)
import type { Logger } from 'pino';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { isUniqueViolation } from '../../lib/prisma.js';
import { type PageMeta, pageMeta, type Pagination } from '../../lib/schemas.js';
import {
  canView,
  isPublic,
  type PhotoViewer,
  VISIBILITY_SELECT,
} from '../photos/photos.visibility.js';
import { REVIEW_SELECT, type ReviewDto, toReviewDto } from './reviews.dto.js';
import {
  RATING_AGGREGATE,
  type RatingSummary,
  toRatingSummary,
  VISIBLE_REVIEW_WHERE,
} from './reviews.rating.js';
import type { CreateReviewInput } from './reviews.schemas.js';

/** Egy lista-oldal: az értékelések, a kép összesített értékelése és a lapozás adatai. */
export interface ReviewPage {
  reviews: ReviewDto[];
  rating: RatingSummary;
  meta: PageMeta;
}

export interface ReviewsService {
  /** A kép értékelései, a legújabb elöl; a nem látható képnél 404. */
  list(photoId: string, viewer: PhotoViewer | null, pagination: Pagination): Promise<ReviewPage>;
  /** Új értékelés a kép kifizetett vásárlójától. */
  create(photoId: string, author: PhotoViewer, input: CreateReviewInput): Promise<ReviewDto>;
  /** Törlés – a szerzőnek és az adminnak. */
  remove(reviewId: string, actor: PhotoViewer): Promise<void>;
}

export interface ReviewsServiceDependencies {
  prisma: PrismaClient;
  logger: Logger;
}

/** A legújabb elöl; azonos időpontnál az azonosító dönt, így a lapozás stabil. */
const REVIEW_ORDER: Prisma.ReviewOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

const photoNotFound = (): AppError => new AppError(404, 'NOT_FOUND', 'A kép nem található');
const reviewNotFound = (): AppError => new AppError(404, 'NOT_FOUND', 'Az értékelés nem található');

export function createReviewsService({
  prisma,
  logger,
}: ReviewsServiceDependencies): ReviewsService {
  /** A kép, ha a felhasználó láthatja; egyébként 404 (a nem látható kép létezését sem áruljuk el). */
  async function findVisiblePhoto(photoId: string, viewer: PhotoViewer | null) {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      select: VISIBILITY_SELECT,
    });
    if (!photo || !canView(photo, viewer)) throw photoNotFound();
    return photo;
  }

  /** A jogosulatlan értékelési kísérlet nyoma a naplóban, és a 403-as hiba. */
  function reviewDenied(photoId: string, actor: PhotoViewer, message: string): AppError {
    logger.warn(
      { photoId, actorId: actor.id, action: 'review' },
      'Jogosulatlan kísérlet egy kép értékelésére',
    );
    return new AppError(403, 'FORBIDDEN', message);
  }

  return {
    async list(photoId, viewer, { page, pageSize }) {
      await findVisiblePhoto(photoId, viewer);
      const where = { photoId, ...VISIBLE_REVIEW_WHERE };
      // Az összesítés és az oldal ugyanabból a pillanatképből (REPEATABLE READ): egy közben érkező
      // értékelés miatt sem térhetnek el egymástól
      const [aggregate, rows] = await prisma.$transaction(
        [
          prisma.review.aggregate({ where, ...RATING_AGGREGATE }),
          prisma.review.findMany({
            where,
            orderBy: REVIEW_ORDER,
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: REVIEW_SELECT,
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
      const rating = toRatingSummary(aggregate);
      return {
        reviews: rows.map(toReviewDto),
        rating,
        meta: pageMeta({ page, pageSize }, rating.count),
      };
    },

    async create(photoId, author, input) {
      const photo = await findVisiblePhoto(photoId, author);
      if (photo.ownerId === author.id) {
        throw reviewDenied(photoId, author, 'A saját képedet nem értékelheted');
      }
      if (!isPublic(photo)) {
        throw new AppError(409, 'CONFLICT', 'Csak nyilvános kép értékelhető');
      }
      const purchase = await prisma.order.findFirst({
        where: { buyerId: author.id, photoId, status: 'PAID' },
        select: { id: true },
      });
      if (!purchase) {
        throw reviewDenied(photoId, author, 'Csak a kép vásárlója értékelheti a képet');
      }
      try {
        const review = await prisma.review.create({
          data: { photoId, authorId: author.id, rating: input.rating, comment: input.comment },
          select: REVIEW_SELECT,
        });
        return toReviewDto(review);
      } catch (error) {
        // Az egyedi index (photoId + authorId): a második – akár párhuzamos – értékelés
        if (isUniqueViolation(error)) {
          throw new AppError(409, 'ALREADY_REVIEWED', 'Ezt a képet már értékelted');
        }
        throw error;
      }
    },

    async remove(reviewId, actor) {
      const review = await prisma.review.findUnique({
        where: { id: reviewId },
        select: {
          authorId: true,
          photoId: true,
          author: { select: { isBlocked: true } },
          photo: { select: VISIBILITY_SELECT },
        },
      });
      if (!review) throw reviewNotFound();
      const byAuthor = review.authorId === actor.id;
      if (!byAuthor && actor.role !== 'ADMIN') {
        // Aki a képet sem láthatja, annak az értékelése sem létezik – ahogy a letiltott szerzőé sem
        if (!canView(review.photo, actor) || review.author.isBlocked) throw reviewNotFound();
        logger.warn(
          { reviewId, photoId: review.photoId, actorId: actor.id, action: 'delete-review' },
          'Jogosulatlan kísérlet egy értékelés törlésére',
        );
        throw new AppError(403, 'FORBIDDEN', 'Csak a saját értékelésedet törölheted');
      }
      // Ha közben (pl. egy másik lapon) már törölték, az is 404
      const { count } = await prisma.review.deleteMany({ where: { id: reviewId } });
      if (count === 0) throw reviewNotFound();
      logger.info(
        {
          reviewId,
          photoId: review.photoId,
          actorId: actor.id,
          deletedBy: byAuthor ? 'AUTHOR' : 'ADMIN',
        },
        'Az értékelés törölve',
      );
    },
  };
}
