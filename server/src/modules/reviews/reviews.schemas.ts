// Az értékelések bemeneti sémája (Zod): az értékelés létrehozásának JSON-törzse
// (POST /api/photos/:id/reviews). A szerző a munkamenetből, a kép az útvonalból jön – a törzsben az
// ismeretlen mező hiba. A szöveges vélemény nem kötelező; ha van, a többsoros szövegek közös
// szabályait követi (L08, L13), nem állhat csak üresen megjelenő karakterekből, a rejtett karakterek
// kimaradnak belőle, és két bekezdés között legfeljebb egy üres sor marad.
// Forrás: Zod dokumentáció, https://zod.dev/ (adaptálva)
import { z } from 'zod';

import {
  clearable,
  multilineText,
  strictBody,
  textInput,
  whenValidSoFar,
} from '../../lib/schemas.js';
import { collapseBlankLines, hasVisibleCharacter, removeHiddenCharacters } from '../../lib/text.js';

/** A csillagok lehetséges száma (mint a reviews_rating_check megszorításban) */
const MIN_RATING = 1;
const MAX_RATING = 5;
/** A reviews.comment oszlop hossza */
const MAX_COMMENT_LENGTH = 1000;
const RATING_MESSAGE = `egész szám kell ${MIN_RATING} és ${MAX_RATING} között`;

// Egyetlen szabály, egyetlen üzenet: a tört, a határon kívüli és a mindkettőt sértő érték (pl.
// 1e21) is ugyanazt kapja
const ratingSchema = z
  .number({ error: (issue) => (issue.input === undefined ? 'kötelező' : RATING_MESSAGE) })
  .refine((rating) => Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING, {
    error: RATING_MESSAGE,
  });

// A láthatóságot a tisztítás előtt nézzük: a csak láthatatlan karakterekből álló szöveg hiba (nem
// csendben elnyelt vélemény)
const commentText = multilineText(textInput('szöveg kell'), MAX_COMMENT_LENGTH)
  .refine((text) => text === '' || hasVisibleCharacter(text), {
    error: 'látható karakter is kell benne',
    when: whenValidSoFar,
  })
  .transform((text) => collapseBlankLines(removeHiddenCharacters(text)).trim());

export const createReviewSchema = strictBody({
  rating: ratingSchema,
  comment: clearable(commentText).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
