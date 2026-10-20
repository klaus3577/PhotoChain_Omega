// Az értékelések összesítése (a kép és a fotós átlaga): az átlag a csillagok összegéből és számából,
// pontosan két tizedesre kerekítve – a lebegőpontos átlag a felezőpontnál rossz irányba kerekíthet
// (41 / 40 = 1,025 → 1,03, nem 1,02).
import { describe, expect, it } from 'vitest';

import { NO_RATING, ratingsByPhoto, toRatingSummary } from './reviews.rating.js';

const summaryOf = (sum: number | null, count: number) =>
  toRatingSummary({ _sum: { rating: sum }, _count: { _all: count } });

const group = (photoId: string, sum: number, count: number) => ({
  photoId,
  _sum: { rating: sum },
  _count: { _all: count },
});

describe('toRatingSummary', () => {
  it('az átlag két tizedesre kerekítve, a felezőpontnál felfelé', () => {
    expect(summaryOf(41, 40)).toEqual({ average: 1.03, count: 40 });
    expect(summaryOf(87, 40)).toEqual({ average: 2.18, count: 40 });
    expect(summaryOf(13, 3)).toEqual({ average: 4.33, count: 3 });
    expect(summaryOf(14, 3)).toEqual({ average: 4.67, count: 3 });
    expect(summaryOf(9, 2)).toEqual({ average: 4.5, count: 2 });
    expect(summaryOf(5, 1)).toEqual({ average: 5, count: 1 });
  });

  it('értékelés nélkül az átlag null', () => {
    expect(summaryOf(null, 0)).toEqual({ average: null, count: 0 });
    expect(NO_RATING).toEqual({ average: null, count: 0 });
  });
});

describe('ratingsByPhoto', () => {
  it('a képenként csoportosított összesítésből a kép azonosítója szerinti átlag és darabszám', () => {
    const ratings = ratingsByPhoto([group('a', 9, 2), group('b', 13, 3)]);

    expect(ratings.get('a')).toEqual({ average: 4.5, count: 2 });
    expect(ratings.get('b')).toEqual({ average: 4.33, count: 3 });
    // Az értékelés nélküli kép nincs a csoportok között
    expect(ratings.get('c')).toBeUndefined();
  });
});
