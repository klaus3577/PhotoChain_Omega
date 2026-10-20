// Az értékelés létrehozásának JSON-törzse: 1–5 csillag (egész szám), és nem kötelező szöveges
// vélemény (legfeljebb 1000 karakter, vezérlő- és láthatatlan karakterek nélkül). A szerző, a kép és
// az időpont nem a klienstől jön: az ismeretlen mező hiba.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { createReviewSchema } from './reviews.schemas.js';

const NUL = String.fromCodePoint(0);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e);
const THUMBS_UP = String.fromCodePoint(0x1f44d);
/** Címke-karakter: láthatatlan, de géppel olvasható „A” betű */
const TAG_LETTER_A = String.fromCodePoint(0xe0041);
const RATING_MESSAGE = 'egész szám kell 1 és 5 között';

/** A hibák mezőnként (a gyökérszintű hiba kulcsa üres szöveg). */
function issuesOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
  );
}

describe('createReviewSchema – csillagok', () => {
  it('1 és 5 közötti egész szám', () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(createReviewSchema.parse({ rating })).toEqual({ rating });
    }
  });

  it('hiányzó, tört, határon kívüli vagy nem szám érték: hiba', () => {
    expect(issuesOf(createReviewSchema, {})).toEqual({ rating: 'kötelező' });
    for (const rating of [0, 6, -1, 4.5, '5', null, true, [5]]) {
      expect(issuesOf(createReviewSchema, { rating })).toEqual({ rating: RATING_MESSAGE });
    }
  });

  it('egy hibás értékhez egyetlen hibaüzenet – a több szabályt is sértőhöz sem kettő', () => {
    for (const rating of [1e21, -1.5, 7.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = createReviewSchema.safeParse({ rating });
      expect(result.error?.issues, String(rating)).toHaveLength(1);
    }
  });
});

describe('createReviewSchema – szöveges vélemény', () => {
  it('nem kötelező: a hiányzó, a null és az üres (csak szóközös) szöveg egyaránt null', () => {
    expect(createReviewSchema.parse({ rating: 5 })).toEqual({ rating: 5 });
    for (const comment of [null, '', '   \n ']) {
      expect(createReviewSchema.parse({ rating: 5, comment })).toEqual({
        rating: 5,
        comment: null,
      });
    }
  });

  it('a sortörések LF alakban, a szöveg a szélein vágva; írásjel és emoji is elég', () => {
    expect(
      createReviewSchema.parse({ rating: 4, comment: '  Szép fények.\r\nAjánlom!  ' }),
    ).toEqual({ rating: 4, comment: 'Szép fények.\nAjánlom!' });
    expect(createReviewSchema.parse({ rating: 5, comment: THUMBS_UP })).toEqual({
      rating: 5,
      comment: THUMBS_UP,
    });
  });

  it('legfeljebb 1000 karakter', () => {
    expect(createReviewSchema.parse({ rating: 3, comment: 'a'.repeat(1000) }).comment).toHaveLength(
      1000,
    );
    expect(issuesOf(createReviewSchema, { rating: 3, comment: 'a'.repeat(1001) })).toEqual({
      comment: 'legfeljebb 1000 karakter lehet',
    });
  });

  it('vezérlőkarakter (NUL – a PostgreSQL nem tudja tárolni) és írásirány-váltó: hiba', () => {
    for (const comment of [`jó${NUL}kép`, `jó${RIGHT_TO_LEFT_OVERRIDE}kép`]) {
      expect(issuesOf(createReviewSchema, { rating: 3, comment })).toEqual({
        comment: 'vezérlőkaraktert nem tartalmazhat',
      });
    }
  });

  it('a csak láthatatlan karakterekből álló szöveg hiba (üresen jelenne meg)', () => {
    for (const comment of [
      ZERO_WIDTH_SPACE.repeat(3),
      TAG_LETTER_A.repeat(5),
      // a JSON-ból érkező párosítatlan helyettesítő: cserekarakter lenne belőle, tartalom nélkül
      String.fromCodePoint(0xd800),
    ]) {
      expect(issuesOf(createReviewSchema, { rating: 3, comment })).toEqual({
        comment: 'látható karakter is kell benne',
      });
    }
  });

  it('a látható szövegben rejtett karakterek kimaradnak, és legfeljebb egy üres sor marad', () => {
    const parsed = createReviewSchema.parse({
      rating: 4,
      comment: `Szép${TAG_LETTER_A.repeat(5)}${ZERO_WIDTH_SPACE} fények.\n\n\n\n\nAjánlom!${ZERO_WIDTH_SPACE}`,
    });

    expect(parsed.comment).toBe('Szép fények.\n\nAjánlom!');
  });

  it('nem szöveg: hiba', () => {
    for (const comment of [5, true, ['jó'], { szoveg: 'jó' }]) {
      expect(issuesOf(createReviewSchema, { rating: 3, comment })).toEqual({
        comment: 'szöveg kell',
      });
    }
  });
});

describe('createReviewSchema – a törzs', () => {
  it('a szerző, a kép és az időpont nem a klienstől jön: az ismeretlen mező hiba', () => {
    expect(
      issuesOf(createReviewSchema, {
        rating: 5,
        authorId: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
        createdAt: '2020-01-01',
      }),
    ).toEqual({ '': 'ismeretlen mező: authorId, createdAt' });
  });

  it('a nem objektum törzs hiba', () => {
    for (const body of [null, [], 'szöveg', 5, true]) {
      expect(issuesOf(createReviewSchema, body)).toEqual({ '': 'JSON-objektum kell' });
    }
  });
});
