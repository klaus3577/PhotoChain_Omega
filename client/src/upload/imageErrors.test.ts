// A szerver kép- és kérésformátum-hibáinak elhelyezése (L21 feltöltés, L24 ellenőrzés): a kép hibája
// mondatként a fogadóterülethez, a validáció „image” mezője szintén; más hiba nem a képről szól.
import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/http';
import { IMAGE_ERROR_CODES, imageErrorOf, RETRY_CODES, RETRY_TEXT } from './imageErrors';

describe('imageErrorOf', () => {
  it('a kép hibakódjai a szerver üzenetével, mondatként', () => {
    expect([...IMAGE_ERROR_CODES]).toEqual([
      'IMAGE_TOO_SMALL',
      'IMAGE_TOO_LARGE',
      'LOW_DETAIL_IMAGE',
      'UNSUPPORTED_IMAGE',
      'PAYLOAD_TOO_LARGE',
    ]);
    expect(imageErrorOf(new ApiError(400, 'IMAGE_TOO_SMALL', 'a kép túl kicsi'))).toBe(
      'A kép túl kicsi.',
    );
    expect(imageErrorOf(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A fájl túl nagy'))).toBe(
      'A fájl túl nagy.',
    );
  });

  it('a validációs hiba „image” mezője is a képről szól', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', {
      details: [{ path: 'image', message: 'képfájl kötelező' }],
    });

    expect(imageErrorOf(error)).toBe('Képfájl kötelező.');
  });

  it('más hiba (korlátozás, más mező validációja) nem a képről szól', () => {
    expect(imageErrorOf(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés'))).toBeUndefined();
    expect(
      imageErrorOf(
        new ApiError(400, 'VALIDATION_ERROR', 'Érvénytelen bemenet', {
          details: [{ path: 'title', message: 'legalább 3 karakter kell' }],
        }),
      ),
    ).toBeUndefined();
  });

  it('a hibás vagy megszakadt kérés kódjai a felhasználónak szóló szöveget kapják', () => {
    expect([...RETRY_CODES]).toEqual(['INVALID_UPLOAD', 'UNSUPPORTED_MEDIA_TYPE']);
    expect(RETRY_TEXT).toBe('A kérés nem érkezett meg hiánytalanul – próbáld újra.');
  });
});
