// Az értékelések összesítése – a kép és a fotós átlaga (L15). Az átlagot a csillagok összegéből és
// számából számoljuk: a lebegőpontos átlag a felezőpontnál rossz irányba kerekíthet (41 / 40 = 1,025
// helyett 1,0249999… → 1,02), az összeg századainak osztása viszont pontosan x,5-öt ad, így a
// kerekítés helyes (1,03). A profil (users), a lista (reviews) és a galéria listaelemei (photos, L20 –
// egyetlen, képenként csoportosító lekérdezéssel) is ezt használják.
// Forrás: Prisma ORM v7 – Aggregation, grouping, and summarizing (aggregate: _sum, _count; groupBy),
// https://www.prisma.io/docs/orm/v7/prisma-client/queries/aggregation-grouping-summarizing (adaptálva)
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

/** Értékelések összesítése: az átlag (két tizedesre kerekítve; értékelés nélkül null) és a darabszám. */
export interface RatingSummary {
  average: number | null;
  count: number;
}

/** Az összesítéshez kért értékek: a csillagok összege és az értékelések száma */
export const RATING_AGGREGATE = { _sum: { rating: true }, _count: { _all: true } } as const;

/**
 * A látható értékelések: a letiltott szerzőé a tiltás idejére kimarad a listákból és az átlagokból
 * (L16, szerzői döntés, 2026-10-06).
 */
export const VISIBLE_REVIEW_WHERE = {
  author: { isBlocked: false },
} as const satisfies Prisma.ReviewWhereInput;

export interface RatingAggregate {
  _sum: { rating: number | null };
  _count: { _all: number };
}

/** A két tizedeshez: az átlag századaival számolunk */
const HUNDREDTHS = 100;

export function toRatingSummary({ _sum, _count }: RatingAggregate): RatingSummary {
  // Az összeg csak akkor null, ha nincs egyetlen értékelés sem
  if (_sum.rating === null) return { average: null, count: _count._all };
  return {
    average: Math.round((_sum.rating * HUNDREDTHS) / _count._all) / HUNDREDTHS,
    count: _count._all,
  };
}

/** Az értékelés nélküli kép összesítése */
export const NO_RATING: Readonly<RatingSummary> = Object.freeze({ average: null, count: 0 });

/** Egy kép értékeléseinek összesítése a képenként csoportosító lekérdezésből (groupBy photoId). */
export interface PhotoRatingGroup extends RatingAggregate {
  photoId: string;
}

/**
 * A képenként csoportosított összesítésekből a kép azonosítója szerinti átlag és darabszám. Az
 * értékelés nélküli kép nincs a csoportok között – annál a hívó a NO_RATING-et használja.
 */
export function ratingsByPhoto(
  groups: readonly PhotoRatingGroup[],
): ReadonlyMap<string, RatingSummary> {
  return new Map(groups.map((group) => [group.photoId, toRatingSummary(group)]));
}

/** Az értékelések átlaga és száma a megadott feltétellel (pl. egy fotós nyilvános képei). */
export async function ratingSummary(
  prisma: PrismaClient,
  where: Prisma.ReviewWhereInput,
): Promise<RatingSummary> {
  return toRatingSummary(await prisma.review.aggregate({ where, ...RATING_AGGREGATE }));
}
