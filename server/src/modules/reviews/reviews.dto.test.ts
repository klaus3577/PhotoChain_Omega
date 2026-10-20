// Az értékelések kliensnek küldött alakja (DTO): explicit mezőlista – a szerzőből csak az azonosító
// és a megjelenített név jön le az adatbázisból (e-mail, szerepkör, tiltás nem).
import { describe, expect, it } from 'vitest';

import { REVIEW_SELECT, type ReviewRow, toReviewDto } from './reviews.dto.js';

const CREATED_AT = new Date('2026-10-05T10:00:00.000Z');

const row: ReviewRow = {
  id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  rating: 4,
  comment: 'Szép fények.',
  createdAt: CREATED_AT,
  author: { id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', displayName: 'Vásárló Vera' },
};

describe('toReviewDto', () => {
  it('a csillagok, a szöveg, az időpont és a szerző azonosítója, neve', () => {
    expect(toReviewDto(row)).toEqual({
      id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
      rating: 4,
      comment: 'Szép fények.',
      createdAt: CREATED_AT,
      author: { id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', displayName: 'Vásárló Vera' },
    });
  });

  it('szöveg nélküli értékelés: a comment null', () => {
    expect(toReviewDto({ ...row, comment: null }).comment).toBeNull();
  });
});

describe('REVIEW_SELECT', () => {
  it('a szerzőnek csak az azonosítója és a neve jön le (e-mail, jelszó-hash, szerepkör, tiltás nem)', () => {
    expect(REVIEW_SELECT.author.select).toEqual({ id: true, displayName: true });
    expect(REVIEW_SELECT).not.toHaveProperty('authorId');
    expect(REVIEW_SELECT).not.toHaveProperty('photoId');
  });
});
