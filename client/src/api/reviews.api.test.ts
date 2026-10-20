// A kép értékeléseinek listája (GET /api/photos/:id/reviews): oldalanként, az összesítéssel (átlag,
// darabszám). A szöveg külső adat: csak szövegként jelenik meg (React), itt a formáját ellenőrizzük.
import { describe, expect, it } from 'vitest';

import { jsonResponse, stubFetch } from '../test/fetch';
import { REVIEW_ID } from '../test/orders';
import { PHOTO_ID, review, reviewsResponse } from '../test/photos';
import { createReview, deleteReview, listReviews, REVIEWS_PAGE_SIZE } from './reviews.api';

describe('listReviews', () => {
  it('a kért oldalt kéri (oldalanként REVIEWS_PAGE_SIZE), és az értékeléseket az összesítéssel adja', async () => {
    const fetchMock = stubFetch(
      reviewsResponse([review()], {
        rating: { average: 4.5, count: 6 },
        meta: { page: 2, total: 6 },
      }),
    );

    await expect(listReviews(PHOTO_ID, 2)).resolves.toEqual({
      reviews: [review()],
      rating: { average: 4.5, count: 6 },
      meta: { page: 2, pageSize: 5, total: 6, totalPages: 2 },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/photos/${PHOTO_ID}/reviews?page=2&pageSize=${REVIEWS_PAGE_SIZE}`,
    );
  });

  it('a szöveg nélküli értékelés és az értékelés nélküli kép is érvényes', async () => {
    stubFetch(reviewsResponse([review({ comment: null })]), reviewsResponse([]));

    await expect(listReviews(PHOTO_ID, 1)).resolves.toMatchObject({
      reviews: [{ comment: null }],
    });
    await expect(listReviews(PHOTO_ID, 1)).resolves.toMatchObject({
      reviews: [],
      rating: { average: null, count: 0 },
    });
  });

  it('a hibás értékelést váratlan válasznak tekinti', async () => {
    const responses = [
      reviewsResponse([review({ rating: 6 })]),
      reviewsResponse([review({ rating: 4.5 })]),
      reviewsResponse([review({ author: { id: 'x' } })]),
      reviewsResponse([review({ id: '1' })]),
      reviewsResponse([review({ author: { id: '2', displayName: 'Vásárló Vera' } })]),
      reviewsResponse([review({ comment: 42 })]),
    ];
    stubFetch(...responses);

    for (let i = 0; i < responses.length; i += 1) {
      await expect(listReviews(PHOTO_ID, 1)).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE',
      });
    }
  });
});

describe('createReview', () => {
  it('POST /api/photos/:id/reviews a csillaggal és a véleménnyel; a válasz az ellenőrzött értékelés', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { data: { review: review() } }));

    await expect(
      createReview(PHOTO_ID, {
        rating: 5,
        comment: 'Gyönyörű fények, a nyomtatott változat is remek lett.',
      }),
    ).resolves.toEqual(review());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/photos/${PHOTO_ID}/reviews`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      rating: 5,
      comment: 'Gyönyörű fények, a nyomtatott változat is remek lett.',
    });
  });

  it('vélemény nélkül csak a csillag megy; a hibás alakú válasz váratlan', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, { data: { review: review({ comment: null }) } }),
      jsonResponse(201, { data: { review: review({ rating: 0 }) } }),
    );

    await expect(createReview(PHOTO_ID, { rating: 4 })).resolves.toMatchObject({ comment: null });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ rating: 4 });
    await expect(createReview(PHOTO_ID, { rating: 4 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('deleteReview', () => {
  it('DELETE /api/reviews/:id – a válasz üres (204)', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await expect(deleteReview(REVIEW_ID)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/reviews/${REVIEW_ID}`);
    expect(init?.method).toBe('DELETE');
  });
});
