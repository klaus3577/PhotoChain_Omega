// A kép értékeléseinek listája (GET /api/photos/:id/reviews – server/src/modules/reviews): oldalanként,
// a legújabb elöl, az összesítéssel (átlag, darabszám). A szöveg külső adat: a felület csak szövegként
// jeleníti meg (React), itt a formáját ellenőrizzük. Az értékelés írása (csak a vásárlónak) és a saját
// értékelés törlése (L23): POST /api/photos/:id/reviews, DELETE /api/reviews/:id.
import {
  expectValid,
  isIsoDate,
  isNullableString,
  isPageMeta,
  isRating,
  isRatingSummary,
  isRecord,
  isString,
  isUuid,
  type PageMeta,
  type RatingSummary,
} from './guards';
import { apiRequest, apiRequestEnvelope, pathSegment } from './http';

export interface Review {
  id: string;
  /** 1–5 csillag */
  rating: number;
  comment: string | null;
  createdAt: string;
  author: { id: string; displayName: string };
}

export interface ReviewPage {
  reviews: Review[];
  rating: RatingSummary;
  meta: PageMeta;
}

/** Egy oldalon ennyi értékelés: az adatlapon a többi a „További értékelések” gombbal tölthető be */
export const REVIEWS_PAGE_SIZE = 5;

/** Az értékelések az adatlap kulcsa alatt: az adatlap érvénytelenítése ezeket is frissíti. */
export const reviewKeys = {
  list: (photoId: string) => ['photos', 'detail', photoId, 'reviews'] as const,
};

export const isReview = (value: unknown): value is Review =>
  isRecord(value) &&
  isUuid(value.id) &&
  isRating(value.rating) &&
  isNullableString(value.comment) &&
  isIsoDate(value.createdAt) &&
  isRecord(value.author) &&
  isUuid(value.author.id) &&
  isString(value.author.displayName);

const isReviewList = (value: unknown): value is Omit<ReviewPage, 'meta'> =>
  isRecord(value) &&
  Array.isArray(value.reviews) &&
  value.reviews.every(isReview) &&
  isRatingSummary(value.rating);

export async function listReviews(
  photoId: string,
  page: number,
  signal?: AbortSignal,
): Promise<ReviewPage> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(REVIEWS_PAGE_SIZE) });
  const { data, meta } = await apiRequestEnvelope(
    `/photos/${pathSegment(photoId)}/reviews?${query}`,
    { signal },
  );
  const { reviews, rating } = expectValid(data, isReviewList);
  return { reviews, rating, meta: expectValid(meta, isPageMeta) };
}

/** A kérés törzse (POST /api/photos/:id/reviews): a csillag kötelező, a vélemény nem. */
export interface ReviewInput {
  rating: number;
  comment?: string;
}

const isReviewResponse = (value: unknown): value is { review: Review } =>
  isRecord(value) && isReview(value.review);

/** Új értékelés – csak a kép kifizetett vásárlójától, képenként egyszer (a szerver dönt: 403, 409). */
export async function createReview(photoId: string, input: ReviewInput): Promise<Review> {
  const data = await apiRequest<unknown>(`/photos/${pathSegment(photoId)}/reviews`, {
    method: 'POST',
    body: input,
  });
  return expectValid(data, isReviewResponse).review;
}

/** A saját értékelés törlése (DELETE /api/reviews/:id) – a szerzőnek (és az adminnak). */
export async function deleteReview(id: string): Promise<void> {
  await apiRequest<void>(`/reviews/${pathSegment(id)}`, { method: 'DELETE' });
}
