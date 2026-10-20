// Az értékelés űrlapjának kliensoldali ellenőrzése (L23). A szabályok a szerveréi
// (server/src/modules/reviews/reviews.schemas.ts, lib/text.ts): a csillag egész szám 1-től 5-ig, a
// vélemény nem kötelező, legfeljebb 1000 kódpont, vezérlőkarakter nélkül (a sortörés és a tabulátor
// megengedett), és ha van, látható karakterrel – a csak láthatatlan jelekből álló szöveg a szerveren
// hiba volna. Kényelmi ellenőrzés: a felesleges körutat spórolja meg, a végső döntés a szerveré.
import { type FieldErrors, onlyErrors } from '../auth/validation';
import type { ReviewInput } from '../api/reviews.api';
import { codePointLength, CONTROL_CHARACTER_EXCEPT_NEWLINES, visibleText } from '../lib/text';

export const REVIEW_FIELDS = ['rating', 'comment'] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];
export type ReviewValues = Record<ReviewField, string>;

/** A csillagok tartománya (a szerver reviews_rating_check megszorítása) */
export const MIN_RATING = 1;
export const MAX_RATING = 5;
/** A reviews.comment oszlop hossza */
export const MAX_COMMENT_LENGTH = 1000;
/** A vélemény súgója – a korlát előre látszik (Nielsen H5) */
export const COMMENT_HINT = `Legfeljebb ${MAX_COMMENT_LENGTH} karakter: mi tetszett, mire használtad a képet.`;

const RATING_ERROR = `Válassz csillagot: ${MIN_RATING}-től ${MAX_RATING}-ig.`;
const RATINGS = new Set(
  Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, index) => String(MIN_RATING + index)),
);
/** Üresen megjelenő karakterek a láthatatlanok mellett: szóköz, Braille-üres, csere-karakter */
const BLANK_CHARACTERS = /[\s\u2800\uFFFD]/gu;

/** A vélemény, ahogy a szerver is olvassa: a Windows-sortörés egy karakter, a széle levágva. */
export const normalizeComment = (value: string): string => value.replace(/\r\n?/g, '\n').trim();

/** Van-e a szövegben megjelenő karakter (a szerver hasVisibleCharacter szabálya). */
const hasVisibleCharacter = (text: string): boolean =>
  visibleText(text).replace(BLANK_CHARACTERS, '') !== '';

const validateRating = (value: string): string | undefined =>
  RATINGS.has(value) ? undefined : RATING_ERROR;

function validateComment(value: string): string | undefined {
  const comment = normalizeComment(value);
  if (comment === '') return undefined;
  if (codePointLength(comment) > MAX_COMMENT_LENGTH)
    return `A vélemény legfeljebb ${MAX_COMMENT_LENGTH} karakter lehet.`;
  if (CONTROL_CHARACTER_EXCEPT_NEWLINES.test(comment))
    return 'A vélemény nem tartalmazhat vezérlőkaraktert.';
  if (!hasVisibleCharacter(comment)) return 'A vélemény tartalmazzon látható karaktert is.';
  return undefined;
}

export function validateReview(values: ReviewValues): FieldErrors<ReviewField> {
  return onlyErrors({
    rating: validateRating(values.rating),
    comment: validateComment(values.comment),
  });
}

/** A kérés törzse a szerver formájában: a csillag szám, a vélemény normalizálva – üresen elmarad. */
export function reviewInputOf(values: ReviewValues): ReviewInput {
  const comment = normalizeComment(values.comment);
  const rating = Number(values.rating);
  return comment === '' ? { rating } : { rating, comment };
}
