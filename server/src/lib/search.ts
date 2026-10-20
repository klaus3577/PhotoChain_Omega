// Szöveges keresés feltétele a Prisma-lekérdezésekhez (a galéria és az admin felhasználólistája).
// A Prisma a contains feltételből ILIKE '%…%' mintát készít, de a keresőszót nem escape-eli: a
// LIKE-minta különleges karakterei (%, _ és maga az escape-karakter, a \) szó szerint értendők.
// Forrás: Prisma ORM v7 – Filtering and sorting (contains, mode: insensitive),
// https://www.prisma.io/docs/orm/v7/prisma-client/queries/filtering-and-sorting; PostgreSQL 17 –
// Pattern Matching (LIKE, ILIKE, ESCAPE), https://www.postgresql.org/docs/17/functions-matching.html
// (adaptálva)

/** Kis- és nagybetűtől független „tartalmazza” feltétel (Prisma StringFilter). */
export interface ContainsText {
  contains: string;
  mode: 'insensitive';
}

const escapeLikePattern = (text: string): string => text.replace(/[\\%_]/g, '\\$&');

/** A keresőszó (szó szerint) a mező bármely részén, kis- és nagybetűtől függetlenül. */
export function containsText(q: string): ContainsText {
  return { contains: escapeLikePattern(q), mode: 'insensitive' };
}
