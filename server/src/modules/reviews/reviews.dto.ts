// Az értékelések kliensnek küldött alakja (DTO). Explicit mezőlistával kérjük le: a szerzőből csak az
// azonosító és a megjelenített név jön le az adatbázisból – az e-mail, a szerepkör és a tiltás soha.
// Forrás: Prisma ORM v7 – Select fields (explicit select, beágyazott relációk),
// https://www.prisma.io/docs/orm/v7/prisma-client/queries/select-fields (adaptálva)
import type { Prisma } from '../../generated/prisma/client.js';

export const REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  author: { select: { id: true, displayName: true } },
} as const satisfies Prisma.ReviewSelect;

export type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

export interface ReviewDto {
  id: string;
  /** 1–5 csillag */
  rating: number;
  comment: string | null;
  createdAt: Date;
  author: { id: string; displayName: string };
}

export function toReviewDto(review: ReviewRow): ReviewDto {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    author: { id: review.author.id, displayName: review.author.displayName },
  };
}
