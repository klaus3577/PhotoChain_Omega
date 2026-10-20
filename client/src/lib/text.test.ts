import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/http';
import { errorText, retryHint, toSentence } from './text';

describe('toSentence', () => {
  it('nagy kezdőbetű és mondatvégi pont; a meglévő írásjelet nem duplázza', () => {
    expect(toSentence('legalább 8 karakter kell')).toBe('Legalább 8 karakter kell.');
    expect(toSentence(' ékezetes kezdet ')).toBe('Ékezetes kezdet.');
    expect(toSentence('Kész.')).toBe('Kész.');
    expect(toSentence('Biztos?')).toBe('Biztos?');
    expect(toSentence('   ')).toBe('');
  });
});

describe('retryHint', () => {
  it('egy percen belül másodpercben, fölötte felfelé kerekített percben', () => {
    expect(retryHint(30)).toBe('Kb. 30 másodperc múlva próbálhatod újra.');
    expect(retryHint(60)).toBe('Kb. 1 perc múlva próbálhatod újra.');
    expect(retryHint(61)).toBe('Kb. 2 perc múlva próbálhatod újra.');
  });
});

describe('errorText', () => {
  it('a hiba üzenete mondatként; korlátozásnál (429) a várakozással', () => {
    expect(
      errorText(new ApiError(401, 'INVALID_CREDENTIALS', 'Hibás e-mail-cím vagy jelszó')),
    ).toBe('Hibás e-mail-cím vagy jelszó.');
    expect(
      errorText(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés', { retryAfterSeconds: 5 })),
    ).toBe('Túl sok kérés. Kb. 5 másodperc múlva próbálhatod újra.');
    expect(errorText(new ApiError(429, 'RATE_LIMITED', 'Túl sok kérés'))).toBe('Túl sok kérés.');
    // A túlterhelt szerver (503) is megmondja, mikor próbálható újra (L21 – feltöltés)
    expect(
      errorText(
        new ApiError(503, 'SERVER_BUSY', 'Túl sok egyidejű feltöltés', { retryAfterSeconds: 30 }),
      ),
    ).toBe('Túl sok egyidejű feltöltés. Kb. 30 másodperc múlva próbálhatod újra.');
    // A lánc elérhetetlensége (503) után a szerver egy percig nem is kérdezi a láncot (L24 – ellenőrzés)
    expect(
      errorText(
        new ApiError(503, 'CHAIN_UNAVAILABLE', 'A blokklánc most nem érhető el', {
          retryAfterSeconds: 60,
        }),
      ),
    ).toBe('A blokklánc most nem érhető el. Kb. 1 perc múlva próbálhatod újra.');
    // Más hibánál (pl. túlterhelt szerver) a várakozást az újrapróbálás kezeli, a szöveg nem ígér időt
    expect(
      errorText(
        new ApiError(503, 'SERVER_UNAVAILABLE', 'A szerver nem érhető el', {
          retryAfterSeconds: 5,
        }),
      ),
    ).toBe('A szerver nem érhető el.');
  });

  it('nem Error értékre és üres üzenetre általános üzenet (üres hibaszöveg nem jelenik meg)', () => {
    expect(errorText('szöveg')).toBe('Váratlan hiba történt.');
    expect(errorText(new ApiError(500, 'INTERNAL_ERROR', '  '))).toBe('Váratlan hiba történt.');
    expect(errorText(new ApiError(429, 'RATE_LIMITED', '', { retryAfterSeconds: 5 }))).toBe(
      'Váratlan hiba történt. Kb. 5 másodperc múlva próbálhatod újra.',
    );
  });
});
