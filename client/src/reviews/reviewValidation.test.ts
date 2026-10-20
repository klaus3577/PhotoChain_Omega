// Az értékelés űrlapjának kliensoldali ellenőrzése (L23): a szerver szabályai
// (server/src/modules/reviews/reviews.schemas.ts) – csillag 1-től 5-ig, a vélemény nem kötelező,
// legfeljebb 1000 kódpont, vezérlőkarakter nélkül (a sortörés megengedett), és ha van, látható
// karakterrel. A kérés törzse a szerver formájában készül.
import { describe, expect, it } from 'vitest';

import {
  MAX_COMMENT_LENGTH,
  normalizeComment,
  REVIEW_FIELDS,
  reviewInputOf,
  validateReview,
} from './reviewValidation';

const values = (overrides: Partial<Record<'rating' | 'comment', string>> = {}) => ({
  rating: '5',
  comment: '',
  ...overrides,
});

const RATING_ERROR = 'Válassz csillagot: 1-től 5-ig.';

describe('validateReview', () => {
  it('a mezők: a csillag és a vélemény', () => {
    expect(REVIEW_FIELDS).toEqual(['rating', 'comment']);
  });

  it('csillag nélkül vagy a tartományon kívül hiba; 1-től 5-ig érvényes', () => {
    expect(validateReview(values({ rating: '' }))).toEqual({ rating: RATING_ERROR });
    expect(validateReview(values({ rating: '0' }))).toEqual({ rating: RATING_ERROR });
    expect(validateReview(values({ rating: '6' }))).toEqual({ rating: RATING_ERROR });
    expect(validateReview(values({ rating: '3.5' }))).toEqual({ rating: RATING_ERROR });
    for (const rating of ['1', '2', '3', '4', '5']) {
      expect(validateReview(values({ rating }))).toEqual({});
    }
  });

  it('a vélemény nem kötelező; legfeljebb 1000 kódpont – a Windows-sortörés egy karakter, a széle levágva', () => {
    expect(validateReview(values({ comment: '   ' }))).toEqual({});
    expect(validateReview(values({ comment: 'é'.repeat(MAX_COMMENT_LENGTH) }))).toEqual({});
    expect(validateReview(values({ comment: `${'é'.repeat(MAX_COMMENT_LENGTH)} \r\n` }))).toEqual(
      {},
    );
    expect(validateReview(values({ comment: 'é'.repeat(MAX_COMMENT_LENGTH + 1) }))).toEqual({
      comment: 'A vélemény legfeljebb 1000 karakter lehet.',
    });
  });

  it('a vezérlőkarakter hiba (a sortörés és a tabulátor nem); a csak láthatatlan karakterből álló vélemény is hiba', () => {
    expect(validateReview(values({ comment: 'első sor\nmásodik\tsor' }))).toEqual({});
    expect(validateReview(values({ comment: `rossz${String.fromCodePoint(0)}` }))).toEqual({
      comment: 'A vélemény nem tartalmazhat vezérlőkaraktert.',
    });
    expect(validateReview(values({ comment: '\u200B\u200B' }))).toEqual({
      comment: 'A vélemény tartalmazzon látható karaktert is.',
    });
  });

  it('több hiba együtt is megjelenik', () => {
    expect(validateReview(values({ rating: '', comment: 'x'.repeat(1001) }))).toEqual({
      rating: RATING_ERROR,
      comment: 'A vélemény legfeljebb 1000 karakter lehet.',
    });
  });
});

describe('reviewInputOf', () => {
  it('a kérés törzse: a csillag szám, a vélemény normalizálva – üresen elmarad', () => {
    expect(reviewInputOf(values({ rating: '4', comment: ' Szép \r\nkép. ' }))).toEqual({
      rating: 4,
      comment: 'Szép \nkép.',
    });
    expect(reviewInputOf(values({ rating: '5', comment: '  ' }))).toEqual({ rating: 5 });
    expect(normalizeComment('a\r\nb\rc')).toBe('a\nb\nc');
  });
});
